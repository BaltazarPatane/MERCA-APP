# Recepción de comprobantes desde Atajos — MERCA

MERCA recibe comprobantes en la Edge Function **`smooth-handler`** de Supabase. El código completo de la función se versiona en [`supabase/functions/smooth-handler/index.ts`](../supabase/functions/smooth-handler/index.ts).

**Importante:** los cambios de GitHub no despliegan automáticamente las Edge Functions. El usuario debe actualizar `smooth-handler` desde Supabase.

## Qué conserva la versión v11

- Se mantiene la URL `/functions/v1/smooth-handler`, el token `x-merca-token` y el mismo JSON de Atajos: `{"texto_ocr":"...","categoria":"..."}`.
- No se cambia ni se crea ningún Secret, ni se solicita CUIL o identidad adicional.
- Se respetan los tokens independientes para varios usuarios y el procesamiento actual de importes, fechas, destinatarios y duplicados.
- Todos los comprobantes que llegan desde Atajos continúan siendo **gastos**. Las transferencias internas entre billeteras propias se siguen creando desde la web.
- No se almacenan PDFs, imágenes ni OCR completo en la base de datos.

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
2. Abrir <https://supabase.com/dashboard>, seleccionar el proyecto de MERCA y entrar a **Edge Functions** → **smooth-handler**.
3. Antes de editar, guardar una copia de seguridad del `index.ts` actual; revisar si tiene ajustes posteriores a la versión de referencia utilizada.
4. Abrir **Code** → **index.ts** de esa misma función.
5. Copiar el contenido **completo** de [la versión actual de GitHub](../supabase/functions/smooth-handler/index.ts) y reemplazar el código anterior.
6. Presionar **Deploy updates**. Mantener la misma configuración de verificación JWT y los mismos Secrets con los que funcionan los Atajos actuales.
7. Enviar un **comprobante nuevo** desde el Atajo y comprobar en MERCA → Movimientos que el campo de billetera se completó con la entidad emisora.
8. Probar un comprobante sin institución de origen identificable: debe guardarse como gasto **Sin asignar**.
9. Si hubiera un problema, restaurar la copia del código anterior en la misma función y volver a presionar **Deploy updates**.

La función se basa en la última versión multiusuario conocida de MERCA, no en una lectura en vivo del código desplegado en Supabase. Comparar cualquier ajuste manual posterior antes de reemplazarla.

## Respuestas de Atajos

| Respuesta | Significado |
| --- | --- |
| `Movimiento cargado exitosamente` | Guardado confirmado o duplicado ya confirmado |
| `Transacción a confirmar` | Guardado para revisión |
| `Error al cargar el movimiento` | No se pudo guardar |

Estos mensajes permanecen sin cambios.