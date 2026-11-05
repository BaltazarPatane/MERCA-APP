import { createClient } from "npm:@supabase/supabase-js@2";

/*
MERCA · receptor de comprobantes · v12
Receptor multiusuario + asociación automática de la billetera de origen.

- Mantener la URL, el token y el JSON del Atajo existente.
- No requiere CUIL, secretos adicionales ni cambios en Supabase SQL.
- Solo se asigna una cuenta si aparece como entidad de ORIGEN explícita
  en el comprobante y coincide con una sola cuenta activa del usuario.
- Si el comprobante no permite identificarla con claridad, se deja Sin asignar.
- Los comprobantes con tarjetas o financiación tampoco se asignan automáticamente.
- Las transferencias recibidas desde Atajos siguen siendo gastos (regla existente).
- Los comprobantes duplicados y las asignaciones manuales se conservan.
- Mantener la configuración y los secretos multiusuario existentes en Supabase.
*/

// MERCA - receptor HTTPS v11 multiusuario. Todo comprobante compartido desde Atajos es GASTO.
// Los INGRESOS se agregan manualmente desde la aplicación web.
// No se pide «tipo» ni se usa el titular para clasificar el gasto.
// Si el nombre de destino falta, se guarda su alias o identificador reconocido.
// No almacenar imágenes ni texto OCR completo. Secretos solo en Supabase.
// Comprobantes ambiguos no se confirman automáticamente.
const cantidadMaximaOCR = 20000;

function textoOperacion(texto: string): string {
  return texto.split(/(?:^|\r?\n)\s*Mago,?\s*tu asistente\b/i)[0];
}

function buscarMontos(texto: string): string[] {
  // Centavos superscript: $17.500⁰⁰; texto extraído del PDF: $17.50000.
  return [...new Set([...textoOperacion(texto).matchAll(/(?:AR\$|ARS|\$)\s*\d[\d.,]*(?:[⁰¹²³⁴⁵⁶⁷⁸⁹]{2})?/gi)]
    .map(m => m[0].trim()))].slice(0, 15);
}

function esFormatoPagoMP(texto: string): boolean {
  const cuerpo = textoOperacion(texto);
  return /\bcomprobante\s+de\s+(?:pago|transferencia)\b/i.test(cuerpo) &&
    /\borigen\s+y\s+destino\b/i.test(cuerpo) &&
    /\bmercado\s+pago\b/i.test(cuerpo) && Boolean(buscarReferencia(texto));
}

function normalizarMonto(valor: string, textoCompleto: string): string | null {
  let numero = valor.replace(/^(?:AR\$|ARS|\$)\s*/i, "").trim();
  // PDF: la cifra entera se dibuja grande y los centavos a su derecha,
  // en una fuente menor. El texto extraído NO incluye coma: "17.50000".
  // SOLO se reconstruye en comprobantes MP cuyo formato está identificado.
  if (esFormatoPagoMP(textoCompleto)) {
    const superfijos = "⁰¹²³⁴⁵⁶⁷⁸⁹";
    const superscript = numero.match(/^(\d{1,3}(?:\.\d{3})+|\d+)([⁰¹²³⁴⁵⁶⁷⁸⁹]{2})$/);
    if (superscript) {
      const centavos = [...superscript[2]].map(c => String(superfijos.indexOf(c))).join("");
      numero = superscript[1] + "," + centavos;
    } else {
      const aplanado = numero.match(/^(\d{1,3}(?:\.\d{3})+)(\d{2})$/);
      if (aplanado) numero = aplanado[1] + "," + aplanado[2];
      // Sin separador: "50000" puede ser $500,00 o $50.000,00.
      // No adjudicar un monto arbitrario. Requiere revisión.
      else if (/^\d{3,}$/.test(numero)) return null;
    }
  }
  if (!/^(?:\d{1,3}(?:\.\d{3})+|\d+)(?:,\d{1,2})?$/.test(numero)) return null;
  const [entero, decimales = ""] = numero.split(",");
  const limpio = entero.replace(/\./g, "").replace(/^0+(?=\d)/, "");
  if (limpio.length > 13 || !/[1-9]/.test(limpio + decimales)) return null;
  return `${limpio}.${decimales.padEnd(2, "0")}`;
}

