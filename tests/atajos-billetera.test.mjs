import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { webcrypto } from "node:crypto";
import vm from "node:vm";
import ts from "typescript";

// Prueba el código real de la Edge Function, sin desplegar ni tocar datos de Supabase.
// TypeScript se transpila en memoria y se inyectan dobles de Supabase y de Deno.
const src = readFileSync(new URL("../supabase/functions/smooth-handler/index.ts", import.meta.url), "utf8");
const js = ts.transpileModule(src, { compilerOptions: {
  module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
}}).outputText;

const USUARIO = "11111111-1111-4111-8111-111111111111";
const AMIGO = "22222222-2222-4222-8222-222222222222";
const CUIL = "20123456789";
const TOKEN = "a".repeat(64);
const TOKEN_AMIGO = "b".repeat(64);

function pdfMercadoPago({ cuil = CUIL, origen = "Mercado Pago", destino = "Mercado Pago", extra = "", etiqueta = "Comprobante de pago" } = {}) {
  return [
    etiqueta,
    "Domingo, 18 de octubre de 2026, 13:45 hs.",
    "",
    "$ 17.50000",
    "",
    "Origen y destino",
    "Persona Ficticia",
    "CUIL: " + cuil,
    origen,
    "",
    "Tienda Prueba",
    "CUIT: 30987654321",
    destino,
    "",
    extra,
    "N.° de operación de Mercado Pago",
    "999000111222",
  ].join("\n");
}

function dbSimulada(cuentas = [], existente = null, opciones = {}) {
  const movimientos = [];
  const categoria = {id: "cat-ejemplo", activa: true};
  const db = {
    movimientos,
    from(tabla) {
      const filtros = [];
      return {
        select() {return this;},
        eq(campo, valor) {filtros.push([campo,valor]);return this;},
        async maybeSingle() {
          if (tabla !== "movimientos") throw new Error("Query inesperada");
          return { data: existente, error: null };
        },
        async single() {
          if (tabla !== "categorias") throw new Error("Query inesperada");
          return { data: categoria, error: null };
        },
        async upsert() { return {error: null}; },
        async insert(datos) {
          if (tabla === "movimientos" && datos.cuenta_origen_id && opciones.errorFKCuenta) {
            return {error:{code:"23503"}};
          }
          if (tabla === "movimientos") movimientos.push(datos);
          return {error:null};
        },
        // Postgrest: await sobre query devuelve {data,error}.
        then(ok, fail) {
          if (tabla === "cuentas" && opciones.errorRedCuentas) {
            return Promise.reject(new Error("Fallo simulado de conexión")).then(ok,fail);
          }
          const data = tabla === "cuentas" ? cuentas.filter(c =>
            filtros.every(([k,v]) => c[k] === v)) : [];
          return Promise.resolve({data, error:null}).then(ok, fail);
        }
      };
    }
  };
  return db;
}

function servidor({ cuentas = [], token = TOKEN, extras = {}, existente = null,
                    errorRedCuentas = false, errorFKCuenta = false } = {}) {
  const base = dbSimulada(cuentas, existente, {errorRedCuentas,errorFKCuenta});
  const env = {
    MERCA_INGEST_USERS: JSON.stringify({[USUARIO]: TOKEN,[AMIGO]: TOKEN_AMIGO}),
    SUPABASE_URL: "https://example.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY: "NO_ES_UN_SECRET_REAL",
    ...extras,
  };
  let handler;
  const contexto = vm.createContext({
    exports: {}, require(modulo) {
      assert.equal(modulo, "npm:@supabase/supabase-js@2");
      return {createClient: () => base};
    },
    Deno: { env: {get: k => env[k]}, serve: fn => {handler = fn;} },
    Request, Response, TextEncoder, crypto: webcrypto,
    console: {error() {}, warn() {}},
  });
  vm.runInContext(js + "\n;globalThis.mercaTest = { identificarBilleteraOrigen, resolverBilleteraOrigen, buscarDestinatario, normalizarMonto, esPlantillaMontoMercadoPago, clasificarFormatoImporte };\n", contexto);
  const hooks = contexto.mercaTest;
  async function enviar(texto_ocr, categoria = "Comida") {
    const request = new Request("https://example.supabase.co/functions/v1/smooth-handler", {
      method: "POST",
      headers: {"x-merca-token": token, "content-type": "application/json"},
      body: JSON.stringify({texto_ocr,categoria}),
    });
    return await handler(request);
  }
  return {base, hooks, enviar};
}

const cuenta = (id, user_id = USUARIO, activa = true, nombre = "Mercado Pago") =>
  ({id,user_id,activa,nombre});

test("identifica la institución emisora en los dos comprobantes MP probados", () => {
  const {hooks} = servidor();
  const grido = pdfMercadoPago();
  const verduleria = pdfMercadoPago({extra:"   "});
  assert.equal(hooks.identificarBilleteraOrigen(grido),"Mercado Pago");
  assert.equal(hooks.identificarBilleteraOrigen(verduleria),"Mercado Pago");
});

