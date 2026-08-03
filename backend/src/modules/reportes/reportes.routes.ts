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

/**
 * Los reportes de detalle listan una fila por documento, no un top-N: con el
 * limite de 20 del esquema normal se cortaria el dia a la mitad sin avisar.
 */
const esquemaRangoDetalle = esquemaRango.extend({
  limite: z.coerce.number().int().min(1).max(5000).optional().default(1000),
});

/** WHERE de rango de fechas sobre ventas cerradas. */
function rangoVentas(q: Rango, sucursalId: number): { where: string; params: (string | number)[] } {
  const cond = ["v.estado = 'CERRADA'", 'v.sucursal_id = ?'];
  const params: (string | number)[] = [sucursalId];
  if (q.desde) { cond.push('v.fecha >= ?'); params.push(`${q.desde} 00:00:00`); }
  if (q.hasta) { cond.push('v.fecha <= ?'); params.push(`${q.hasta} 23:59:59`); }
  return { where: cond.join(' AND '), params };
}

/** Mismo rango, sobre abonos aplicados (lo cobrado de la cartera). */
function rangoAbonos(q: Rango, sucursalId: number): { where: string; params: (string | number)[] } {
  const cond = ["a.estado = 'APLICADO'", 'a.sucursal_id = ?'];
  const params: (string | number)[] = [sucursalId];
  if (q.desde) { cond.push('a.fecha >= ?'); params.push(`${q.desde} 00:00:00`); }
  if (q.hasta) { cond.push('a.fecha <= ?'); params.push(`${q.hasta} 23:59:59`); }
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

/**
 * Cierre diario en base COBRADA: por cada dia, lo que entro de contado en las
 * ventas de ese dia mas los abonos recibidos ese dia. El credito otorgado va en
 * su columna, informativo, sin sumar a lo cobrado.
 *
 * FULL JOIN porque un dia puede tener solo abonos (nadie compro, pero pagaron
 * fiado) o solo ventas; con un JOIN normal ese dia se perderia del reporte.
 */
router.get('/ventas/por-dia', requierePermiso('reportes.ver'), validar({ query: esquemaRangoDetalle }), async (req, res, next) => {
  try {
    const q = datosQuery<Rango>(req);
    const suc = usuarioActual(req).sucursalId;
    const { where, params } = rangoVentas(q, suc);
    const { where: whereAb, params: paramsAb } = rangoAbonos(q, suc);
    enviarOk(res, await queryReporte(
      // TO_CHAR y no DATE(): un date de pg viaja como Date de JS y al pasar por
      // JSON se vuelve UTC, corriendo el dia si el navegador esta en otra zona.
      `WITH dias_venta AS (
         SELECT TO_CHAR(DATE(v.fecha), 'YYYY-MM-DD') AS dia, COUNT(*) AS ventas,
                SUM(v.total_usd) AS facturado_usd,
                SUM(v.total_usd - v.total_credito) AS contado_usd,
                SUM(ROUND((v.total_usd - v.total_credito) * v.tasa_cambio, 2)) AS contado_bs,
                SUM(v.total_credito) AS credito_usd,
                SUM(v.utilidad_total) AS utilidad_usd
           FROM ventas v WHERE ${where} GROUP BY 1
       ), dias_abono AS (
         SELECT TO_CHAR(DATE(a.fecha), 'YYYY-MM-DD') AS dia,
                SUM(a.monto_usd - a.saldo_a_favor_usd) AS abonos_usd,
                SUM(ROUND((a.monto_usd - a.saldo_a_favor_usd) * a.tasa_aplicada, 2)) AS abonos_bs
           FROM abonos a WHERE ${whereAb} GROUP BY 1
       )
       SELECT COALESCE(dv.dia, da.dia) AS dia,
              COALESCE(dv.ventas, 0) AS ventas,
              COALESCE(dv.contado_usd, 0) AS contado_usd,
              COALESCE(da.abonos_usd, 0) AS abonos_usd,
              COALESCE(dv.contado_usd, 0) + COALESCE(da.abonos_usd, 0) AS cobrado_usd,
              COALESCE(dv.contado_bs, 0) + COALESCE(da.abonos_bs, 0) AS cobrado_bs,
              COALESCE(dv.credito_usd, 0) AS credito_usd,
              COALESCE(dv.facturado_usd, 0) AS facturado_usd,
              COALESCE(dv.utilidad_usd, 0) AS utilidad_usd
         FROM dias_venta dv FULL JOIN dias_abono da ON da.dia = dv.dia
        ORDER BY 1 DESC LIMIT ?`,
      [...params, ...paramsAb, q.limite],
    ));
  } catch (e) { next(e); }
});

/** Abonos cobrados en el rango: el detalle de lo que se recuperó de la cartera. */
router.get('/ventas/abonos', requierePermiso('reportes.ver'), validar({ query: esquemaRangoDetalle }), async (req, res, next) => {
  try {
    const q = datosQuery<Rango>(req);
    const { where, params } = rangoAbonos(q, usuarioActual(req).sucursalId);
    enviarOk(res, await queryReporte(
      `SELECT a.fecha, a.prefijo || a.numero AS numero, c.nombre AS cliente,
              mp.nombre AS metodo, a.moneda, a.monto_moneda,
              (a.monto_usd - a.saldo_a_favor_usd) AS abonado_usd,
              ROUND((a.monto_usd - a.saldo_a_favor_usd) * a.tasa_aplicada, 2) AS abonado_bs,
              u.nombre_completo AS cajero
         FROM abonos a
         JOIN clientes c ON c.id = a.cliente_id
         JOIN metodos_pago mp ON mp.id = a.metodo_pago_id
         JOIN usuarios u ON u.id = a.usuario_id
        WHERE ${where} ORDER BY a.fecha DESC LIMIT ?`,
      [...params, q.limite],
    ));
  } catch (e) { next(e); }
});

/** Detalle venta por venta del rango: lo que se saca para cuadrar el dia. */
router.get('/ventas/detalle', requierePermiso('reportes.ver'), validar({ query: esquemaRangoDetalle }), async (req, res, next) => {
  try {
    const q = datosQuery<Rango>(req);
    const { where, params } = rangoVentas(q, usuarioActual(req).sucursalId);
    enviarOk(res, await queryReporte(
      `SELECT v.fecha, v.prefijo || v.numero AS numero,
              COALESCE(c.nombre, 'CONSUMIDOR FINAL') AS cliente,
              u.nombre_completo AS cajero,
              COALESCE((SELECT STRING_AGG(DISTINCT mp.nombre, ', ')
                          FROM pagos pg JOIN metodos_pago mp ON mp.id = pg.metodo_pago_id
                         WHERE pg.venta_id = v.id), '') ||
                CASE WHEN v.es_credito THEN
                  CASE WHEN EXISTS (SELECT 1 FROM pagos pg2 WHERE pg2.venta_id = v.id)
                       THEN ' + Credito' ELSE 'Credito' END
                ELSE '' END AS metodo,
              CASE WHEN v.es_credito THEN 'CREDITO' ELSE 'CONTADO' END AS tipo,
              v.total_usd,
              -- Contado y credito de la MISMA venta: una venta a credito puede
              -- llevar abono inicial, asi que las dos columnas conviven.
              (v.total_usd - v.total_credito) AS contado_usd,
              v.total_credito AS credito_usd,
              COALESCE((SELECT SUM(cr.saldo_usd) FROM creditos cr
                         WHERE cr.venta_id = v.id AND cr.estado <> 'ANULADO'), 0) AS saldo_usd,
              v.total_bs, v.utilidad_total AS utilidad_usd
         FROM ventas v
         LEFT JOIN clientes c ON c.id = v.cliente_id
         JOIN usuarios u ON u.id = v.usuario_id
        WHERE ${where}
        ORDER BY v.fecha DESC LIMIT ?`,
      [...params, q.limite],
    ));
  } catch (e) { next(e); }
});

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
        WHERE p.eliminado_en IS NULL AND p.esta_activo = TRUE
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
    // Una fila por persona con su deuda total: la suma de sus creditos vivos
    // (misma fuente que la cartera), no el espejo de clientes.saldo_actual.
    const datos = await queryReporte(
      `SELECT c.nombre, c.documento, SUM(cr.saldo_usd) AS saldo_usd,
              COUNT(*) AS documentos, c.cupo_credito
         FROM clientes c
         JOIN creditos cr ON cr.cliente_id = c.id
          AND cr.estado IN ('PENDIENTE','PARCIAL','VENCIDO') AND cr.saldo_usd > 0
        WHERE c.eliminado_en IS NULL
        GROUP BY c.id, c.nombre, c.documento, c.cupo_credito
        ORDER BY SUM(cr.saldo_usd) DESC`,
    );
    enviarOk(res, datos);
  } catch (e) { next(e); }
});

