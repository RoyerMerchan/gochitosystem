/**
 * Reportes y dashboard. Todos los montos van en USD y en Bs.
 *   - El USD sale de las columnas en USD.
 *   - El Bs se calcula con la tasa CONGELADA de cada venta (ventas.tasa_cambio),
 *     nunca la de hoy. La utilidad SIEMPRE desde venta_detalle.utilidad_total.
 */
import { Router, type Request } from 'express';
import { z } from 'zod';
import { validar, datosQuery } from '../../middlewares/validar';
import { autenticar, usuarioActual } from '../../middlewares/autenticacion';
import { requierePermiso } from '../../middlewares/autorizacion';
import { enviarOk } from '../../utils/respuesta';
import { queryReporte } from '../../database/pool';

const router = Router();
router.use(autenticar);

const esquemaRango = z.object({
  desde: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  hasta: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  limite: z.coerce.number().int().min(1).max(200).optional().default(20),
});
type Rango = z.infer<typeof esquemaRango>;

/** WHERE de rango de fechas sobre ventas cerradas. */
function rangoVentas(q: Rango, sucursalId: number): { where: string; params: (string | number)[] } {
  const cond = ["v.estado = 'CERRADA'", 'v.sucursal_id = ?'];
  const params: (string | number)[] = [sucursalId];
  if (q.desde) { cond.push('v.fecha >= ?'); params.push(`${q.desde} 00:00:00`); }
  if (q.hasta) { cond.push('v.fecha <= ?'); params.push(`${q.hasta} 23:59:59`); }
  return { where: cond.join(' AND '), params };
}

// ---------------------------------------------------------------------------
// VENTAS: mas vendidos / menos vendidos
// ---------------------------------------------------------------------------
async function masVendidos(q: Rango, sucursalId: number, orden: 'DESC' | 'ASC') {
  const { where, params } = rangoVentas(q, sucursalId);
  return queryReporte(
    `SELECT vd.producto_id, vd.descripcion AS producto,
            SUM(vd.cantidad) AS cantidad,
            SUM(vd.total_linea) AS venta_usd,
            SUM(vd.total_linea * v.tasa_cambio) AS venta_bs,
            SUM(vd.utilidad_total) AS utilidad_usd
       FROM venta_detalle vd JOIN ventas v ON v.id = vd.venta_id
      WHERE ${where}
      GROUP BY vd.producto_id, vd.descripcion
      ORDER BY cantidad ${orden} LIMIT ?`,
    [...params, q.limite],
  );
}

router.get('/ventas/mas-vendidos', requierePermiso('reportes.ver'), validar({ query: esquemaRango }), async (req, res, next) => {
  try { enviarOk(res, await masVendidos(datosQuery(req), usuarioActual(req).sucursalId, 'DESC')); } catch (e) { next(e); }
});

router.get('/ventas/menos-vendidos', requierePermiso('reportes.ver'), validar({ query: esquemaRango }), async (req, res, next) => {
  try { enviarOk(res, await masVendidos(datosQuery(req), usuarioActual(req).sucursalId, 'ASC')); } catch (e) { next(e); }
});

/** Productos SIN movimiento de venta en el rango. */
router.get('/ventas/sin-movimiento', requierePermiso('reportes.ver'), validar({ query: esquemaRango }), async (req: Request, res, next) => {
  try {
    const q = datosQuery<Rango>(req); const u = usuarioActual(req);
    const desde = q.desde ?? '2000-01-01'; const hasta = q.hasta ?? '2999-12-31';
    const datos = await queryReporte(
      `SELECT p.id, p.sku, p.nombre, COALESCE(ps.cantidad,0) AS stock
         FROM productos p LEFT JOIN producto_stock ps ON ps.producto_id = p.id AND ps.sucursal_id = ?
        WHERE p.eliminado_en IS NULL AND p.esta_activo = 1
          AND p.id NOT IN (
            SELECT DISTINCT vd.producto_id FROM venta_detalle vd JOIN ventas v ON v.id = vd.venta_id
             WHERE v.sucursal_id = ? AND v.estado='CERRADA' AND v.fecha BETWEEN ? AND ?)
        ORDER BY p.nombre`,
      [u.sucursalId, u.sucursalId, `${desde} 00:00:00`, `${hasta} 23:59:59`],
    );
    enviarOk(res, datos);
  } catch (e) { next(e); }
});