function buscarFechas(texto: string): string[] {
  const meses = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio",
    "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
  const resultado = new Set<string>();
  function agregar(d: string, m: number, a: string) {
    const dia = Number(d), ano = Number(a);
    const fecha = new Date(Date.UTC(ano, m - 1, dia));
    if (m < 1 || m > 12 || fecha.getUTCFullYear() !== ano ||
        fecha.getUTCMonth() + 1 !== m || fecha.getUTCDate() !== dia) return;
    resultado.add(`${a}-${String(m).padStart(2, "0")}-${String(dia).padStart(2, "0")}`);
  }
  for (const m of texto.matchAll(/\b([0-3]?\d)[\/.-]([01]?\d)[\/.-](20\d{2})\b/g)) {
    agregar(m[1], Number(m[2]), m[3]);
  }
  const patronEscrito = /\b([0-3]?\d)\s*(?:\/|-|\s+de\s+|\s+)\s*(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre)\s*(?:\/|-|\s+de\s+|,\s*|\s+)\s*(20\d{2})\b/gi;
  for (const m of texto.matchAll(patronEscrito)) {
    const nombre = m[2].toLowerCase() === "setiembre" ? "septiembre" : m[2].toLowerCase();
    const indice = meses.indexOf(nombre);
    if (indice >= 0) agregar(m[1], indice + 1, m[3]);
  }
  return [...resultado].slice(0, 15);
}

function buscarHora(texto: string): string | null {
  const encabezado = textoOperacion(texto).slice(0, 400);
  // Ejemplo real: "Domingo, 18 de octubre de 2026, 13:45 hs."
  const juntoFecha = encabezado.match(/\b20\d{2}\s*,?\s*([01]?\d|2[0-3]):([0-5]\d)\s*hs\.?/i);
  const conPrefijo = encabezado.match(/\ba\s+las\s+([01]?\d|2[0-3]):([0-5]\d)\b/i);
  const m = juntoFecha ?? conPrefijo;
  return m ? `${m[1].padStart(2, "0")}:${m[2]}` : null;
}

