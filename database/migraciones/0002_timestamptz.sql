-- ============================================================================
-- 0002_timestamptz.sql
--
-- Convierte todas las columnas `timestamp without time zone` a `timestamptz`.
--
-- Por que: las columnas sin zona guardan una hora "suelta" (sin offset). Mientras
-- la BD vivio en la maquina local (zona America/Caracas) coincidia, pero al mover
-- la BD a un proveedor externo (que corre en UTC) la hora se desfasa. `timestamptz`
-- guarda un INSTANTE absoluto: NOW() queda correcto sin importar donde corra la BD,
-- y el frontend lo muestra en America/Caracas.
--
-- Los valores existentes se interpretan como UTC (que es como los guarda el
-- servidor externo actual). Si alguna fila de prueba quedara corrida unas horas,
-- es data de prueba y no afecta la operacion real futura.
--
-- Idempotente: si una columna ya es timestamptz, se omite. Atomica: el migrador
-- ejecuta el archivo como un solo lote; si algo falla, revierte todo.
-- ============================================================================

DO $$
DECLARE
  col RECORD;
BEGIN
  FOR col IN
    SELECT c.table_name, c.column_name
    FROM information_schema.columns c
    JOIN information_schema.tables t
      ON t.table_schema = c.table_schema
     AND t.table_name = c.table_name
    WHERE c.table_schema = 'public'
      AND c.data_type = 'timestamp without time zone'
      AND t.table_type = 'BASE TABLE'
    ORDER BY c.table_name, c.column_name
  LOOP
    EXECUTE format(
      'ALTER TABLE public.%I ALTER COLUMN %I TYPE timestamptz(3) USING %I AT TIME ZONE %L',
      col.table_name, col.column_name, col.column_name, 'UTC'
    );
    RAISE NOTICE 'Convertida a timestamptz: %.%', col.table_name, col.column_name;
  END LOOP;
END $$;