// ---------------------------------------------------------------------------
// COMPRAS: entrada de mercancia (que se compro, a quien y cuanto costo)
// ---------------------------------------------------------------------------

/**
 * Rango sobre compras RECIBIDAS. Se filtra por `fecha_recepcion` (cuando entro
 * la mercancia de verdad), no por la fecha de la factura del proveedor, que
 * puede venir de otro dia. Las ANULADAS quedan fuera: esa mercancia se revirtio.
 */
function rangoCompras(q: Rango, sucursalId: number): { where: string; params: (string | number)[] } {
  const cond = ["c.estado <> 'ANULADA'", 'c.sucursal_id = ?'];
  const params: (string | number)[] = [sucursalId];
  if (q.desde) { cond.push('c.fecha_recepcion >= ?'); params.push(`${q.desde} 00:00:00`); }
  if (q.hasta) { cond.push('c.fecha_recepcion <= ?'); params.push(`${q.hasta} 23:59:59`); }
  return { where: cond.join(' AND '), params };
}

/** Una fila por entrada de mercancia: cuando, a quien y cuanto. */
router.get('/compras/detalle', requierePermiso('reportes.ver'), validar({ query: esquemaRangoDetalle }), async (req, res, next) => {
  try {
    const q = datosQuery<Rango>(req);
    const { where, params } = rangoCompras(q, usuarioActual(req).sucursalId);
    enviarOk(res, await queryReporte(
      `SELECT TO_CHAR(c.fecha_recepcion, 'YYYY-MM-DD HH24:MI') AS fecha,
              c.prefijo || c.numero AS numero, p.razon_social AS proveedor,
              COALESCE(c.numero_factura_proveedor, '') AS factura,
              CASE WHEN c.condicion_pago = 'CREDITO' THEN 'A credito' ELSE 'De contado' END AS condicion,
              c.total_usd, c.total_bs,
              c.saldo_pendiente AS por_pagar_usd, u.nombre_completo AS registro
         FROM compras c
         JOIN proveedores p ON p.id = c.proveedor_id
         JOIN usuarios u ON u.id = c.usuario_id
        WHERE ${where} ORDER BY c.fecha_recepcion DESC LIMIT ?`,
      [...params, q.limite],
    ));
  } catch (e) { next(e); }
});

