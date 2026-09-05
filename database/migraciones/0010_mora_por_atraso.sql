-- =============================================================================
-- 0010 — Mora por atraso en las ventas fiadas
--
-- EL PROBLEMA
-- Un fiado vence y no pasa absolutamente nada: el saldo cambia de columna en la
-- cartera y ya. No hay recargo, no hay presion para pagar, y el que se atrasa
-- tres meses debe exactamente lo mismo que el que pago el dia acordado.
--
-- LA SOLUCION
-- Cada venta fiada guarda el porcentaje de mora que se pacto en el mostrador
-- (`creditos.tasa_mora_pct`). Cuando pasa la fecha de vencimiento con saldo
-- vivo, se cobra UNA sola vez ese porcentaje sobre LO QUE QUEDA DEBIENDO —el que
-- ya abono casi todo paga una mora chiquita, que es lo que espera el cliente—.
--
-- La mora NO se suma al saldo de la factura: nace como su propio credito, atado
-- al original por `credito_origen_id`. Asi el estado de cuenta muestra "V-2428
-- $ 1,99" y debajo "Mora V-2428 $ 0,10", el cliente ve de donde salio el
-- aumento, y el abono FIFO la cobra sola sin logica nueva.
--
-- Por que `origen = 'NOTA_DEBITO'` y no un valor nuevo del enum: ALTER TYPE ...
-- ADD VALUE no se puede usar en la misma transaccion que lo agrega, y el
-- migrador corre cada archivo como un lote. Una mora ES una nota de debito; lo
-- que la distingue de cualquier otra es tener `credito_origen_id`.
--
-- SIN CRON
-- El backend no tiene tareas programadas, asi que la mora se devenga sola la
-- primera vez que alguien mira la cartera, abre un estado de cuenta o registra
-- un abono. Es idempotente: el indice unico de abajo garantiza UNA mora por
-- factura aunque dos cajeros abran la pantalla al mismo tiempo.
-- =============================================================================

ALTER TABLE creditos
  ADD COLUMN IF NOT EXISTS tasa_mora_pct     DECIMAL(5,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS mora_aplicada_en  TIMESTAMPTZ(3),
  ADD COLUMN IF NOT EXISTS credito_origen_id BIGINT;

COMMENT ON COLUMN creditos.tasa_mora_pct IS
  'Porcentaje de recargo pactado para esta factura si se pasa del vencimiento. 0 = sin mora.';
COMMENT ON COLUMN creditos.mora_aplicada_en IS
  'Cuando se devengo la mora de esta factura. NULL = todavia no se le aplico.';
COMMENT ON COLUMN creditos.credito_origen_id IS
  'En una fila de mora, la factura que la genero. NULL en las facturas normales.';

ALTER TABLE creditos DROP CONSTRAINT IF EXISTS creditos_tasa_mora_pct_check;
ALTER TABLE creditos ADD CONSTRAINT creditos_tasa_mora_pct_check
  CHECK (tasa_mora_pct >= 0 AND tasa_mora_pct <= 100);

ALTER TABLE creditos DROP CONSTRAINT IF EXISTS creditos_credito_origen_fk;
ALTER TABLE creditos ADD CONSTRAINT creditos_credito_origen_fk
  FOREIGN KEY (credito_origen_id) REFERENCES creditos(id);

-- UNA mora por factura. Es lo que hace idempotente al devengo perezoso: si dos
-- peticiones lo intentan a la vez, la segunda choca aqui y no duplica el cobro.
CREATE UNIQUE INDEX IF NOT EXISTS ux_creditos_mora_por_credito
  ON creditos (credito_origen_id) WHERE credito_origen_id IS NOT NULL;

-- El barrido de devengo corre en cada lectura de cartera: que sea barato.
CREATE INDEX IF NOT EXISTS ix_creditos_mora_pendiente
  ON creditos (fecha_vencimiento)
  WHERE tasa_mora_pct > 0 AND mora_aplicada_en IS NULL AND credito_origen_id IS NULL;

-- Porcentaje que el POS propone por defecto al fiar, para no teclearlo cada vez.
ALTER TABLE configuracion
  ADD COLUMN IF NOT EXISTS mora_pct_defecto DECIMAL(5,2) NOT NULL DEFAULT 0;

ALTER TABLE configuracion DROP CONSTRAINT IF EXISTS configuracion_mora_pct_defecto_check;
ALTER TABLE configuracion ADD CONSTRAINT configuracion_mora_pct_defecto_check
  CHECK (mora_pct_defecto >= 0 AND mora_pct_defecto <= 100);