function buscarReferencia(texto: string): string | null {
  const m = textoOperacion(texto).match(/\bN[.°º\s]*de\s+operaci[oó]n\s+de\s+Mercado\s+Pago\s*[:#-]?\s*(\d{6,25})/i);
  return m ? `mercado_pago:${m[1]}` : null;
}

// Priorizar nombres visibles. Si no figura el nombre del titular destino,
// usar un alias o identificador de LA CUENTA DESTINO, nunca de la cuenta origen.
// MERCA no consulta registros bancarios externos ni infiere titulares por CVU.
function nombreDestinatarioValido(crudo: string): string | null {
  const valor = crudo.replace(/^(?:nombre(?:\s+(?:del\s+)?(?:destinatario|beneficiario))?|titular(?:\s+destino)?|destinatario|beneficiario|comercio|a\s+nombre\s+de)\s*:\s*/i, "")
    .replace(/\s+/g, " ").trim();
  if (valor.length < 2 || valor.length > 120 || !/[\p{L}]{2}/u.test(valor)) return null;
  if (/\b(?:CBU|CVU|CUIL|CUIT|DNI|ALIAS|N[°º.]?\s*DE\s*CUENTA)\b/i.test(valor)) return null;
  if (/\d{8,}/.test(valor) || /^\d/.test(valor)) return null;
  if (/^(?:mercado pago|origen(?: y destino)?|destino|titular|banco|cuenta|caja de ahorro|cuenta corriente|transferencia|comprobante(?: de pago)?|pesos|ars|n[°º.]? de operaci[oó]n)$/i.test(valor)) return null;
  return valor;
}

function esLineaEntidadFinanciera(linea: string): boolean {
  return /^(?:Mercado Pago|Ual[aá]|Naranja X|Brubank|Banco\s+[^:]+|Cuenta DNI|Prex|Personal Pay)$/i.test(linea.trim());
}

function esLineaIdentificador(linea: string): boolean {
  return /^(?:(?:CUIT|CUIL|CBU|CVU)(?:\s*\/\s*(?:CUIT|CUIL|CBU|CVU))?)\s*:?\s*[\d.\s-]{8,35}$/i.test(linea.trim());
}

function nivelDestinatario(valor: string | null): number {
  if (!valor?.trim()) return 0;
  const texto = valor.trim();
  if (/^(?:CUIL|CUIT|DNI|Cuenta)\s*:/i.test(texto) || /^\d[\d.\s-]{7,}$/.test(texto)) return 1;
  if (/^(?:CBU|CVU)\s*:/i.test(texto)) return 2;
  if (/^Alias\s*:/i.test(texto)) return 3;
  return 4; // Nombre legible de persona o comercio.
}

type CuentaIdentificada = { indice: number; valor: string; prioridad: number; explicita: boolean };
function buscarIdentificadorDeDestino(texto: string): string | null {
  const cuerpo = textoOperacion(texto);
  const seccion = cuerpo.match(/origen\s+y\s+destino\s*([\s\S]*?)(?=\bN[.°º\s]*de\s+operaci[oó]n\b|$)/i)?.[1];
  const lineas = (seccion ?? cuerpo).split(/\r?\n/).map(s => s.trim()).filter(Boolean);
  const destinoDesde = lineas.findIndex(s => /^(?:datos?\s+de(?:l)?\s+)?(?:destino|destinatario|beneficiario)\s*:?$/i.test(s));
  const encontrados: CuentaIdentificada[] = [];
  const patron = /^(?:(alias|cbu|cvu|cuit|cuil|dni)(?:\s+(?:de(?:l)?\s+)?(?:destino|destinatario|beneficiario))?|(?:destino|destinatario|beneficiario)\s+(alias|cbu|cvu|cuit|cuil|dni))\s*:?\s*(.*)$/i;

  for (let i = 0; i < lineas.length; i++) {
    const m = lineas[i].match(patron);
    if (!m) continue;
    const etiqueta = (m[1] || m[2]).toUpperCase();
    let crudo = m[3].trim();
    if (!crudo && i + 1 < lineas.length && !patron.test(lineas[i + 1])) crudo = lineas[i + 1].trim();
    let valor: string | null = null;
    let prioridad = 1;
    if (etiqueta === "ALIAS") {
      // Alias argentinos: alfanuméricos con puntos, guiones o guiones bajos.
      if (/^[\p{L}\d][\p{L}\d._-]{2,79}$/u.test(crudo) && /\p{L}/u.test(crudo)) {
        valor = "Alias: " + crudo;
        prioridad = 3;
      }
    } else {
      const digitos = crudo.replace(/[.\s-]/g, "");
      const esperado = etiqueta === "CVU" || etiqueta === "CBU" ? 22 :
        etiqueta === "DNI" ? 0 : 11;
      if ((esperado && new RegExp("^\\d{" + esperado + "}$").test(digitos)) ||
          (etiqueta === "DNI" && /^\d{7,8}$/.test(digitos))) {
        valor = etiqueta + ": " + digitos;
        prioridad = etiqueta === "CVU" || etiqueta === "CBU" ? 2 : 1;
      }
    }
    if (valor) encontrados.push({
      indice: i, valor, prioridad,
      explicita: /(destino|destinatario|beneficiario)/i.test(m[0]),
    });
  }

  const elegir = (candidatos: CuentaIdentificada[]): string | null =>
    [...candidatos].sort((a, b) => b.prioridad - a.prioridad || b.indice - a.indice)[0]?.valor ?? null;

  // Una etiqueta explícita identifica el destino aun fuera de «Origen y destino».
  const explicitos = encontrados.filter(item => item.explicita ||
    (destinoDesde >= 0 && item.indice > destinoDesde));
  if (explicitos.length) return elegir(explicitos);

  // Plantilla «Origen y destino»: hay al menos un identificador para cada parte,
  // separados por un nombre o entidad financiera. Nunca usar el primero.
  if (seccion && encontrados.length >= 2) {
    let primerIndiceDestino = -1;
    for (let i = 1; i < encontrados.length; i++) {
      const entre = lineas.slice(encontrados[i - 1].indice + 1, encontrados[i].indice);
      // Separación entre los datos del origen y los del destino.
      if (entre.some(s => esLineaEntidadFinanciera(s) ||
          nombreDestinatarioValido(s) !== null || /^destino\b/i.test(s))) {
        primerIndiceDestino = i;
      }
    }
    if (primerIndiceDestino >= 1) return elegir(encontrados.slice(primerIndiceDestino));
  }
  return null;
}

export function buscarDestinatario(texto: string): string | null {
  const cuerpo = textoOperacion(texto);
  const seccion = cuerpo.match(/origen\s+y\s+destino\s*([\s\S]*?)(?=\bN[.°º\s]*de\s+operaci[oó]n\b|$)/i)?.[1];
  const bloque = seccion || cuerpo;
  const lineas = bloque.split(/\r?\n/).map(s => s.trim()).filter(Boolean);

  // Etiquetas explícitas: Destinatario, Beneficiario, Titular destino, etc.
  // Se utilizan aun cuando no se incluya documento de identificación.
  for (let i = 0; i < lineas.length; i++) {
    const match = lineas[i].match(/^(?:destinatario|destino|beneficiario|nombre(?:\s+del\s+destinatario)|titular\s+destino|comercio|a\s+nombre\s+de)\s*:?\s*(.*)$/i);
    if (!match) continue;
    const candidato = match[1]?.trim() || lineas[i + 1] || "";
    const nombre = nombreDestinatarioValido(candidato);
    if (nombre) return nombre;
  }

  if (!seccion) return buscarIdentificadorDeDestino(texto);

  // MP: "Origen y destino / remitente / CUIL ... / Mercado Pago /
  // destinatario / CUIT ...", o bien dos titulares junto a CBU/CVU.
  // Un número de cuenta no se trata nunca como nombre.
  const pares: {nombre: string; indice: number}[] = [];
  for (let i = 1; i < lineas.length; i++) {
    if (!esLineaIdentificador(lineas[i])) continue;
    let anterior = lineas[i - 1];
    if (esLineaEntidadFinanciera(anterior) && i >= 2) anterior = lineas[i - 2];
    const nombre = nombreDestinatarioValido(anterior);
    if (nombre) pares.push({ nombre, indice: i });
  }
  if (pares.length >= 2) return pares[1].nombre;

  // Algunas plantillas separan visualmente "Origen" y "Destino".
  // Si no hay una identificación inequívoca, NO inventar el titular del CVU.
  const cabeceraDestino = lineas.findIndex(s => /^destino\s*:?(?:\s*\(.*\))?$/i.test(s));
  if (cabeceraDestino >= 0 && lineas[cabeceraDestino + 1]) {
    const nombre = nombreDestinatarioValido(lineas[cabeceraDestino + 1]);
    if (nombre) return nombre;
  }
  // Nunca adivinar el nombre de un titular: usar el alias/CBU/CVU identificado
  // inequívocamente como perteneciente al destino si no se extrajo el nombre.
  return buscarIdentificadorDeDestino(texto);
}

/**
 * Busca la ENTIDAD que figura en el origen del movimiento, no la del destino.
 * No usa CUIL/titular para determinar la billetera ni lee datos de identidad.
 * Solo considera nombres de instituciones conocidas; el nombre se coteja con
 * la cuenta configurada por el propio usuario.
 */
function identificarBilleteraOrigen(texto: string): string | null {
  const cuerpo = textoOperacion(texto);
  if (!/\b(?:comprobante|recibo|transferencia|pago)\b/i.test(cuerpo)) return null;

  // Si el comprobante informa financiación con tarjeta, el emisor del PDF
  // podría no ser la cuenta de la que realmente salió el dinero.
  if (/\b(?:tarjeta|visa|mastercard|master\s*card|amex|american\s+express|cr[eé]dito|d[eé]bito|cuotas)\b/i.test(cuerpo)) return null;

  function nombreInstitucion(linea: string): string | null {
    const limpia = linea.trim().replace(/^(?:entidad|instituci[oó]n|billetera|banco|cuenta)\s*:\s*/i, "");
    return esLineaEntidadFinanciera(limpia) ? limpia : null;
  }

  // Formatos con etiqueta explícita. Ej.: "Billetera de origen: Prex".
  // Se ignoran etiquetas de destino y nombres de bancos fuera del origen.
  const etiqueta = cuerpo.match(/(?:^|\n)\s*(?:(?:billetera|entidad|instituci[oó]n|banco|cuenta)\s+(?:de\s+)?origen|origen)\s*:\s*([^\r\n]+)/i);
  if (etiqueta) {
    const entidad = nombreInstitucion(etiqueta[1]);
    if (entidad) return entidad;
  }

  // Encabezados de bloques separados: Origen / institución / Destino.
  const bloqueOrigen = cuerpo.match(/(?:^|\n)\s*origen\s*:?\s*\n([\s\S]*?)(?=\n\s*(?:destino|destinatario)\s*:?\s*(?:\n|$))/i)?.[1];
  if (bloqueOrigen) {
    const instituciones = bloqueOrigen.split(/\r?\n/)
      .map(nombreInstitucion).filter((v): v is string => v !== null);
    if (instituciones.length === 1) return instituciones[0];
    return null; // Dos posibles orígenes: no adivinar.
  }

  // Comprobantes Mercado Pago probados:
  // Origen y destino / persona que envía / [identificador opcional] /
  // Mercado Pago / persona receptora / [identificador opcional] / Mercado Pago.
  // El identificador NO es requerido ni se analiza para elegir la billetera.
  const seccion = cuerpo.match(/(?:^|\n)\s*origen\s+y\s+destino\s*\n([\s\S]*?)(?=\n\s*n[.°º\s]*de\s+operaci[oó]n\b|$)/i)?.[1];
  if (!seccion) return null;
  const lineas = seccion.split(/\r?\n/).map(s => s.trim()).filter(Boolean);

  for (let i = 1; i < lineas.length; i++) {
    const entidad = nombreInstitucion(lineas[i]);
    if (!entidad) continue;
    // Debe existir una persona/comercio antes de la entidad de origen
    // y OTRO participante después de ella, no solo el banco de destino.
    const tieneEmisor = lineas.slice(0, i).some(s => nombreDestinatarioValido(s) !== null && !nombreInstitucion(s));
    const tieneReceptor = lineas.slice(i + 1).some(s => nombreDestinatarioValido(s) !== null && !nombreInstitucion(s));
    return tieneEmisor && tieneReceptor ? entidad : null;
  }
  return null;
}

function nombreBilleteraNormalizado(nombre: string): string {
  return nombre.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/\s+/g, " ").trim();
}

/** La búsqueda se limita al usuario autenticado por su token de Atajos. */
async function resolverBilleteraOrigen(
  db: ReturnType<typeof createClient>, usuario: string, comprobante: string
): Promise<string | null> {
  // La billetera es un dato opcional: incluso si falla el reconocimiento
  // o la consulta, el gasto debe poder registrarse sin cuenta.
  try {
    const entidadOrigen = identificarBilleteraOrigen(comprobante);
    if (!entidadOrigen) return null;
    const { data, error } = await db.from("cuentas")
      .select("id,nombre,activa").eq("user_id", usuario);
    if (error || !Array.isArray(data)) return null;
    const normalizado = nombreBilleteraNormalizado(entidadOrigen);
    const coincidencias = data.filter(c =>
      typeof c.nombre === "string" && nombreBilleteraNormalizado(c.nombre) === normalizado
    );
    if (coincidencias.length !== 1 || coincidencias[0].activa !== true) return null;
    return coincidencias[0].id;
  } catch {
    // No registrar identidades, OCR, detalles de cuentas ni tokens.
    console.warn("MERCA_BILLETERA", "CONSULTA_FALLIDA_SIN_ASIGNAR");
    return null;
  }
}

async function huellaTexto(texto: string): Promise<string> {
  const limpio = texto.normalize("NFC").replace(/\s+/g, " ").trim().toLowerCase();
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(limpio));
  return "ocr_sha256:" + [...new Uint8Array(digest)]
    .map(n => n.toString(16).padStart(2, "0")).join("");
}

