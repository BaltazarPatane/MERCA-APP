# Recepción de comprobantes desde Atajos — MERCA

MERCA recibe comprobantes en la Edge Function configurada por cada Atajo. En el proyecto original aparece como **`merca-recibir`**; el código se versiona en la carpeta `smooth-handler` de GitHub por motivos históricos. El código completo de la función se versiona en [`supabase/functions/smooth-handler/index.ts`](../supabase/functions/smooth-handler/index.ts).

**Importante:** los cambios de GitHub no despliegan automáticamente las Edge Functions. El usuario debe actualizar **la función cuyo nombre aparece en la URL de su Atajo**, sin renombrarla.

## Qué conserva la versión v13

- Se mantiene la URL existente del Atajo (por ejemplo, `/functions/v1/merca-recibir`), el token `x-merca-token` y el mismo JSON de Atajos: `{"texto_ocr":"...","categoria":"..."}`.
- No se cambia ni se crea ningún Secret, ni se solicita CUIL o identidad adicional.
- Se respetan los tokens independientes para varios usuarios y el procesamiento actual de importes, fechas, destinatarios y duplicados.
- Todos los comprobantes que llegan desde Atajos continúan siendo **gastos**. Las transferencias internas entre billeteras propias se siguen creando desde la web.
- No se almacenan PDFs, imágenes ni OCR completo en la base de datos.

## Corrección de importes de transferencias (v13)

En los registros de Supabase del 5 de noviembre de 2026 se observó un **HTTP 422** con `MERCA_VALIDACION MONTO_AMBIGUO_O_INVALIDO montos_encontrados 1 fechas_encontradas 1`. Ocurre **antes** de consultar billeteras o insertar movimientos. No se detectó un fallo de autenticación o de FK de cuenta en ese intento.

Para los comprobantes de Mercado Pago que contienen claramente `Comprobante de transferencia`, `Origen y destino` y la entidad `Mercado Pago`, el receptor puede reconstruir importes con miles y centavos unidos (ej. `$ 17.50000`) **aunque el PDF no permita leer la referencia oficial**. El formato de pago se valida independientemente de la referencia; se conserva la comprobación de importes y fechas únicos.

Se siguen rechazando importes realmente ambiguos sin separador, por ejemplo `$ 50000`, porque puede significar $500,00 o $50.000,00. No se inventan montos ni se insertan movimientos de monto cero. En Logs se añade el indicador técnico `patron_importe` sin guardar la cifra, el OCR, ni datos personales; si persiste el error, el patrón permite saber qué caso ajustar.

## Cómo identifica la billetera automáticamente

1. Busca la entidad financiera **del origen** indicada de forma explícita (`Origen`, `Billetera de origen` o el primer bloque de `Origen y destino` en los formatos compatibles).
2. Reconoce nombres de entidades como **Mercado Pago, Ualá, Prex, Brubank, Naranja X, Cuenta DNI, Personal Pay y bancos con nombre explícito**, entre otros incluidos en el extractor.
3. Consulta exclusivamente las cuentas del **usuario autenticado con su token de Atajos** y busca una coincidencia de nombre exacta (ignorando mayúsculas, tildes y espacios repetidos).
4. Solo asigna `cuenta_origen_id` cuando la coincidencia es única y la cuenta está activa.
5. Si no se identifica un origen, hay dos coincidencias, el nombre de la cuenta es diferente o el comprobante menciona tarjeta, crédito, débito o cuotas, **se guarda el gasto sin billetera asignada**.

La función **no usa la entidad del destino** para decidir el origen ni deduce una billetera a partir del logo de un comprobante. Tampoco comprueba que el emisor sea el propietario: registra la fuente documental que aparece en el comprobante.

Ejemplos:

| Origen documentado | Destino | Billetera en MERCA |
| --- | --- | --- |
| Mercado Pago | Grido | Mercado Pago, si existe una única billetera activa con ese nombre |
| Banco Provincia | Mercado Pago | Banco Provincia, si existe una cuenta con ese nombre |
| No especificado | Mercado Pago | Sin asignar |
| Origen ambiguo o múltiples fuentes | Cualquier destino | Sin asignar |

### Compatibilidad y precauciones

Que un comprobante haya sido generado por Mercado Pago no implica que se haya financiado desde el saldo de esa billetera. Por ese motivo se ignoran las referencias a tarjetas y financiación detectables. Si el comprobante **no informa** el medio real utilizado, no existe una garantía absoluta de que se pueda deducir correctamente; los saldos siempre podrán corregirse manualmente.