/** Stock bajo el minimo. */
router.get('/ventas/stock-bajo', requierePermiso('reportes.ver'), async (req, res, next) => {
  try {
    const u = usuarioActual(req);
    const datos = await queryReporte(
      `SELECT p.id, p.sku, p.nombre, ps.cantidad, ps.stock_minimo, ps.costo_promedio
         FROM producto_stock ps JOIN productos p ON p.id = ps.producto_id
        WHERE ps.sucursal_id = ? AND p.eliminado_en IS NULL AND ps.cantidad <= ps.stock_minimo
        ORDER BY (ps.stock_minimo - ps.cantidad) DESC`,
      [u.sucursalId],
    );
    enviarOk(res, datos);
  } catch (e) { next(e); }
});

// ---------------------------------------------------------------------------
// PAGOS: estadistica por metodo de pago
// ---------------------------------------------------------------------------
router.get('/ventas/metodos-pago', requierePermiso('reportes.ver'), validar({ query: esquemaRango }), async (req, res, next) => {
  try {
    const q = datosQuery<Rango>(req); const u = usuarioActual(req);
    const cond = ["v.estado = 'CERRADA'", 'v.sucursal_id = ?', "pg.estado = 'APLICADO'"];
    const params: (string | number)[] = [u.sucursalId];
    if (q.desde) { cond.push('v.fecha >= ?'); params.push(`${q.desde} 00:00:00`); }
    if (q.hasta) { cond.push('v.fecha <= ?'); params.push(`${q.hasta} 23:59:59`); }
    const datos = await queryReporte(
      `SELECT mp.nombre AS metodo, mp.moneda, COUNT(*) AS transacciones,
              SUM(pg.monto_moneda) AS total_moneda, SUM(pg.monto_usd) AS total_usd
         FROM pagos pg
         JOIN metodos_pago mp ON mp.id = pg.metodo_pago_id
         JOIN ventas v ON v.id = pg.venta_id
        WHERE ${cond.join(' AND ')}
        GROUP BY mp.id, mp.nombre, mp.moneda
        ORDER BY total_usd DESC`,
      params,
    );
    enviarOk(res, datos);
  } catch (e) { next(e); }
});

// ---------------------------------------------------------------------------
// CLIENTES
// ---------------------------------------------------------------------------
router.get('/clientes/mas-compradores', requierePermiso('reportes.ver'), validar({ query: esquemaRango }), async (req, res, next) => {
  try {
    const q = datosQuery<Rango>(req); const u = usuarioActual(req);
    const { where, params } = rangoVentas(q, u.sucursalId);
    const datos = await queryReporte(
      `SELECT COALESCE(c.nombre,'CONSUMIDOR FINAL') AS cliente, COUNT(*) AS compras,
              SUM(v.total_usd) AS total_usd, SUM(v.total_bs) AS total_bs
         FROM ventas v LEFT JOIN clientes c ON c.id = v.cliente_id
        WHERE ${where} GROUP BY v.cliente_id, cliente ORDER BY compras DESC LIMIT ?`,
      [...params, q.limite],
    );
    enviarOk(res, datos);
  } catch (e) { next(e); }
});

router.get('/clientes/mayor-gasto', requierePermiso('reportes.ver'), validar({ query: esquemaRango }), async (req, res, next) => {
  try {
    const q = datosQuery<Rango>(req); const u = usuarioActual(req);
    const { where, params } = rangoVentas(q, u.sucursalId);
    const datos = await queryReporte(
      `SELECT COALESCE(c.nombre,'CONSUMIDOR FINAL') AS cliente, SUM(v.total_usd) AS total_usd,
              SUM(v.total_bs) AS total_bs, COUNT(*) AS compras
         FROM ventas v LEFT JOIN clientes c ON c.id = v.cliente_id
        WHERE ${where} GROUP BY v.cliente_id, cliente ORDER BY total_usd DESC LIMIT ?`,
      [...params, q.limite],
    );
    enviarOk(res, datos);
  } catch (e) { next(e); }
});