// En MERCA los Atajos solo capturan gastos. El origen/titular no influye
// en la clasificación: cualquier comprobante ajeno también se admite.
// La categoría y el OCR se validan por separado antes de guardar.
function evaluarConfirmacion(texto: string, referenciaOficial: string | null,
  monto: string, fecha: string, monedaCruda: string): { confirmar: boolean; motivo: string } {
  const cuerpo = textoOperacion(texto);
  if (!monto || !fecha)
    return { confirmar: false, motivo: "importe_o_fecha_no_validos" };
  // La referencia oficial refuerza el reconocimiento del formato Mercado Pago.
  // Otros emisores también pueden confirmarse si todos los datos son claros.
  if (esFormatoPagoMP(texto) && referenciaOficial)
    return { confirmar: true, motivo: "comprobante_mercado_pago" };
  // En emisores desconocidos, un monto sin separador ($ 50000) puede
  // representar $50.000 o $500,00 si el PDF unió los centavos.
  // Nunca confirmar automáticamente esa interpretación incierta.
  const importeSinSeparador = monedaCruda.replace(/^(?:AR\$|ARS|\$)\s*/i, "").trim();
  if (/^\d{3,}$/.test(importeSinSeparador))
    return { confirmar: false, motivo: "importe_sin_separador_ambiguo" };
  // Solo aprobar documentos con señales de ser un comprobante, no texto libre
  // que accidentalmente contenga un importe y una fecha.
  const tieneIndicadores = /\b(?:comprobante|recibo|factura|ticket|transferencia|pago|operaci[oó]n|transacci[oó]n|compra|consumo|d[eé]bito)\b/i.test(cuerpo);
  if (tieneIndicadores)
    return { confirmar: true, motivo: "comprobante_con_importe_y_fecha_unicos" };
  return { confirmar: false, motivo: "documento_no_identificado" };
}