/** Cuanto se le compro a cada proveedor en el periodo. */
router.get('/compras/por-proveedor', requierePermiso('reportes.ver'), validar({ query: esquemaRango }), async (req, res, next) => {
  try {
    const q = datosQuery<Rango>(req);
    const { where, params } = rangoCompras(q, usuarioActual(req).sucursalId);
    enviarOk(res, await queryReporte(
      `SELECT p.razon_social AS proveedor, COUNT(*) AS entradas,
              SUM(c.total_usd) AS total_usd, SUM(c.total_bs) AS total_bs,
              SUM(c.saldo_pendiente) AS por_pagar_usd,
              TO_CHAR(MAX(c.fecha_recepcion), 'YYYY-MM-DD') AS ultima_compra
         FROM compras c JOIN proveedores p ON p.id = c.proveedor_id
        WHERE ${where}
        GROUP BY p.id, p.razon_social ORDER BY SUM(c.total_usd) DESC LIMIT ?`,
      [...params, q.limite],
    ));
  } catch (e) { next(e); }
});

/** Compra por dia: cuanta plata se fue en mercancia cada dia. */
router.get('/compras/por-dia', requierePermiso('reportes.ver'), validar({ query: esquemaRangoDetalle }), async (req, res, next) => {
  try {
    const q = datosQuery<Rango>(req);
    const { where, params } = rangoCompras(q, usuarioActual(req).sucursalId);
    enviarOk(res, await queryReporte(
      `SELECT TO_CHAR(DATE(c.fecha_recepcion), 'YYYY-MM-DD') AS dia,
              COUNT(*) AS entradas, SUM(c.total_usd) AS total_usd, SUM(c.total_bs) AS total_bs
         FROM compras c WHERE ${where}
        GROUP BY 1 ORDER BY 1 DESC LIMIT ?`,
      [...params, q.limite],
    ));
  } catch (e) { next(e); }
});

