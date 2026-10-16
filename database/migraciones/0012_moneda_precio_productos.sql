-- Los importes de venta se conservan en la moneda elegida; costos siguen en USD.
BEGIN;
ALTER TABLE productos ADD COLUMN IF NOT EXISTS moneda_precio VARCHAR(3) NOT NULL DEFAULT 'USD'
  CHECK (moneda_precio IN ('USD', 'VES'));
COMMIT;