function getAdminKey(): string | null {
  const legacy = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (legacy) return legacy;
  try {
    const secretKeys: unknown = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") || "{}");
    if (secretKeys && typeof secretKeys === "object" && "default" in secretKeys &&
      typeof secretKeys.default === "string") return secretKeys.default;
  } catch { /* configuración incompleta */ }
  return null;
}

// Los tokens viven solo en los Secrets de Supabase y en cada Atajo privado.
// El cuerpo JSON NO decide el usuario: se obtiene de la credencial validada.
type IdentidadAtajo = { ok: true; usuario: string } |
  { ok: false; status: 401 | 503 };

async function resolverUsuarioAtajo(tokenRecibido: string | null): Promise<IdentidadAtajo> {
  const errorConfiguracion: IdentidadAtajo = { ok: false, status: 503 };
  const uuid = /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i;
  const usuariosPorToken = new Map<string, string>();
  const agregar = (usuario: string, token: string): boolean => {
    const id = usuario.toLowerCase();
    const anterior = usuariosPorToken.get(token);
    if (anterior !== undefined && anterior !== id) return false;
    usuariosPorToken.set(token, id);
    return true;
  };

  // Compatibilidad: el Atajo del propietario sigue usando sus Secrets actuales.
  const tokenPropietario = Deno.env.get("MERCA_INGEST_TOKEN");
  const propietario = Deno.env.get("MERCA_OWNER_USER_ID");
  if (tokenPropietario !== undefined || propietario !== undefined) {
    if (!tokenPropietario || !propietario || !uuid.test(propietario))
      return errorConfiguracion;
    agregar(propietario, tokenPropietario);
  }

  // Secret opcional: MERCA_INGEST_USERS = { "UUID_USUARIO": "TOKEN_PERSONAL" }.
  // Se pueden agregar varias entradas. Cada token nuevo requiere 32 a 256
  // caracteres A-Z, a-z, 0-9, guion o guion bajo. Recomendado: 32 bytes aleatorios
  // representados en hexadecimal (64 caracteres), generados fuera del código.
  const configuracion = Deno.env.get("MERCA_INGEST_USERS");
  if (configuracion !== undefined) {
    try {
      const mapa: unknown = JSON.parse(configuracion);
      if (!mapa || typeof mapa !== "object" || Array.isArray(mapa)) return errorConfiguracion;
      for (const [usuario, token] of Object.entries(mapa)) {
        if (!uuid.test(usuario) || typeof token !== "string" ||
            !/^[A-Za-z0-9_-]{32,256}$/.test(token) || !agregar(usuario, token))
          return errorConfiguracion;
      }
    } catch {
      // No registrar el JSON ni los tokens en los logs.
      return errorConfiguracion;
    }
  }
  if (!usuariosPorToken.size) return errorConfiguracion;
  if (!tokenRecibido || tokenRecibido.length > 4096) return { ok: false, status: 401 };

  // Comparar resúmenes de longitud fija y recorrer todas las credenciales.
  // Nunca usar el primer usuario como fallback si el token no coincide.
  try {
    const resumir = async (valor: string): Promise<Uint8Array> =>
      new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(valor)));
    const recibido = await resumir(tokenRecibido);
    let usuario: string | null = null;
    for (const [token, id] of usuariosPorToken) {
      const esperado = await resumir(token);
      let diferencia = 0;
      for (let i = 0; i < recibido.length; i++) diferencia |= recibido[i] ^ esperado[i];
      if (diferencia === 0) usuario = id;
    }
    return usuario ? { ok: true, usuario } : { ok: false, status: 401 };
  } catch {
    return errorConfiguracion;
  }
}