/** Que productos se compraron y a que costo, con su proveedor. */
router.get('/compras/productos', requierePermiso('reportes.ver'), validar({ query: esquemaRango }), async (req, res, next) => {
  try {
    const q = datosQuery<Rango>(req);
    const { where, params } = rangoCompras(q, usuarioActual(req).sucursalId);
    enviarOk(res, await queryReporte(
      `SELECT cd.descripcion AS producto, p.razon_social AS proveedor,
              SUM(cd.cantidad) AS cantidad, SUM(cd.total_linea) AS costo_usd,
              SUM(cd.total_linea * c.tasa_cambio) AS costo_bs
         FROM compra_detalle cd
         JOIN compras c ON c.id = cd.compra_id
         JOIN proveedores p ON p.id = c.proveedor_id
        WHERE ${where}
        GROUP BY cd.producto_id, cd.descripcion, p.id, p.razon_social
        ORDER BY SUM(cd.total_linea) DESC LIMIT ?`,
      [...params, q.limite],
    ));
  } catch (e) { next(e); }
});

/** Cuentas por pagar: lo que se le debe a cada proveedor por compras a credito. */
router.get('/compras/por-pagar', requierePermiso('reportes.ver'), async (req, res, next) => {
  try {
    enviarOk(res, await queryReporte(
      `SELECT p.razon_social AS proveedor, COUNT(*) AS documentos,
              SUM(c.saldo_pendiente) AS saldo_usd,
              TO_CHAR(MIN(c.fecha_recepcion), 'YYYY-MM-DD') AS mas_antigua
         FROM compras c JOIN proveedores p ON p.id = c.proveedor_id
        WHERE c.sucursal_id = ? AND c.estado <> 'ANULADA' AND c.saldo_pendiente > 0
        GROUP BY p.id, p.razon_social ORDER BY SUM(c.saldo_pendiente) DESC`,
      [usuarioActual(req).sucursalId],
    ));
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
      `SELECT TO_CHAR(im.creado_en, 'YYYY-MM-DD HH24:MI') AS fecha, p.nombre AS producto, im.tipo,
              im.signo, im.cantidad, im.costo_total AS valor_usd
         FROM inventario_movimientos im JOIN productos p ON p.id = im.producto_id
        WHERE ${cond.join(' AND ')} ORDER BY im.id DESC LIMIT 500`,
      params,
    );
    enviarOk(res, datos);
  } catch (e) { next(e); }
});

// ---------------------------------------------------------------------------
// DASHBOARD: totales de venta por periodo
// ---------------------------------------------------------------------------
const esquemaPeriodo = z.object({
  periodo: z.enum(['dia', 'semana', 'mes', 'total']).optional().default('dia'),
});
type Periodo = z.infer<typeof esquemaPeriodo>['periodo'];

/**
 * Corte de fecha de cada periodo. CURRENT_DATE sale en la zona local porque el
 * pool abre la sesion con `-c timezone=...`; si no, una venta de las 11 PM
 * caeria en el dia siguiente y el total de "hoy" saldria mal.
 */
const CORTE_PERIODO: Record<Periodo, (col: string) => string> = {
  dia: (c) => `AND DATE(${c}) = CURRENT_DATE`,
  semana: (c) => `AND ${c} >= CURRENT_DATE - INTERVAL '6 days'`,
  mes: (c) => `AND ${c} >= CURRENT_DATE - INTERVAL '29 days'`,
  total: () => '',
};

/**
 * Totales del periodo en base COBRADA, no facturada.
 *
 * Lo que sale fiado no es venta del dia: entra el dia que el cliente paga. Por eso
 *   cobrado = contado de las ventas del periodo + abonos recibidos en el periodo
 * y el credito otorgado va aparte, como informacion, sin sumarse.
 *
 * Excluye ANULADAS (una venta revertida no es dinero que entro). Los Bs salen de
 * la tasa congelada de cada documento, nunca de la tasa de hoy.
 */