test("la entidad del destino nunca se toma como la de origen", async () => {
  const s = servidor({cuentas:[cuenta("mp")]});
  const pago = pdfMercadoPago({origen:"Banco Provincia", destino:"Mercado Pago"});
  assert.equal(s.hooks.identificarBilleteraOrigen(pago),"Banco Provincia");
  assert.equal((await s.enviar(pago)).status,200);
  assert.equal(s.base.movimientos[0].cuenta_origen_id,undefined);
});

test("banco explícito en origen se relaciona con la cuenta correspondiente", async () => {
  const s = servidor({cuentas:[cuenta("provincia",USUARIO,true,"Banco Provincia")]});
  const pago = pdfMercadoPago({origen:"Banco Provincia", destino:"Mercado Pago"});
  assert.equal((await s.enviar(pago)).status,200);
  assert.equal(s.base.movimientos[0].cuenta_origen_id,"provincia");
});

test("transferencia saliente MP conserva la regla de gasto preexistente", async () => {
  const s = servidor({cuentas:[cuenta("mp-cuenta")]});
  assert.equal((await s.enviar(pdfMercadoPago({etiqueta:"Comprobante de transferencia"}))).status,200);
  assert.equal(s.base.movimientos[0].cuenta_origen_id,"mp-cuenta");
  assert.equal(s.base.movimientos[0].tipo,"gasto");
});

test("no requiere CUIL ni configuración nueva para identificar un origen", async () => {
  const sinIdentidad=pdfMercadoPago().replace("CUIL: " + CUIL + "\n","");
  const s = servidor({cuentas:[cuenta("mp")]});
  assert.equal(s.hooks.identificarBilleteraOrigen(sinIdentidad),"Mercado Pago");
  assert.equal((await s.enviar(sinIdentidad)).status,200);
  assert.equal(s.base.movimientos[0].cuenta_origen_id,"mp");
});

test("puede tomar billeteras de una sección Origen claramente delimitada", () => {
  const {hooks} = servidor();
  const recibo=[
    "Comprobante de transferencia",
    "Origen",
    "Cliente de prueba",
    "Prex",
    "Destino",
    "Comercio final",
    "Mercado Pago",
  ].join("\n");
  assert.equal(hooks.identificarBilleteraOrigen(recibo),"Prex");
});

test("puede leer campos explícitos de origen sin interpretar el destino", () => {
  const {hooks} = servidor();
  assert.equal(hooks.identificarBilleteraOrigen("Comprobante de pago\nBilletera de origen: Ualá\nBilletera de destino: Mercado Pago"),"Ualá");
});

test("fuente de fondos con tarjeta/cuotas se conserva sin asignar", () => {
  const {hooks} = servidor();
  for(const extra of ["Medio de pago: Tarjeta Visa","Tarjeta de crédito","Pago con débito","6 cuotas"]) {
    assert.equal(hooks.identificarBilleteraOrigen(pdfMercadoPago({extra})),null);
  }
});

test("si no hay origen claro, no se infiere billetera del logo ni del destino", () => {
  const {hooks} = servidor();
  assert.equal(hooks.identificarBilleteraOrigen("Mercado Pago\nComprobante de pago\n$ 100"),null);
  assert.equal(hooks.identificarBilleteraOrigen(pdfMercadoPago({etiqueta:"Recibo de compra"}).replace("Origen y destino","Datos de operación")),null);
  assert.equal(hooks.identificarBilleteraOrigen("Comprobante de transferencia\nOrigen y destino\nCliente Prueba\nComercio Final\nMercado Pago"),null);
});

test("si el bloque de origen tiene dos instituciones, no asigna arbitrariamente", () => {
  const {hooks} = servidor();
  assert.equal(hooks.identificarBilleteraOrigen("Comprobante de pago\nOrigen\nMercado Pago\nPrex\nDestino\nComercio final"),null);
});

test("solo acepta una cuenta activa exacta del usuario; jamás la de otro", async () => {
  const s = servidor({cuentas:[
    cuenta("mp-tercero",AMIGO),
    cuenta("mp-propia",USUARIO),
    cuenta("mercado-pago-ahorros",USUARIO,true,"Mercado Pago Ahorros"),
  ]});
  const respuesta = await s.enviar(pdfMercadoPago());
  assert.equal(respuesta.status,200);
  assert.equal(await respuesta.text(),"Movimiento cargado exitosamente");
  assert.equal(s.base.movimientos[0].cuenta_origen_id,"mp-propia");
  assert.equal(s.base.movimientos[0].tipo,"gasto");
  assert.equal(s.base.movimientos[0].estado,"confirmado");
  assert.equal(s.base.movimientos[0].categoria_id,"cat-ejemplo");
  assert.equal(s.base.movimientos[0].destinatario,"Tienda Prueba");
});

test("si hay dos cuentas con el mismo nombre o la cuenta está inactiva, no asigna", async () => {
  for (const cuentas of [[cuenta("a"),cuenta("b")], [cuenta("a",USUARIO,false)]]) {
    const s=servidor({cuentas});
    assert.equal((await s.enviar(pdfMercadoPago())).status,200);
    assert.equal(s.base.movimientos[0].cuenta_origen_id,undefined);
  }
});