Deno.serve(async (req: Request) => {
  // Atajos solo recibe uno de estos tres textos (sin JSON ni datos privados).
  const mensajes = {
    error: "Error al cargar el movimiento",
    "por confirmar": "Transacción a confirmar",
    exito: "Movimiento cargado exitosamente",
  } as const;
  const responder = (resultado: keyof typeof mensajes, status = 200) =>
    new Response(mensajes[resultado], { status, headers: {
      "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store",
    }});
  if (req.method !== "POST") return responder("error", 405);
  const identidad = await resolverUsuarioAtajo(req.headers.get("x-merca-token"));
  if (!identidad.ok) {
    console.warn("MERCA_AUTENTICACION", "HTTP", identidad.status);
    return responder("error", identidad.status);
  }

  const usuario = identidad.usuario;
  const url = Deno.env.get("SUPABASE_URL");
  const clave = getAdminKey();
  if (!url || !clave) {
    console.warn("MERCA_CONFIGURACION", "CLAVE_O_URL_FALTANTE");
    return responder("error", 503);
  }

  let datos: Record<string, unknown>;
  try {
    const texto = await req.text();
    if (texto.length > 25000) return responder("error", 413);
    const obj: unknown = JSON.parse(texto);
    if (!obj || typeof obj !== "object" || Array.isArray(obj)) return responder("error", 400);
    datos = obj as Record<string, unknown>;
  } catch {
    return responder("error", 400);
  }

  // Cualquier PDF de Atajos significa GASTO, aun cuando el titular sea otra persona.
  // No se aceptan tipos declarados y la simulación no puede aparentar un éxito real.
  const { texto_ocr, categoria } = datos;
  if (datos.simular === true || typeof texto_ocr !== "string" || !texto_ocr.trim() ||
      texto_ocr.length > cantidadMaximaOCR || typeof categoria !== "string" ||
      !categoria.trim() || categoria.length > 80) {
    console.warn("MERCA_VALIDACION", "CUERPO_JSON_INVALIDO");
    return responder("error", 422);
  }

  const textoComprobante = texto_ocr as string;
  const posiblesMontos = buscarMontos(textoComprobante);
  const posiblesFechas = buscarFechas(textoComprobante);
  const monto = posiblesMontos.length === 1 ? normalizarMonto(posiblesMontos[0], textoComprobante) : null;
  const fecha = posiblesFechas.length === 1 ? posiblesFechas[0] : null;
  const hora = buscarHora(textoComprobante);

  // Sin importe o fecha confiable NO se guarda un registro con cifras inventadas.
  // Solo se registran códigos de diagnóstico (no valores privados del comprobante).
  if (!monto || !fecha) {
    console.warn("MERCA_VALIDACION", !monto ? "MONTO_AMBIGUO_O_INVALIDO" : "FECHA_AMBIGUA_O_INVALIDA",
      "montos_encontrados", posiblesMontos.length, "fechas_encontradas", posiblesFechas.length);
    return responder("error", 422);
  }

  const refOficial = buscarReferencia(textoComprobante);
  const referencia = refOficial || await huellaTexto(textoComprobante);
  const evaluacion = evaluarConfirmacion(textoComprobante, refOficial, monto, fecha, posiblesMontos[0]);
  const nombreCategoria = categoria.trim().replace(/\s+/g, " ");
  const destinatario = buscarDestinatario(textoComprobante);
  const db = createClient(url, clave, { auth: { persistSession: false, autoRefreshToken: false } });

  let etapa = "buscar_duplicados";
  try {
    const { data: existente, error: errExistente } = await db.from("movimientos")
      .select("id,estado,destinatario").eq("user_id", usuario)
      .eq("referencia_externa", referencia).maybeSingle();
    if (errExistente) throw errExistente;
    if (existente) {
      // Al reenviar un comprobante existente, mejorar solo destinatario si
      // el OCR aporta una identificación de mayor calidad: nombre > alias > cuenta.
      // No se modifica monto, fecha, categoría, estado ni referencia.
      if (destinatario && nivelDestinatario(destinatario) > nivelDestinatario(existente.destinatario)) {
        const { error: errNombre } = await db.from("movimientos")
          .update({ destinatario }).eq("id", existente.id).eq("user_id", usuario);
        if (errNombre) throw errNombre;
      }
      return responder(existente.estado === "confirmado" ? "exito" :
        existente.estado === "pendiente_revision" ? "por confirmar" : "error");
    }

    // Categoría de gasto: jamás reactivar una categoría archivada.
    etapa = "crear_o_comprobar_categoria";
    const { error: errCrear } = await db.from("categorias").upsert({
      user_id: usuario, nombre: nombreCategoria, tipo: "gasto", activa: true,
    }, { onConflict: "user_id,nombre,tipo", ignoreDuplicates: true });
    if (errCrear) throw errCrear;
    etapa = "leer_categoria";
    const { data: cat, error: errCat } = await db.from("categorias")
      .select("id,activa").eq("user_id", usuario).eq("nombre", nombreCategoria)
      .eq("tipo", "gasto").single();
    if (errCat) throw errCat;
    const confirmado = evaluacion.confirmar && cat.activa;
    const estado = confirmado ? "confirmado" : "pendiente_revision";
    // Si el origen del comprobante no es inequívoco, dejamos Sin asignar.
    etapa = "detectar_billetera";
    const cuentaOrigenId = await resolverBilleteraOrigen(db, usuario, textoComprobante);

    const datosMovimiento = {
      user_id: usuario, tipo: "gasto", monto, moneda: "ARS", fecha, hora,
      categoria_id: cat.id, destinatario,
      descripcion: "Atajos",
      origen_registro: "atajos_ios", referencia_externa: referencia, estado,
    };
    etapa = "insertar_movimiento";
    let { error: errMovimiento } = await db.from("movimientos")
      .insert({ ...datosMovimiento, ...(cuentaOrigenId ? { cuenta_origen_id: cuentaOrigenId } : {}) });

    // Si la cuenta se eliminó, cambió de usuario o su FK no es válida,
    // conservar el gasto SIN cuenta. No eliminar ni alterar el historial.
    if (errMovimiento?.code === "23503" && cuentaOrigenId) {
      console.warn("MERCA_BILLETERA", "REFERENCIA_NO_VALIDA_REINTENTO_SIN_ASIGNAR");
      ({ error: errMovimiento } = await db.from("movimientos").insert(datosMovimiento));
    }
    if (errMovimiento) {
      if (errMovimiento.code === "23505") {
        // Concurrencia: no sobrescribir ni duplicar una operación ya registrada.
        const { data: duplicado } = await db.from("movimientos")
          .select("estado").eq("user_id", usuario)
          .eq("referencia_externa", referencia).maybeSingle();
        return responder(duplicado?.estado === "confirmado" ? "exito" :
          duplicado?.estado === "pendiente_revision" ? "por confirmar" : "error");
      }
      throw errMovimiento;
    }
    return responder(confirmado ? "exito" : "por confirmar");
  } catch (error) {
    // Etapa + código SQL permiten localizar el error sin registrar datos privados.
    const codigo = error && typeof error === "object" && "code" in error
      && typeof error.code === "string" ? error.code : "SIN_CODIGO";
    console.error("MERCA_ERROR", "etapa", etapa, "codigo", codigo);
    return responder("error", 500);
  }
});