router.get('/dashboard/ventas', requierePermiso('dashboard.ver'), validar({ query: esquemaPeriodo }), async (req, res, next) => {
  try {
    const { periodo } = datosQuery<{ periodo: Periodo }>(req);
    const u = usuarioActual(req);
    const ventas = await queryReporte<Record<string, string>>(
      `SELECT COUNT(*) AS tickets,
              COUNT(*) FILTER (WHERE v.es_credito) AS tickets_credito,
              COALESCE(SUM(v.total_usd), 0) AS facturado_usd,
              COALESCE(SUM(v.total_usd - v.total_credito), 0) AS contado_usd,
              COALESCE(SUM(ROUND((v.total_usd - v.total_credito) * v.tasa_cambio, 2)), 0) AS contado_bs,
              COALESCE(SUM(v.total_credito), 0) AS credito_usd,
              COALESCE(SUM(v.utilidad_total), 0) AS utilidad_usd
         FROM ventas v
        WHERE v.sucursal_id = ? AND v.estado = 'CERRADA' ${CORTE_PERIODO[periodo]('v.fecha')}`,
      [u.sucursalId],
    );
    // Lo aplicado a deuda = lo recibido menos lo que quedo como saldo a favor.
    const abonos = await queryReporte<Record<string, string>>(
      `SELECT COUNT(*) AS n,
              COALESCE(SUM(a.monto_usd - a.saldo_a_favor_usd), 0) AS abonos_usd,
              COALESCE(SUM(ROUND((a.monto_usd - a.saldo_a_favor_usd) * a.tasa_aplicada, 2)), 0) AS abonos_bs
         FROM abonos a
        WHERE a.sucursal_id = ? AND a.estado = 'APLICADO' ${CORTE_PERIODO[periodo]('a.fecha')}`,
      [u.sucursalId],
    );
    const v = ventas[0]!;
    const a = abonos[0]!;
    enviarOk(res, {
      periodo,
      ...v,
      ...a,
      cobrado_usd: (Number(v.contado_usd) + Number(a.abonos_usd)).toFixed(2),
      cobrado_bs: (Number(v.contado_bs) + Number(a.abonos_bs)).toFixed(2),
    });
  } catch (e) { next(e); }
});

/**
 * Lo que se gasto en mercancia en el periodo, con el mismo corte que las ventas
 * para poder ponerlos lado a lado. Va aparte y no dentro de /dashboard/ventas
 * para no mezclar la plata que entra con la que sale.
 *
 * Los Bs salen de `total_bs`, que la entrada congelo con su propia tasa.
 */
router.get('/dashboard/compras', requierePermiso('dashboard.ver'), validar({ query: esquemaPeriodo }), async (req, res, next) => {
  try {
    const { periodo } = datosQuery<{ periodo: Periodo }>(req);
    const u = usuarioActual(req);
    const filas = await queryReporte<Record<string, string>>(
      `SELECT COUNT(*) AS entradas,
              COALESCE(SUM(c.total_usd), 0) AS compras_usd,
              COALESCE(SUM(c.total_bs), 0) AS compras_bs,
              COUNT(DISTINCT c.proveedor_id) AS proveedores,
              COALESCE(SUM(c.saldo_pendiente), 0) AS por_pagar_usd
         FROM compras c
        WHERE c.sucursal_id = ? AND c.estado <> 'ANULADA' ${CORTE_PERIODO[periodo]('c.fecha_recepcion')}`,
      [u.sucursalId],
    );
    // Al proveedor que mas se le compro en el periodo: sirve para saber de quien
    // depende el surtido sin abrir el reporte completo.
    const top = await queryReporte<Record<string, string>>(
      `SELECT p.razon_social AS proveedor, SUM(c.total_usd) AS total_usd
         FROM compras c JOIN proveedores p ON p.id = c.proveedor_id
        WHERE c.sucursal_id = ? AND c.estado <> 'ANULADA' ${CORTE_PERIODO[periodo]('c.fecha_recepcion')}
        GROUP BY p.id, p.razon_social ORDER BY SUM(c.total_usd) DESC LIMIT 1`,
      [u.sucursalId],
    );
    enviarOk(res, { periodo, ...filas[0], top_proveedor: top[0]?.proveedor ?? null, top_proveedor_usd: top[0]?.total_usd ?? '0' });
  } catch (e) { next(e); }
});

