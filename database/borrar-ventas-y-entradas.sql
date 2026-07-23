-- ============================================================================
-- borrar-ventas-y-entradas.sql   (EJECUCION MANUAL, sobre la BD real)
--
-- Borra TODAS las ventas y TODAS las entradas de mercancia (compras), y reinicia
-- sus contadores: la proxima venta sera V-1 y la proxima entrada C-1.
--
-- Que borra (solo la cadena que CUELGA de cada venta/compra; la BD lo exige por
-- las FK ON DELETE RESTRICT):
--   VENTAS:  venta_detalle, pagos, creditos de venta (+aplicaciones de abono),
--            devoluciones de venta (+detalle), inventario_movimientos de venta.
--   COMPRAS: compra_detalle, devoluciones de compra (+detalle),
--            inventario_movimientos de compra.
--
-- Que NO toca:
--   - producto_stock (EXISTENCIAS): las cantidades quedan igual.
--   - productos, clientes, proveedores, caja, usuarios, config: intactos.
--
-- Nota honesta: se borra el RASTRO de inventario de ventas y compras, pero NO se
-- recalcula el stock. Como las compras eran las que sumaban existencias y las
-- ventas las que restaban, tras esto el producto_stock queda tal cual esta ahora
-- (con lo que dejaron las pruebas). Los movimientos de caja tampoco se tocan.
-- Es lo que pediste: borrar los registros, sin tocar inventario.
--
-- Todo va en UNA transaccion: si algo falla, no se borra nada.
--
-- Uso:
--   psql "$DATABASE_URL" -f database/borrar-ventas-y-entradas.sql
-- ============================================================================

BEGIN;

-- Estado ANTES.
SELECT 'ANTES' AS momento, 'ventas' AS tabla, COUNT(*) AS filas FROM ventas
UNION ALL SELECT 'ANTES', 'compras', COUNT(*) FROM compras
UNION ALL SELECT 'ANTES', 'pagos', COUNT(*) FROM pagos
UNION ALL SELECT 'ANTES', 'inv_mov', COUNT(*) FROM inventario_movimientos;

-- =====================  VENTAS  =====================
DELETE FROM abono_aplicaciones
 WHERE credito_id IN (SELECT id FROM creditos WHERE venta_id IS NOT NULL);
DELETE FROM pagos;
DELETE FROM inventario_movimientos
 WHERE devolucion_id IN (SELECT id FROM devoluciones WHERE venta_id IS NOT NULL);
DELETE FROM devolucion_detalle
 WHERE devolucion_id IN (SELECT id FROM devoluciones WHERE venta_id IS NOT NULL);
DELETE FROM devoluciones WHERE venta_id IS NOT NULL;
DELETE FROM inventario_movimientos WHERE venta_id IS NOT NULL;
DELETE FROM creditos WHERE venta_id IS NOT NULL;
DELETE FROM venta_detalle;
DELETE FROM ventas;

-- =====================  COMPRAS (entradas de mercancia)  =====================
DELETE FROM inventario_movimientos
 WHERE devolucion_id IN (SELECT id FROM devoluciones WHERE compra_id IS NOT NULL);
DELETE FROM devolucion_detalle
 WHERE devolucion_id IN (SELECT id FROM devoluciones WHERE compra_id IS NOT NULL);
DELETE FROM devoluciones WHERE compra_id IS NOT NULL;
DELETE FROM inventario_movimientos WHERE compra_id IS NOT NULL;
DELETE FROM compra_detalle;
DELETE FROM compras;

-- =====================  Contadores a 0  =====================
UPDATE consecutivos SET ultimo_numero = 0
 WHERE tipo_documento IN ('VENTA', 'COMPRA');

-- Estado DESPUES.
SELECT 'DESPUES' AS momento, 'ventas' AS tabla, COUNT(*) AS filas FROM ventas
UNION ALL SELECT 'DESPUES', 'compras', COUNT(*) FROM compras
UNION ALL SELECT 'DESPUES', 'pagos', COUNT(*) FROM pagos
UNION ALL SELECT 'DESPUES', 'contador_venta',
       (SELECT ultimo_numero FROM consecutivos WHERE tipo_documento='VENTA' LIMIT 1)
UNION ALL SELECT 'DESPUES', 'contador_compra',
       (SELECT ultimo_numero FROM consecutivos WHERE tipo_documento='COMPRA' LIMIT 1);

COMMIT;
