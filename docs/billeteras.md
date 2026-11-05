# Billeteras manuales de MERCA

## Qué cambia y qué no

- Las categorías siguen siendo independientes (Comida, Sueldo, Auto, etc.).
- Cada movimiento puede vincularse a una billetera: Mercado Pago, efectivo, banco, Prex, etc.
- Gastos e inversiones descuentan de la billetera de origen; los ingresos se suman a la de destino.
- Las transferencias entre cuentas propias restan y suman exactamente lo mismo; no son ingresos ni gastos.
- Las operaciones anteriores sin billetera siguen visibles como **Sin asignar**. No se borran ni se reasignan automáticamente.
- La función Supabase y los **Atajos de iOS no cambian**. Por ahora sus gastos seguirán sin billetera hasta su edición manual.
- Se conserva el balance por período y se muestra aparte el saldo global histórico.

## Paso a paso en Supabase

1. Abrir el proyecto correcto en https://supabase.com/dashboard → **SQL Editor**.
2. Recomendado: hacer respaldo de las tablas de cuentas y movimientos antes de cambiar el esquema.
3. Crear **New query**.
4. Copiar la migración completa del archivo [20261105_billeteras_manuales.sql](../supabase/migrations/20261105_billeteras_manuales.sql), incluidos BEGIN, COMMIT y las consultas finales.
5. Presionar **Run** como rol postgres.
6. Comprobar que aparece la columna saldo_inicial en la tabla public.cuentas (tipo numeric y default 0) y que existen las políticas merca_cuentas_*.
7. Abrir MERCA y presionar **Actualizar**. Entrar en **Ajustes → Billeteras y cuentas**.
8. Crear las billeteras necesarias (Mercado Pago, Efectivo, Banco, etc.).
9. Ir a **Movimientos → Editar** para asignar billeteras a operaciones históricas; también se puede hacer en **Inversiones**.
10. Verificar **Inicio → Dinero por billetera**: la suma de cuentas más Sin asignar debe coincidir con el dinero total disponible.

## Saldo de apertura

El saldo de apertura representa dinero anterior a los movimientos registrados en MERCA. No crea ingresos.

Ejemplo: comenzaste con $10.000, luego registraste un ingreso de $5.000 y un gasto de $2.000 en la misma cuenta. Su saldo será $13.000.

Si esos $10.000 ya aparecen como un ingreso, poné el saldo de apertura en **$0**, para no contabilizarlos dos veces.

Para clasificar movimientos históricos, conviene **iniciar con saldo de apertura cero**. Después de asignar operaciones anteriores, ajustá el saldo inicial solo si existe dinero previo aún no registrado.

## Comprobaciones

- Un gasto manual reduce el saldo de su billetera y el balance del período.
- Un ingreso manual aumenta el saldo de destino.
- Una inversión reduce el saldo de origen, sin sumarse a gastos de consumo.
- Una transferencia entre billeteras propias mueve dinero entre ambas sin modificar el total ni el balance del período.
- Al editar un gasto previo, se redistribuye el dinero entre la billetera anterior (o Sin asignar) y la nueva.
- Desactivar una billetera conserva su historial y saldo, pero deja de ofrecerla para nuevas operaciones.
- El atajo de iOS debe seguir creando gastos sin billetera, que luego pueden asignarse desde la web.

## Seguridad y compatibilidad

La migración agrega la columna saldo_inicial a la tabla de cuentas, políticas RLS para que cada usuario administre sus cuentas, y validaciones para vincular cada movimiento solo a cuentas del mismo usuario. No modifica categorías ni la Edge Function, no borra movimientos y puede ejecutarse más de una vez. Se realiza dentro de una transacción.

**Orden recomendado:** respaldar, ejecutar SQL, verificar y después utilizar la interfaz. La aplicación tiene una consulta alternativa para seguir funcionando si todavía no se ejecutó la migración.

Si surge un error SQL, conservar el mensaje y revisar el esquema existente antes de aplicar cambios adicionales.
