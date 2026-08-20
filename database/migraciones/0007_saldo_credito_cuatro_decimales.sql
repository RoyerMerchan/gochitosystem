-- =============================================================================
-- 0007 — El libro de creditos pasa a 4 decimales de dolar
--
-- EL PROBLEMA
-- La deuda vive en USD con 2 decimales, pero el cliente abona en bolivares. Con la
-- tasa a 777,42 Bs/$ un centavo de dolar vale Bs 7,77: ese es el grano mas fino que
-- el libro sabia representar, y cualquier abono en Bs que no cayera justo sobre un
-- centavo redondo se perdia contra ese grano.
--
-- Peor: la conversion usa piso (`montoMonedaAUsdPiso`), pensado para no acreditar
-- dolares que el cliente no entrego. Como el piso siempre cae del mismo lado, el
-- sobrante nunca se compensaba y el cobro de mas era sistematico.
--
--   Miguel Medina, V-1552:
--     deuda    $ 9,02 x 777,42            = Bs 7.012,33
--     abono    Bs 7.000,00 / 777,42       = $ 9,004142...  -> truncado a $ 9,00
--     saldo    $ 9,02 - $ 9,00 = $ 0,02   = Bs 15,55
--     real     Bs 7.012,33 - Bs 7.000,00  = Bs 12,33
--                                           -------------
--     cobrado de mas                        Bs 3,22
--
-- Con la tasa en 40 Bs/$ el mismo error eran Bs 0,40 y pasaba por ruido: de ahi
-- salieron `limpiar-creditos-de-un-centavo.sql` y la TOLERANCIA_CIERRE de 1 centavo,
-- que son parches a este mismo grano grueso. A 777 Bs/$ el error pesa 19 veces mas
-- y el cliente lo nota en el mostrador.
--
-- LA CORRECCION
-- El libro de creditos pasa a DECIMAL(14,4). El grano baja de $ 0,01 (Bs 7,77) a
-- $ 0,0001 (Bs 0,08): el residuo de una division por la tasa ya cabe en el saldo y
-- deja de haber cobro de mas.
--
-- NO se toca lo que es dinero fisico ni lo que se cuenta en el arqueo:
--   - ventas.total_usd y creditos.monto_original_usd siguen en 2 decimales; una
--     factura se emite en centavos redondos y asi debe quedar impresa.
--   - turnos_caja, movimientos_caja y el vuelto siguen en centavos: nadie entrega
--     $ 9,0041 en billetes.
-- Solo cambia el SALDO, que es un apunte contable y no un billete.
--
-- Esta migracion no reescribe saldos historicos: los abonos ya cobrados se quedan
-- como estan. Corrige de aqui en adelante.
--
-- Idempotente: solo actua sobre las columnas que todavia estan en escala 2.
-- =============================================================================

DO $$
DECLARE
  objetivo CONSTANT TEXT[][] := ARRAY[
    ['creditos',           'saldo_usd'],
    ['clientes',           'saldo_actual'],
    ['abonos',             'monto_usd'],
    ['abonos',             'monto_aplicado_usd'],
    ['abonos',             'saldo_a_favor_usd'],
    ['abono_aplicaciones', 'monto_aplicado_usd']
  ];
  tabla   TEXT;
  columna TEXT;
  i       INTEGER;
BEGIN
  FOR i IN 1 .. array_length(objetivo, 1) LOOP
    tabla   := objetivo[i][1];
    columna := objetivo[i][2];

    -- Solo si la columna existe y sigue en 2 decimales. Asi la migracion se puede
    -- reintentar sin reescribir tablas que ya estan convertidas.
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
       WHERE table_schema = current_schema()
         AND table_name   = tabla
         AND column_name  = columna
         AND numeric_scale < 4
    ) THEN
      EXECUTE format('ALTER TABLE %I ALTER COLUMN %I TYPE DECIMAL(14,4)', tabla, columna);
      RAISE NOTICE 'saldo a 4 decimales: %.%', tabla, columna;
    END IF;
  END LOOP;
END $$;

COMMENT ON COLUMN creditos.saldo_usd IS
  'Saldo pendiente en USD, escala 4. Fino para que un abono en Bs no deje residuo de centavo';
COMMENT ON COLUMN abonos.monto_usd IS
  'Equivalente USD del abono, escala 4. La caja lo valora aparte en centavos';
COMMENT ON COLUMN clientes.saldo_actual IS
  'Espejo desnormalizado de la deuda en USD, escala 4. La fuente real es SUM(creditos.saldo_usd)';