router.get('/clientes/con-deuda', requierePermiso('reportes.ver'), async (_req, res, next) => {
  try {
    const datos = await queryReporte(
      `SELECT nombre, documento, saldo_actual AS saldo_usd, cupo_credito
         FROM clientes WHERE eliminado_en IS NULL AND saldo_actual > 0 ORDER BY saldo_actual DESC`,
    );
    enviarOk(res, datos);
  } catch (e) { next(e); }
});

// ---------------------------------------------------------------------------
// INVENTARIO: entradas / salidas / existencias
// ---------------------------------------------------------------------------
router.get('/inventario/movimientos', requierePermiso('reportes.ver'), validar({ query: esquemaRango.extend({ signo: z.enum(['1', '-1']).optional() }) }), async (req, res, next) => {
  try {
    const q = datosQuery<Rango & { signo?: string }>(req); const u = usuarioActual(req);
    const cond = ['im.sucursal_id = ?']; const params: (string | number)[] = [u.sucursalId];
    if (q.signo) { cond.push('im.signo = ?'); params.push(Number(q.signo)); }
    if (q.desde) { cond.push('im.creado_en >= ?'); params.push(`${q.desde} 00:00:00`); }
    if (q.hasta) { cond.push('im.creado_en <= ?'); params.push(`${q.hasta} 23:59:59`); }
    const datos = await queryReporte(
      `SELECT DATE_FORMAT(im.creado_en,'%Y-%m-%d %H:%i') AS fecha, p.nombre AS producto, im.tipo,
              im.signo, im.cantidad, im.costo_total AS valor_usd
         FROM inventario_movimientos im JOIN productos p ON p.id = im.producto_id
        WHERE ${cond.join(' AND ')} ORDER BY im.id DESC LIMIT 500`,
      params,
    );
    enviarOk(res, datos);
  } catch (e) { next(e); }
});

// ---------------------------------------------------------------------------
// DASHBOARD: un solo endpoint agregado
// ---------------------------------------------------------------------------
router.get('/dashboard/resumen', requierePermiso('dashboard.ver'), async (req, res, next) => {
  try {
    const u = usuarioActual(req);
    const kpis = await queryReporte<{ ventas_usd: string; ventas_bs: string; utilidad_usd: string; tickets: number }>(
      `SELECT COALESCE(SUM(total_usd),0) AS ventas_usd, COALESCE(SUM(total_bs),0) AS ventas_bs,
              COALESCE(SUM(utilidad_total),0) AS utilidad_usd, COUNT(*) AS tickets
         FROM ventas WHERE sucursal_id = ? AND estado='CERRADA' AND DATE(fecha) = CURDATE()`,
      [u.sucursalId],
    );
    const cartera = await queryReporte<{ total: string }>(
      `SELECT COALESCE(SUM(saldo_actual),0) AS total FROM clientes WHERE eliminado_en IS NULL`,
    );
    const serie = await queryReporte(
      `SELECT DATE(fecha) AS dia, SUM(total_usd) AS usd, SUM(utilidad_total) AS utilidad
         FROM ventas WHERE sucursal_id = ? AND estado='CERRADA' AND fecha >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
        GROUP BY DATE(fecha) ORDER BY dia`,
      [u.sucursalId],
    );
    const topProductos = await queryReporte(
      `SELECT vd.descripcion AS producto, SUM(vd.cantidad) AS cantidad, SUM(vd.total_linea) AS usd
         FROM venta_detalle vd JOIN ventas v ON v.id = vd.venta_id
        WHERE v.sucursal_id = ? AND v.estado='CERRADA' AND v.fecha >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
        GROUP BY vd.producto_id, vd.descripcion ORDER BY cantidad DESC LIMIT 10`,
      [u.sucursalId],
    );
    const alertas = await queryReporte<{ stock_bajo: number; creditos_vencidos: number }>(
      `SELECT (SELECT COUNT(*) FROM producto_stock ps WHERE ps.sucursal_id=? AND ps.cantidad <= ps.stock_minimo) AS stock_bajo,
              (SELECT COUNT(*) FROM creditos WHERE estado IN ('PENDIENTE','PARCIAL') AND fecha_vencimiento < CURDATE()) AS creditos_vencidos`,
      [u.sucursalId],
    );
    enviarOk(res, {
      kpis: kpis[0], cartera_usd: cartera[0]?.total ?? '0', serie, topProductos, alertas: alertas[0],
    });
  } catch (e) { next(e); }
});

export default router;
