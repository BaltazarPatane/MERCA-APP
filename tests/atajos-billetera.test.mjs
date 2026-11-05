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

function dbSimulada(cuentas = []) {
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
          return { data: null, error: null };
        },
        async single() {
          if (tabla !== "categorias") throw new Error("Query inesperada");
          return { data: categoria, error: null };
        },
        async upsert() { return {error: null}; },
        async insert(datos) {
          if (tabla === "movimientos") movimientos.push(datos);
          return {error:null};
        },
        // Postgrest: await sobre query devuelve {data,error}.
        then(ok, fail) {
          const data = tabla === "cuentas" ? cuentas.filter(c =>
            filtros.every(([k,v]) => c[k] === v)) : [];
          return Promise.resolve({data, error:null}).then(ok, fail);
        }
      };
    }
  };
  return db;
}

function servidor({ cuentas = [], cuils = {[USUARIO]: CUIL}, token = TOKEN,
                    extras = {} } = {}) {
  const base = dbSimulada(cuentas);
  const env = {
    MERCA_INGEST_USERS: JSON.stringify({[USUARIO]: TOKEN,[AMIGO]: TOKEN_AMIGO}),
    MERCA_CUILS_POR_USUARIO: cuils === null ? undefined : JSON.stringify(cuils),
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
    console: {error() {}},
  });
  vm.runInContext(js + "\n;globalThis.mercaTest = { identificarOrigenMercadoPago, resolverBilleteraOrigen, buscarDestinatario };\n", contexto);
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

test("reconoce el bloque emisor de los dos comprobantes MP probados", () => {
  const {hooks} = servidor();
  const grido = pdfMercadoPago();
  const verduleria = pdfMercadoPago({extra: "   "});
  assert.equal(hooks.identificarOrigenMercadoPago(grido)?.entidad,"mercado_pago");
  assert.equal(hooks.identificarOrigenMercadoPago(verduleria)?.cuil,CUIL);
});

test("el Mercado Pago del destinatario jamás se toma como origen", () => {
  const {hooks} = servidor();
  const pago = pdfMercadoPago({origen:"Banco Provincia", destino:"Mercado Pago"});
  assert.equal(hooks.identificarOrigenMercadoPago(pago),null);
});

test("una transferencia MP saliente utiliza el mismo reconocimiento del origen", async () => {
  const s=servidor({cuentas:[cuenta("mp-cuenta")]});
  assert.equal((await s.enviar(pdfMercadoPago({etiqueta:"Comprobante de transferencia"}))).status,200);
  assert.equal(s.base.movimientos[0].cuenta_origen_id,"mp-cuenta");
  // Regla preexistente de Atajos: sigue siendo gasto, no transferencia interna.
  assert.equal(s.base.movimientos[0].tipo,"gasto");
});

test("tarjetas y financiación hacen que el origen quede sin asignar", () => {
  const {hooks} = servidor();
  for(const extra of ["Medio de pago: Tarjeta Visa", "Tarjeta de crédito", "Pago con débito", "6 cuotas"]) {
    assert.equal(hooks.identificarOrigenMercadoPago(pdfMercadoPago({extra})),null);
  }
});

test("no adivina billeteras a partir de logos, emisores ni formatos incompletos", () => {
  const {hooks} = servidor();
  assert.equal(hooks.identificarOrigenMercadoPago("Mercado Pago\nComprobante de pago\n$ 100"),null);
  assert.equal(hooks.identificarOrigenMercadoPago(pdfMercadoPago({etiqueta:"Recibo de compra"})),null);
  assert.equal(hooks.identificarOrigenMercadoPago(pdfMercadoPago().replace("CUIL:", "CBU:")),null);
});

test("no asigna si el CUIL de la persona que pagó no coincide con el usuario", async () => {
  const s = servidor({cuentas:[cuenta("mp")]});
  const respuesta = await s.enviar(pdfMercadoPago({cuil:"20999888777"}));
  assert.equal(respuesta.status,200);
  assert.equal(s.base.movimientos.length,1);
  assert.equal(s.base.movimientos[0].cuenta_origen_id,undefined);
});

test("no asigna si la configuración de CUIL todavía no existe", async () => {
  const s = servidor({cuentas:[cuenta("mp")],cuils:null});
  assert.equal((await s.enviar(pdfMercadoPago())).status,200);
  assert.equal(s.base.movimientos[0].cuenta_origen_id,undefined);
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

test("el token de otro usuario no autoriza vincular una cuenta propia", async () => {
  const s=servidor({cuentas:[cuenta("mp-amigo",AMIGO)],token:TOKEN_AMIGO,
    cuils:{[USUARIO]: CUIL,[AMIGO]:"20999888777"}});
  const resultado=await s.enviar(pdfMercadoPago());
  assert.equal(resultado.status,200);
  assert.equal(s.base.movimientos[0].user_id,AMIGO);
  assert.equal(s.base.movimientos[0].cuenta_origen_id,undefined);
});

test("errores o ausencias de billetera no impiden registrar el gasto existente", async () => {
  const s=servidor({cuentas:[]});
  const resultado=await s.enviar(pdfMercadoPago());
  assert.equal(resultado.status,200);
  assert.equal(s.base.movimientos.length,1);
  assert.equal(s.base.movimientos[0].cuenta_origen_id,undefined);
  assert.equal(s.base.movimientos[0].monto,"17500.00");
});
