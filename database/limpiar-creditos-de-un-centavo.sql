-- ============================================================================
-- limpiar-creditos-de-un-centavo.sql   (EJECUCION MANUAL)
--
-- Cierra las "deudas fantasma" de $ 0,01 que dejaron las ventas registradas ANTES
-- del arreglo de redondeo del POS.
--
-- QUE PASABA: el total de la pantalla se calculaba sumando los renglones en crudo y
-- redondeando al final, mientras el backend redondea CADA renglon y despues suma. En
-- toda venta con cantidad fraccionada los dos totales diferian en un centavo, el
-- cajero cobraba el de pantalla y el backend abria un credito de $ 0,01 por la
-- diferencia. Ya esta corregido en el codigo (lib/calculoVenta.ts + TOLERANCIA_REDONDEO
-- en pos.service.ts); este script solo limpia lo que quedo en la base.
--
-- QUE HACE: marca esos creditos como PAGADO con saldo 0 y baja el saldo del cliente.
-- No toca la venta ni el inventario ni la caja: esa plata nunca se cobro ni se debia.
-- No crea abonos (no hubo cobro real que registrar en caja).
--
-- SOLO afecta creditos cuyo saldo vivo es <= $ 0,01. Una deuda real de $ 5 no se toca.
--
-- Uso:
--   psql "$DATABASE_URL" -f database/limpiar-creditos-de-un-centavo.sql
--
-- Revisa la primera consulta antes de dejar que haga COMMIT: si aparece algun credito
-- que SI es una deuda legitima de un centavo, aborta con ROLLBACK en vez de COMMIT.
-- ============================================================================

BEGIN;

-- 1. Lo que se va a cerrar (para tu registro).
SELECT cr.id            AS credito_id,
       c.nombre         AS cliente,
       v.prefijo || v.numero AS documento,
       v.total_usd,
       cr.monto_original_usd,
       cr.saldo_usd,
       cr.estado,
       cr.fecha_emision
FROM creditos cr
JOIN clientes c ON c.id = cr.cliente_id
LEFT JOIN ventas v ON v.id = cr.venta_id
WHERE cr.estado IN ('PENDIENTE', 'PARCIAL', 'VENCIDO')
  AND cr.saldo_usd > 0
  AND cr.saldo_usd <= 0.01
ORDER BY c.nombre, cr.fecha_emision;

-- 2. Baja el saldo de cada cliente por lo que se le va a condonar.
WITH residuos AS (
  SELECT cliente_id, SUM(saldo_usd) AS total
  FROM creditos
  WHERE estado IN ('PENDIENTE', 'PARCIAL', 'VENCIDO')
    AND saldo_usd > 0
    AND saldo_usd <= 0.01
  GROUP BY cliente_id
)
UPDATE clientes c
SET saldo_actual = GREATEST(0, c.saldo_actual - r.total)
FROM residuos r
WHERE c.id = r.cliente_id;

-- 3. Cierra los creditos residuales.
UPDATE creditos
SET saldo_usd = 0,
    estado    = 'PAGADO',
    pagado_en = NOW()
WHERE estado IN ('PENDIENTE', 'PARCIAL', 'VENCIDO')
  AND saldo_usd > 0
  AND saldo_usd <= 0.01;

-- 4. Confirma que no quedo ningun residuo y muestra los saldos resultantes.
SELECT COUNT(*) AS residuos_pendientes
FROM creditos
WHERE estado IN ('PENDIENTE', 'PARCIAL', 'VENCIDO')
  AND saldo_usd > 0
  AND saldo_usd <= 0.01;

SELECT c.id, c.nombre, c.saldo_actual
FROM clientes c
WHERE c.saldo_actual > 0 AND c.eliminado_en IS NULL
ORDER BY c.saldo_actual DESC;

COMMIT;