Los comprobantes **ya registrados** no cambian ni se duplican cuando vuelven a compartirse; cualquier billetera previamente elegida manualmente se conserva.

No es necesario cambiar el SQL, las tablas de Supabase, el Atajo, Cloudflare, ni los Secrets existentes.

## Cómo desplegar en Supabase

1. En MERCA → Ajustes → Billeteras y cuentas, comprobar que exista una única cuenta activa cuyo **nombre coincida con el que figura como origen en el comprobante**, por ejemplo `Mercado Pago`.
2. Abrir <https://supabase.com/dashboard>, seleccionar el proyecto de MERCA y entrar a **Edge Functions** → la función que realmente usa el Atajo. Según la captura del proyecto, es **`merca-recibir`** (no crear ni renombrar la función).
3. Antes de editar, descargar una copia de seguridad del archivo que contiene la función (en tu caso **`merca-recibir.ts`**). Comparar si contiene cambios posteriores a la versión de referencia.
4. Abrir **Code** → **`merca-recibir.ts`** de esa misma función. El archivo que ves en Supabase puede tener otro nombre que el `index.ts` versionado en GitHub; no hace falta renombrarlo.
5. Copiar el contenido **completo** de [la versión actual de GitHub](../supabase/functions/smooth-handler/index.ts) y reemplazar el código anterior.
6. Presionar **Deploy updates**. Mantener la misma configuración de verificación JWT y los mismos Secrets con los que funcionan los Atajos actuales.
7. Enviar un **comprobante nuevo** desde el Atajo y comprobar en MERCA → Movimientos que el campo de billetera se completó con la entidad emisora.
8. Probar un comprobante sin institución de origen identificable: debe guardarse como gasto **Sin asignar**.
9. Si hubiera un problema, restaurar la copia del código anterior en la misma función y volver a presionar **Deploy updates**.

La función se basa en la última versión multiusuario conocida de MERCA y en el `merca-recibir.ts` proporcionado por el usuario, no en una lectura en vivo de los logs de Supabase. Comparar cualquier ajuste manual posterior antes de reemplazarla.

## Diagnóstico de errores (v12)

El texto visible de Atajos **`Error al cargar el movimiento`** es genérico: puede corresponder a múltiples códigos HTTP. Para averiguar el motivo, entrar a **Supabase → Edge Functions → merca-recibir → Invocations**, abrir la invocación fallida y consultar el estado HTTP. Luego abrir **Logs** para ver los mensajes correspondientes al mismo momento.

- **401:** token no autorizado; comprobar que el Atajo use la URL de la función correcta y el token anterior. El log dice `MERCA_AUTENTICACION HTTP 401`.
- **503:** falta configuración de autenticación, URL o clave del backend; no pegar Secrets en GitHub.
- **400/413/422:** solicitud o comprobante inválido; el log `MERCA_VALIDACION` indica `CUERPO_JSON_INVALIDO`, `MONTO_AMBIGUO_O_INVALIDO` o `FECHA_AMBIGUA_O_INVALIDA`, y cuenta cuántos valores se encontraron sin mostrar ninguno.
- **500:** error de base de datos; el log `MERCA_ERROR etapa <paso> codigo <código>` distingue búsqueda de duplicados, lectura de categoría, detección de billetera e inserción.
- **`MERCA_BILLETERA CONSULTA_FALLIDA_SIN_ASIGNAR`** o **`REFERENCIA_NO_VALIDA_REINTENTO_SIN_ASIGNAR`**: la billetera no se pudo asignar; la función intenta conservar igualmente el gasto normal, sin vincular una cuenta.

Los logs contienen únicamente códigos técnicos y etapas, **no** CUIL, nombres, números de operación, importes, OCR completo ni tokens. La detección de billeteras es un complemento opcional: una consulta fallida no debe hacer caer un comprobante válido. Si se sigue obteniendo error, aportar solamente el **estado HTTP y el código de diagnóstico**, sin copiar datos privados ni Secrets.

## Respuestas de Atajos

| Respuesta | Significado |
| --- | --- |
| `Movimiento cargado exitosamente` | Guardado confirmado o duplicado ya confirmado |
| `Transacción a confirmar` | Guardado para revisión |
| `Error al cargar el movimiento` | No se pudo guardar |

Estos mensajes permanecen sin cambios.