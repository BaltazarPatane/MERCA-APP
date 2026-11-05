-- MERCA | Billeteras manuales y saldos de apertura.
-- Ejecutar completo en Supabase SQL Editor, como rol postgres.
-- No elimina ni reescribe cuentas, movimientos, categorias ni comprobantes.
-- Idempotente: puede ejecutarse nuevamente sin duplicar columnas o politicas.

BEGIN;

DO $$
BEGIN
  IF to_regclass('public.cuentas') IS NULL OR to_regclass('public.movimientos') IS NULL THEN
    RAISE EXCEPTION 'Faltan public.cuentas o public.movimientos. Verifica primero el esquema existente.';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'cuentas' AND column_name = 'user_id'
  ) THEN
    RAISE EXCEPTION 'Falta public.cuentas.user_id. No se pueden garantizar billeteras privadas.';
  END IF;
END $$;

ALTER TABLE public.cuentas
  ADD COLUMN IF NOT EXISTS saldo_inicial numeric(15,2) NOT NULL DEFAULT 0;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.cuentas'::regclass AND conname = 'merca_cuentas_saldo_inicial_no_negativo'
  ) THEN
    ALTER TABLE public.cuentas
      ADD CONSTRAINT merca_cuentas_saldo_inicial_no_negativo CHECK (saldo_inicial >= 0);
  END IF;
END $$;

COMMENT ON COLUMN public.cuentas.saldo_inicial IS
  'Saldo de apertura que se suma al resultado de los movimientos asignados. No registrar aqui fondos ya contabilizados como ingreso.';

ALTER TABLE public.cuentas ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE ON TABLE public.cuentas TO authenticated;

-- Politicas propias (no se borran ni modifican politicas anteriores).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='cuentas' AND policyname='merca_cuentas_select_propias') THEN
    CREATE POLICY merca_cuentas_select_propias ON public.cuentas FOR SELECT TO authenticated
      USING (user_id = (select auth.uid()));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='cuentas' AND policyname='merca_cuentas_insert_propias') THEN
    CREATE POLICY merca_cuentas_insert_propias ON public.cuentas FOR INSERT TO authenticated
      WITH CHECK (user_id = (select auth.uid()));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='cuentas' AND policyname='merca_cuentas_update_propias') THEN
    CREATE POLICY merca_cuentas_update_propias ON public.cuentas FOR UPDATE TO authenticated
      USING (user_id = (select auth.uid()))
      WITH CHECK (user_id = (select auth.uid()));
  END IF;
END $$;

-- Defensa adicional: si un movimiento se asigna a una cuenta, debe ser del mismo usuario.
-- Las cuentas nulas (Atajos y movimientos historicos) siguen siendo validas.
CREATE OR REPLACE FUNCTION public.merca_validar_cuentas_movimiento()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NEW.cuenta_origen_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.cuentas
    WHERE id = NEW.cuenta_origen_id AND user_id = NEW.user_id
  ) THEN
    RAISE EXCEPTION 'Cuenta de origen inexistente o perteneciente a otro usuario'
      USING ERRCODE = '23503';
  END IF;
  IF NEW.cuenta_destino_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.cuentas
    WHERE id = NEW.cuenta_destino_id AND user_id = NEW.user_id
  ) THEN
    RAISE EXCEPTION 'Cuenta de destino inexistente o perteneciente a otro usuario'
      USING ERRCODE = '23503';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS merca_movimiento_cuentas_mismo_usuario ON public.movimientos;
CREATE TRIGGER merca_movimiento_cuentas_mismo_usuario
  BEFORE INSERT OR UPDATE OF user_id, cuenta_origen_id, cuenta_destino_id
  ON public.movimientos
  FOR EACH ROW EXECUTE FUNCTION public.merca_validar_cuentas_movimiento();

COMMIT;

-- Verificacion de solo lectura: ejecutar despues de la migracion.
SELECT column_name, data_type, column_default, is_nullable
FROM information_schema.columns
WHERE table_schema='public' AND table_name='cuentas'
  AND column_name IN ('id','user_id','nombre','tipo','moneda','activa','saldo_inicial')
ORDER BY ordinal_position;

SELECT policyname, cmd, roles
FROM pg_policies
WHERE schemaname='public' AND tablename='cuentas'
ORDER BY policyname;