/**
 * Cartera viva: cuanto te deben AHORA. Es un saldo, no un flujo, asi que no
 * depende del periodo del dashboard: baja sola con cada abono.
 *
 * La fuente es `creditos.saldo_usd` (el libro documento por documento), no
 * `clientes.saldo_actual`, que es un acumulado desnormalizado y se actualiza con
 * GREATEST(0, ...): si alguna vez se desincroniza, se queda corto en silencio.
 * Se traen los dos para poder avisar cuando no coinciden.
 */
router.get('/dashboard/cartera', requierePermiso('dashboard.ver'), async (req, res, next) => {
  try {
    const u = usuarioActual(req);
    const cartera = await queryReporte<Record<string, string>>(
      `SELECT COALESCE(SUM(cr.saldo_usd), 0) AS deuda_usd,
              COUNT(DISTINCT cr.cliente_id) AS clientes,
              COUNT(*) AS documentos,
              COALESCE(SUM(cr.saldo_usd) FILTER (WHERE cr.fecha_vencimiento < CURRENT_DATE), 0) AS vencido_usd,
              COUNT(*) FILTER (WHERE cr.fecha_vencimiento < CURRENT_DATE) AS documentos_vencidos
         FROM creditos cr
        WHERE cr.sucursal_id = ? AND cr.estado <> 'ANULADO' AND cr.saldo_usd > 0`,
      [u.sucursalId],
    );
    const hoy = await queryReporte<Record<string, string>>(
      `SELECT COALESCE(SUM(a.monto_usd - a.saldo_a_favor_usd), 0) AS abonado_hoy_usd,
              COUNT(*) AS abonos_hoy
         FROM abonos a
        WHERE a.sucursal_id = ? AND a.estado = 'APLICADO' AND DATE(a.fecha) = CURRENT_DATE`,
      [u.sucursalId],
    );
    const espejo = await queryReporte<{ saldo_clientes: string }>(
      `SELECT COALESCE(SUM(saldo_actual), 0) AS saldo_clientes
         FROM clientes WHERE eliminado_en IS NULL`,
    );
    enviarOk(res, {
      ...cartera[0], ...hoy[0],
      saldo_clientes_usd: espejo[0]?.saldo_clientes ?? '0',
    });
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
         FROM ventas WHERE sucursal_id = ? AND estado='CERRADA' AND DATE(fecha) = CURRENT_DATE`,
      [u.sucursalId],
    );
    // Misma fuente que /dashboard/cartera: los creditos, no el espejo del cliente.
    const cartera = await queryReporte<{ total: string }>(
      `SELECT COALESCE(SUM(saldo_usd),0) AS total FROM creditos
        WHERE estado IN ('PENDIENTE','PARCIAL','VENCIDO') AND saldo_usd > 0`,
    );
    const serie = await queryReporte(
      `SELECT DATE(fecha) AS dia, SUM(total_usd) AS usd, SUM(utilidad_total) AS utilidad
         FROM ventas WHERE sucursal_id = ? AND estado='CERRADA' AND fecha >= CURRENT_DATE - INTERVAL '30 days'
        GROUP BY DATE(fecha) ORDER BY dia`,
      [u.sucursalId],
    );
    const topProductos = await queryReporte(
      `SELECT vd.descripcion AS producto, SUM(vd.cantidad) AS cantidad, SUM(vd.total_linea) AS usd
         FROM venta_detalle vd JOIN ventas v ON v.id = vd.venta_id
        WHERE v.sucursal_id = ? AND v.estado='CERRADA' AND v.fecha >= CURRENT_DATE - INTERVAL '30 days'
        GROUP BY vd.producto_id, vd.descripcion ORDER BY cantidad DESC LIMIT 10`,
      [u.sucursalId],
    );
    const alertas = await queryReporte<{ stock_bajo: number; creditos_vencidos: number }>(
      `SELECT (SELECT COUNT(*) FROM producto_stock ps WHERE ps.sucursal_id=? AND ps.cantidad <= ps.stock_minimo) AS stock_bajo,
              (SELECT COUNT(*) FROM creditos WHERE estado IN ('PENDIENTE','PARCIAL') AND fecha_vencimiento < CURRENT_DATE) AS creditos_vencidos`,
      [u.sucursalId],
    );
    enviarOk(res, {
      kpis: kpis[0], cartera_usd: cartera[0]?.total ?? '0', serie, topProductos, alertas: alertas[0],
    });
  } catch (e) { next(e); }
});

export default router;
