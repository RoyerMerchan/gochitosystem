-- =============================================================================
-- 0005 — Vuelto en los abonos
--
-- Un abono se cobra como cualquier otra plata que entra por la gaveta: el cliente
-- entrega un billete que casi nunca calza con lo que debe. Debe $ 9,50 y da $ 10;
-- se le abonan $ 9,50 y se le devuelven $ 0,50.
--
-- Hasta ahora eso era imposible: cualquier exceso mayor a un centavo lo rechazaba
-- ABONO_MAYOR_A_SALDO, asi que el cajero tecleaba 9,50 a mano y el medio dolar
-- salia de la gaveta sin quedar registrado en ninguna parte —la caja cerraba
-- sobrando y nadie sabia por que—.
--
-- Se copian las dos columnas que `pagos` ya tiene para exactamente esto. El vuelto
-- se entrega SIEMPRE en la moneda del abono, asi que no hace falta el equivalente
-- de pagos.cambio_moneda_codigo.
--
--   monto_moneda          -> lo que se ABONA a la deuda (lo que queda en la gaveta)
--   monto_recibido_moneda -> lo que el cliente ENTREGO
--   cambio_moneda         -> el vuelto devuelto (recibido - abonado)
--
-- Idempotente: correrla dos veces no hace nada la segunda vez.
-- =============================================================================

ALTER TABLE abonos ADD COLUMN IF NOT EXISTS monto_recibido_moneda DECIMAL(18,4);
ALTER TABLE abonos ADD COLUMN IF NOT EXISTS cambio_moneda         DECIMAL(18,4);

-- Los abonos historicos se cobraron sin vuelto posible: lo recibido fue lo abonado.
UPDATE abonos
   SET monto_recibido_moneda = monto_moneda,
       cambio_moneda         = 0
 WHERE monto_recibido_moneda IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_abonos_cambio') THEN
    ALTER TABLE abonos ADD CONSTRAINT ck_abonos_cambio
      CHECK (cambio_moneda IS NULL OR cambio_moneda >= 0);
  END IF;

  -- El vuelto sale del billete que el cliente puso sobre el mostrador: lo recibido
  -- es siempre lo abonado mas lo devuelto, sin holgura. Si esta cuenta no cierra,
  -- el arqueo del turno tampoco va a cerrar.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_abonos_recibido') THEN
    ALTER TABLE abonos ADD CONSTRAINT ck_abonos_recibido
      CHECK (monto_recibido_moneda IS NULL
             OR monto_recibido_moneda = monto_moneda + COALESCE(cambio_moneda, 0));
  END IF;
END $$;

COMMENT ON COLUMN abonos.monto_recibido_moneda IS 'Lo que el cliente entrego, en la moneda del abono';
COMMENT ON COLUMN abonos.cambio_moneda IS 'Vuelto devuelto al cliente, en la moneda del abono';