test("cada token solo permite vincular la billetera del usuario correspondiente", async () => {
  const s=servidor({cuentas:[cuenta("mp-ajena",USUARIO),cuenta("mp-amigo",AMIGO)],token:TOKEN_AMIGO});
  const resultado=await s.enviar(pdfMercadoPago());
  assert.equal(resultado.status,200);
  assert.equal(s.base.movimientos[0].user_id,AMIGO);
  assert.equal(s.base.movimientos[0].cuenta_origen_id,"mp-amigo");
});

test("un comprobante repetido no reemplaza billeteras manuales ni agrega movimientos", async () => {
  const actual = {id:"mov-previo", estado:"confirmado",destinatario:"Tienda Prueba",
                  cuenta_origen_id:"elegida-manualmente"};
  const s=servidor({cuentas:[cuenta("mp")],existente:actual});
  assert.equal((await s.enviar(pdfMercadoPago())).status,200);
  assert.equal(s.base.movimientos.length,0);
  assert.equal(actual.cuenta_origen_id,"elegida-manualmente");
});

test("errores o ausencias de billetera no impiden registrar el gasto existente", async () => {
  const s=servidor({cuentas:[]});
  const resultado=await s.enviar(pdfMercadoPago());
  assert.equal(resultado.status,200);
  assert.equal(s.base.movimientos.length,1);
  assert.equal(s.base.movimientos[0].cuenta_origen_id,undefined);
  assert.equal(s.base.movimientos[0].monto,"17500.00");
});

test("una excepción consultando billeteras no debe impedir guardar un comprobante", async () => {
  const s = servidor({cuentas:[cuenta("mp")],errorRedCuentas:true});
  const respuesta=await s.enviar(pdfMercadoPago({etiqueta:"Comprobante de transferencia"}));
  assert.equal(respuesta.status,200);
  assert.equal(await respuesta.text(),"Movimiento cargado exitosamente");
  assert.equal(s.base.movimientos.length,1);
  assert.equal(s.base.movimientos[0].cuenta_origen_id,undefined);
});

test("si la FK de billetera fue invalidada, se registra igualmente sin asignar", async () => {
  const s=servidor({cuentas:[cuenta("mp")],errorFKCuenta:true});
  const respuesta=await s.enviar(pdfMercadoPago());
  assert.equal(respuesta.status,200);
  assert.equal(s.base.movimientos.length,1);
  assert.equal(s.base.movimientos[0].cuenta_origen_id,undefined);
});

test("fecha o monto ambiguo mantiene respuesta de error y no inserta datos", async () => {
  const s=servidor({cuentas:[cuenta("mp")]});
  const variasFechas=pdfMercadoPago().replace("18 de octubre de 2026","18 de octubre de 2026, fecha original 19 de octubre de 2026");
  const respuesta=await s.enviar(variasFechas);
  assert.equal(respuesta.status,422);
  assert.equal(await respuesta.text(),"Error al cargar el movimiento");
  assert.equal(s.base.movimientos.length,0);
});

test("un PDF de transferencia MP con miles y centavos unidos no requiere leer el número de operación para el monto", async () => {
  const s=servidor({cuentas:[cuenta("mp")]});
  const sinReferencia=pdfMercadoPago({etiqueta:"Comprobante de transferencia"})
    .replace("N.° de operación de Mercado Pago\n999000111222","Referencia de transferencia\n999000111222");
  assert.equal(s.hooks.esPlantillaMontoMercadoPago(sinReferencia),true);
  assert.equal(s.hooks.normalizarMonto("$ 17.50000",sinReferencia),"17500.00");
  const res=await s.enviar(sinReferencia);
  assert.equal(res.status,200);
  assert.equal(s.base.movimientos.length,1);
  assert.equal(s.base.movimientos[0].monto,"17500.00");
  assert.equal(s.base.movimientos[0].cuenta_origen_id,"mp");
});

test("importe sin separador sigue rechazándose por ambigüedad aunque sea MP", async () => {
  const s=servidor({cuentas:[cuenta("mp")]});
  const ambiguo=pdfMercadoPago({etiqueta:"Comprobante de transferencia"}).replace("$ 17.50000","$ 50000");
  assert.equal(s.hooks.normalizarMonto("$ 50000",ambiguo),null);
  assert.equal(s.hooks.clasificarFormatoImporte("$ 50000",ambiguo),"SIN_SEPARADOR_AMBIGUO");
  const res=await s.enviar(ambiguo);
  assert.equal(res.status,422);
  assert.equal(s.base.movimientos.length,0);
});

test("no interpreta centavos unidos de un documento no reconocido", () => {
  const s=servidor();
  const otro="Recibo genérico\nOrigen y destino\nMercado Pago\n$ 17.50000";
  assert.equal(s.hooks.esPlantillaMontoMercadoPago(otro),false);
  assert.equal(s.hooks.normalizarMonto("$ 17.50000",otro),null);
});
