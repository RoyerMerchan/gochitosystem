-- =============================================================================
-- 0011 — Mora recurrente: un tramo cada N dias de atraso
--
-- EL PROBLEMA
-- La mora de la 0010 se cobra UNA sola vez. El que se pasa un dia y el que se
-- pasa un mes pagan el mismo recargo: despues del primer golpe no hay ninguna
-- razon para apurarse a pagar.
--
-- LA SOLUCION
-- Despues del vencimiento, cada `mora_cada_dias` dias de atraso se suma OTRO
-- tramo del porcentaje pactado sobre LO QUE QUEDE DEBIENDO de la factura
-- (10% cada 3 dias: al dia 3 lleva 10%, al dia 6 lleva 20%, al dia 9 lleva 30%).
-- Es mora simple: el recargo se calcula siempre sobre el saldo de la FACTURA,
-- nunca sobre la mora acumulada. El recargo no genera recargo.
--
-- SIGUE SIENDO UNA SOLA FILA DE MORA POR FACTURA
-- Cada tramo NO nace como un credito aparte: se le SUMA a la fila "Mora V-2428"
-- que ya existe (o se crea si es el primero). Una factura con un mes de atraso
-- seria diez renglones de $ 0,20 en el estado de cuenta; asi es uno solo que
-- dice "Mora V-2428 (10 tramos)". Si esa fila ya estaba pagada y cae un tramo
-- nuevo, se reabre con lo que falta. El indice unico `ux_creditos_mora_por_credito`
-- se queda: sigue garantizando una sola fila y hace atomico el "sumar al que
-- ya esta" (INSERT ... ON CONFLICT DO UPDATE).
--
-- `mora_tramos` cuenta los tramos ya cobrados en la factura; el devengo compara
-- eso contra los tramos que corresponden por calendario y cobra la diferencia.
-- Si nadie abrio la cartera en nueve dias, al abrirla caen tres tramos de golpe.
--
-- `mora_cada_dias` se guarda EN LA FACTURA (como `tasa_mora_pct`): es la
-- condicion que se pacto ese dia en el mostrador. Cambiar la configuracion no
-- toca los fiados ya hechos. 0 = una sola vez, como se comportaba la 0010.
--
-- `mora_aplicada_en` pasa a ser "ultima vez que se devengo" (antes era "ya se
-- cobro la unica mora").
-- =============================================================================

ALTER TABLE configuracion
  ADD COLUMN IF NOT EXISTS mora_cada_dias INTEGER NOT NULL DEFAULT 3;

ALTER TABLE configuracion DROP CONSTRAINT IF EXISTS configuracion_mora_cada_dias_check;
ALTER TABLE configuracion ADD CONSTRAINT configuracion_mora_cada_dias_check
  CHECK (mora_cada_dias >= 0 AND mora_cada_dias <= 365);

COMMENT ON COLUMN configuracion.mora_cada_dias IS
  'Cada cuantos dias de atraso se suma otro tramo de mora a un fiado nuevo. 0 = una sola vez.';

ALTER TABLE creditos
  ADD COLUMN IF NOT EXISTS mora_cada_dias INTEGER NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS mora_tramos    INTEGER NOT NULL DEFAULT 0;

ALTER TABLE creditos DROP CONSTRAINT IF EXISTS creditos_mora_cada_dias_check;
ALTER TABLE creditos ADD CONSTRAINT creditos_mora_cada_dias_check
  CHECK (mora_cada_dias >= 0 AND mora_cada_dias <= 365);

ALTER TABLE creditos DROP CONSTRAINT IF EXISTS creditos_mora_tramos_check;
ALTER TABLE creditos ADD CONSTRAINT creditos_mora_tramos_check
  CHECK (mora_tramos >= 0);

COMMENT ON COLUMN creditos.mora_cada_dias IS
  'Cada cuantos dias de atraso se suma otro tramo de tasa_mora_pct. 0 = una sola vez al vencer.';
COMMENT ON COLUMN creditos.mora_tramos IS
  'Tramos de mora ya cobrados a esta factura. El devengo cobra la diferencia con los que tocan por calendario.';
COMMENT ON COLUMN creditos.mora_aplicada_en IS
  'Ultima vez que se le devengo mora a esta factura. NULL = todavia ninguna.';

-- Las facturas que ya recibieron su mora unica de la 0010 llevan un tramo cobrado.
UPDATE creditos
   SET mora_tramos = 1
 WHERE mora_aplicada_en IS NOT NULL
   AND credito_origen_id IS NULL
   AND mora_tramos = 0;

-- El barrido ya no puede filtrar por "mora sin aplicar": ahora vuelve a mirar
-- todas las facturas vencidas con saldo vivo, por si les toca otro tramo.
DROP INDEX IF EXISTS ix_creditos_mora_pendiente;
CREATE INDEX IF NOT EXISTS ix_creditos_mora_pendiente
  ON creditos (fecha_vencimiento)
  WHERE tasa_mora_pct > 0 AND credito_origen_id IS NULL AND saldo_usd > 0;
