-- ============================================================================
-- reiniciar-contadores.sql   (EJECUCION MANUAL, UNA SOLA VEZ)
--
-- Pone en 0 el contador de todos los consecutivos (ventas, compras, abonos,
-- devoluciones). La proxima venta real empezara en V-1, la proxima compra en
-- C-1, etc.
--
-- NO borra ninguna venta ni movimiento: solo reinicia el contador.
--
-- IMPORTANTE:
--   * NO conviertas esto en migracion automatica: se re-aplicaria en cada deploy
--     y reiniciaria el consecutivo aun con ventas reales cargadas.
--   * Ejecutalo UNA vez, ahora que la data es de prueba.
--
-- Uso:
--   psql "$DATABASE_URL" -f database/reiniciar-contadores.sql
--   (o pega el contenido en tu cliente SQL)
--
-- Nota sobre choques de numero: las ventas de prueba viejas usan numeros tipo
-- 11111, 111111, ... El indice unico uq_ventas_numero es (sucursal, anio, prefijo,
-- numero). Los nuevos numeros (1, 2, 3, ...) no chocan hasta llegar a 11111, asi
-- que tienes margen de sobra. Si quisieras cero riesgo, borra antes las ventas de
-- prueba (opcion "reset total").
-- ============================================================================

BEGIN;

-- Muestra el estado actual (para tu registro antes de tocar nada).
SELECT sucursal_id, tipo_documento, anio, prefijo, ultimo_numero AS antes
FROM consecutivos
ORDER BY sucursal_id, tipo_documento, anio;

UPDATE consecutivos SET ultimo_numero = 0;

-- Confirma el resultado.
SELECT sucursal_id, tipo_documento, anio, prefijo, ultimo_numero AS despues
FROM consecutivos
ORDER BY sucursal_id, tipo_documento, anio;

COMMIT;
