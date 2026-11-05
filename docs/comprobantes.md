# Recepción de comprobantes — MERCA

Esta es la integración vigente de **Atajos iOS** con la Edge Function de Supabase **`smooth-handler`**. El código completo de la versión propuesta **v10** se encuentra en [`supabase/functions/smooth-handler/index.ts`](../supabase/functions/smooth-handler/index.ts). **Subir archivos a GitHub no publica automáticamente esta función en Supabase:** se debe desplegar por separado.

## Comportamiento que se conserva

- Todo comprobante recibido desde Atajos se registra como **gasto**. Los ingresos y las transferencias internas se siguen creando manualmente desde MERCA.
- El Atajo sigue enviando el mismo JSON: `{"texto_ocr":"...","categoria":"..."}`.
- El Atajo sigue usando **la misma URL existente** terminada en `/functions/v1/smooth-handler` y su `x-merca-token` personal.
- Se preservan los titulares y usuarios múltiples, la extracción de importe/fecha/destinatario, los estados `confirmado` / `pendiente_revision`, y la protección frente a duplicados.
- No se guardan imágenes, PDF ni texto OCR completo. No se suben secretos al repositorio público.

## Mejora v10: billetera de origen (solo Mercado Pago verificado)

La función examina la sección **Origen y destino** en comprobantes de pago y transferencia de Mercado Pago. Solo asigna la billetera si cumple **todos** los requisitos:

1. El comprobante contiene estructura reconocida y número oficial de operación de Mercado Pago.
2. El origen muestra un CUIL válido de 11 dígitos y la institución **Mercado Pago** en el bloque de quien envió fondos (no en el destino).
3. El CUIL del emisor coincide con el CUIL **autorizado para el usuario de Atajos**, guardado en un Secret del backend.
4. El usuario posee **una sola cuenta activa** cuyo nombre normalizado es exactamente `Mercado Pago`.
5. No aparecen indicadores de tarjeta, crédito, débito o cuotas, que impedirían deducir la fuente real de fondos.

Si algo falta o es ambiguo, el movimiento se registra normalmente **sin asignar billetera**. La función **nunca asigna por ver el logo o el nombre de Mercado Pago en el destino**. No consulta ni altera las billeteras de otros usuarios.

La mejora clasifica la **billetera de origen**, no el tipo de movimiento. Una transferencia enviada desde Atajos continúa siendo `gasto` según la regla preexistente; una transferencia entre cuentas propias debe cargarse manualmente desde MERCA para que no se contabilice como gasto.

### Nuevo Secret privado (necesario para asignación automática)

Ir a **Supabase → Edge Functions → Secrets** y agregar:

- **Key:** `MERCA_CUILS_POR_USUARIO`
- **Value:** JSON válido con una entrada por usuario que autorice la detección. Ejemplo con datos ficticios:

```json
{
  "UUID_DE_AUTHENTICATION_DEL_PRIMER_USUARIO": "CUIL_DE_11_DIGITOS",
  "UUID_DE_AUTHENTICATION_DEL_SEGUNDO_USUARIO": "OTRO_CUIL_DE_11_DIGITOS"
}
```

Reemplazar los identificadores ficticios por los **UUID reales de Authentication → Users** (formato UUID con guiones) y los CUIL propios de 11 dígitos (sin guiones ni espacios), vistos en los comprobantes. La aplicación empareja el usuario mediante su token secreto anterior; **no se envían CUIL ni UUID desde Atajos**.

Si solo un usuario utiliza la función, dejar una sola entrada en el JSON. No crear ni modificar `MERCA_INGEST_USERS` por esta mejora: conservar exactamente los tokens actuales. No revelar ni compartir el JSON con nadie y no agregarlo al repositorio.

Si el Secret no está configurado, es inválido o no incluye al usuario, **todo sigue funcionando**; los comprobantes se registran con cuenta Sin asignar.

### Despliegue desde el Dashboard — procedimiento seguro

1. Verificar que tus billeteras ya estén creadas en **MERCA → Ajustes → Billeteras y cuentas**, con una única billetera **Mercado Pago**, activa, para cada usuario.
2. Abrir el [Dashboard de Supabase](https://supabase.com/dashboard) → proyecto de MERCA → **Edge Functions** → función existente **smooth-handler**.
3. Antes de editar, usar **Download** para hacer una copia local de la versión que funciona. Conservar también las configuraciones actuales de verificación JWT y los Secrets.
4. En **Edge Functions → Secrets**, guardar `MERCA_CUILS_POR_USUARIO` siguiendo el formato indicado más arriba. No tocar los secretos actuales.
5. Abrir la pestaña **Code** de `smooth-handler` y seleccionar el archivo principal `index.ts`. **Reemplazar todo su contenido** por el del archivo versionado [`index.ts`](../supabase/functions/smooth-handler/index.ts); no pegar solo fragmentos.
6. Hacer clic en **Deploy updates** de **esa misma función**. No crear otra función ni cambiar la URL del Atajo. Mantener la misma configuración de autenticación JWT que ya funcionaba con `x-merca-token`.
7. Comprobar que el despliegue se completó. Con un comprobante nuevo (no uno ya registrado) de Mercado Pago, compartir desde Atajos y verificar en MERCA → Movimientos que la **billetera** quedó Mercado Pago; después verificar el saldo de esa cuenta en Inicio.
8. Probar un comprobante no reconocido o con datos ambiguos: debe registrarse sin billetera, sin perder importe, fecha ni categoría. Verificar también una carga desde el Atajo del segundo usuario, si existe.
9. Si aparece un problema, recuperar el `index.ts` descargado del paso 3 y usar **Deploy updates**. Esto restaura el receptor anterior; la modificación de datos que haya ocurrido en comprobantes nuevos deberá revisarse desde MERCA si corresponde.

**Atención:** el código v10 se construyó desde la última versión multiusuario conservada en los archivos del proyecto. No hay acceso de lectura al contenido efectivo de la función que tenés desplegada hoy. Si hiciste modificaciones manuales posteriores, compará esas diferencias antes de sobrescribirla.

## Validación y duplicados

La detección de billetera se aplica **a comprobantes nuevos**. Un comprobante con la misma referencia externa que otro existente sigue sin duplicarse ni cambiar su cuenta asignada; se conserva la mejora anterior del destinatario si resulta más informativo.

Pruebas automáticas con documentos sintéticos que reproducen el formato de nuestros ejemplos se ejecutan con `npm test` desde GitHub; no contienen titulares reales, CUIL personales ni tokens privados.

## Mensajes que conserva Atajos

| Respuesta | Resultado |
| --- | --- |
| `Movimiento cargado exitosamente` | Guardado confirmado o comprobante previamente confirmado. |
| `Transacción a confirmar` | Guardado en estado pendiente de revisión. |
| `Error al cargar el movimiento` | No se pudo registrar válidamente. |

La detección de billetera no cambia esos mensajes ni requiere acciones nuevas en el Atajo.