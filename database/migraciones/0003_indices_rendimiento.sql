-- =============================================================================
-- 0003 — Indices de rendimiento
--
-- Indices que faltaban para consultas que ya existen y se corren a diario. No
-- cambian ningun resultado: solo evitan que Postgres recorra la tabla entera.
--
-- Solo se agregan los que NO estan cubiertos por un indice existente: cada indice
-- de mas encarece los INSERT, y estas son tablas que crecen con cada venta.
--
-- Idempotente (IF NOT EXISTS). El runner corre cada sentencia en autocommit, asi
-- que el bloqueo de cada CREATE INDEX dura lo que tarda en construirse: con el
-- volumen de un minimarket, milisegundos.
-- =============================================================================

-- Historial de ventas: se filtra por sucursal y se ordena por id descendente.
-- El indice existente (sucursal_id, fecha, estado) resuelve el filtro por fecha,
-- pero no el ORDER BY v.id DESC del listado paginado, que es el caso comun.
CREATE INDEX IF NOT EXISTS ix_ventas_suc_id ON ventas (sucursal_id, id DESC);

-- Cobros por rango de fechas: los usa la correlacion con banco y los cortes por
-- periodo. `pagos` solo tenia indices por venta/turno/metodo, ninguno por fecha.
CREATE INDEX IF NOT EXISTS ix_pagos_suc_fecha ON pagos (sucursal_id, fecha);
CREATE INDEX IF NOT EXISTS ix_abonos_suc_fecha ON abonos (sucursal_id, fecha);

-- Listado de productos: ordena por nombre descartando los eliminados. El indice
-- de texto completo existente no sirve para ORDER BY ni para ILIKE '%algo%'.
CREATE INDEX IF NOT EXISTS ix_productos_nombre ON productos (nombre) WHERE eliminado_en IS NULL;

-- Renglones de una venta. El unico indice que habia empieza por producto_id, asi
-- que abrir el detalle de un ticket (WHERE venta_id = ?) no lo podia usar.
CREATE INDEX IF NOT EXISTS ix_venta_detalle_venta ON venta_detalle (venta_id);

-- Creditos vivos de un cliente en orden FIFO: es la consulta que hace cada abono.
-- El indice existente ordena por fecha_vencimiento, no por fecha_emision, que es
-- el orden real de aplicacion. Parcial: solo indexa la deuda viva, no lo pagado.
CREATE INDEX IF NOT EXISTS ix_creditos_pendientes
  ON creditos (cliente_id, fecha_emision, id)
  WHERE estado IN ('PENDIENTE', 'PARCIAL', 'VENCIDO');

-- Estadisticas frescas para que el planificador use los indices nuevos de una vez
-- y no espere al autovacuum.
ANALYZE ventas;
ANALYZE pagos;
ANALYZE abonos;
ANALYZE productos;
ANALYZE venta_detalle;
ANALYZE creditos;
