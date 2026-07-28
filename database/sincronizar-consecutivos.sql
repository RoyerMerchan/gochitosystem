-- ============================================================================
-- sincronizar-consecutivos.sql   (EJECUCION MANUAL, sobre la BD real)
--
-- Repara el error "Ya existe un registro con esos datos" al facturar, ingresar
-- mercancia o registrar un abono.
--
-- Causa: el contador de `consecutivos` quedo POR DEBAJO del numero mas alto que
-- ya usan los documentos (tipico despues de correr reiniciar-contadores.sql con
-- ventas/abonos ya cargados). El contador propone un numero ocupado, choca con
-- el indice unico (sucursal, anio, prefijo, numero) y el cajero queda trancado:
-- reintentar no sirve, siempre propone el mismo numero.
--
-- Esto pone cada contador en el numero mas alto REALMENTE usado, sin tocar ni un
-- documento. El proximo documento sale con el siguiente numero libre.
--
-- Uso:
--   psql "$DATABASE_URL" -f database/sincronizar-consecutivos.sql
-- ============================================================================

BEGIN;

-- Estado ANTES.
SELECT 'ANTES' AS momento, sucursal_id, tipo_documento, anio, prefijo, ultimo_numero
  FROM consecutivos ORDER BY sucursal_id, tipo_documento, anio;

WITH usados AS (
  SELECT 'VENTA'  AS tipo_documento, sucursal_id, anio, prefijo, MAX(numero) AS maximo
    FROM ventas   GROUP BY sucursal_id, anio, prefijo
  UNION ALL
  SELECT 'COMPRA', sucursal_id, anio, prefijo, MAX(numero)
    FROM compras  GROUP BY sucursal_id, anio, prefijo
  UNION ALL
  SELECT 'ABONO',  sucursal_id, anio, prefijo, MAX(numero)
    FROM abonos   GROUP BY sucursal_id, anio, prefijo
  UNION ALL
  SELECT 'AJUSTE', sucursal_id, anio, prefijo, MAX(numero)
    FROM ajustes_inventario GROUP BY sucursal_id, anio, prefijo
)
UPDATE consecutivos c
   SET ultimo_numero = GREATEST(c.ultimo_numero, u.maximo)
  FROM usados u
 WHERE c.tipo_documento = u.tipo_documento
   AND c.sucursal_id    = u.sucursal_id
   AND c.anio           = u.anio
   AND c.prefijo        = u.prefijo
   AND c.ultimo_numero  < u.maximo;

-- Estado DESPUES.
SELECT 'DESPUES' AS momento, sucursal_id, tipo_documento, anio, prefijo, ultimo_numero
  FROM consecutivos ORDER BY sucursal_id, tipo_documento, anio;

COMMIT;
