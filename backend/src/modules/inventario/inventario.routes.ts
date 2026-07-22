/** Inventario: existencias, kardex, reconciliacion y ajustes. /api/v1/inventario */
import { Router, type Request } from 'express';
import { z } from 'zod';
import { validar, datosBody, datosQuery, datosParams, esquemaParamsId } from '../../middlewares/validar';
import { autenticar, usuarioActual } from '../../middlewares/autenticacion';
import { requierePermiso } from '../../middlewares/autorizacion';
import { enviarOk, enviarCreado } from '../../utils/respuesta';
import { NoEncontrado } from '../../errores/AppError';
import { query, queryOne, ejecutar, insertar, withTransaction } from '../../database/pool';
import { esquemaPaginacion, normalizarPaginacion, construirMeta } from '../../utils/paginacion';
import { aCantidad, aUnitario, cantidadASql, unitarioASql, centavosASql, multiplicarPorCantidad } from '../../utils/dinero';
import { TIPO_MOVIMIENTO_INVENTARIO, DOCUMENTO_TIPO_MOVIMIENTO, TIPO_DOCUMENTO } from '../../config/constantes';

const router = Router();
router.use(autenticar);

/** Existencias valorizadas en USD. */
router.get('/existencias', requierePermiso('inventario.ver'), validar({ query: esquemaPaginacion.extend({ busqueda: z.string().optional(), stockBajo: z.coerce.boolean().optional() }) }), async (req, res, next) => {
  try {
    const q = datosQuery<{ pagina?: number; limite?: number; busqueda?: string; stockBajo?: boolean }>(req);
    const p = normalizarPaginacion(q);
    const u = usuarioActual(req);
    const cond = ['p.eliminado_en IS NULL', 'p.es_maneja_inventario = TRUE']; const params: (string | number)[] = [u.sucursalId];
    if (q.busqueda) { cond.push('(p.nombre ILIKE ? OR p.sku ILIKE ?)'); const l = `%${q.busqueda}%`; params.push(l, l); }
    if (q.stockBajo) cond.push('COALESCE(ps.cantidad,0) <= COALESCE(ps.stock_minimo,0)');
    const where = `WHERE ${cond.join(' AND ')}`;
    const datos = await query(
      `SELECT p.id, p.sku, p.nombre, c.nombre AS categoria, COALESCE(ps.cantidad,0) AS cantidad,
              COALESCE(ps.stock_minimo,0) AS stock_minimo, COALESCE(ps.costo_promedio,0) AS costo_promedio,
              ROUND(COALESCE(ps.cantidad,0) * COALESCE(ps.costo_promedio,0), 2) AS valor_usd
         FROM productos p JOIN categorias c ON c.id = p.categoria_id
         LEFT JOIN producto_stock ps ON ps.producto_id = p.id AND ps.sucursal_id = ?
        ${where} ORDER BY p.nombre LIMIT ? OFFSET ?`,
      [...params, p.limite, p.desplazamiento],
    );
    const total = await queryOne<{ n: number }>(
      `SELECT COUNT(*) AS n FROM productos p LEFT JOIN producto_stock ps ON ps.producto_id = p.id AND ps.sucursal_id = ? ${where}`,
      [u.sucursalId, ...params.slice(1)],
    );
    enviarOk(res, datos, construirMeta(p, total?.n ?? 0));
  } catch (e) { next(e); }
});

/** Reconciliacion: compara producto_stock contra la suma del ledger (debe dar 0). */
router.get('/reconciliacion', requierePermiso('inventario.reconciliar', 'inventario.ver'), async (req, res, next) => {
  try {
    const u = usuarioActual(req);
    const datos = await query(
      `SELECT p.id, p.sku, p.nombre, COALESCE(ps.cantidad,0) AS stock_tabla,
              COALESCE((SELECT SUM(im.signo * im.cantidad) FROM inventario_movimientos im
                        WHERE im.producto_id = p.id AND im.sucursal_id = ?),0) AS stock_ledger,
              COALESCE(ps.cantidad,0) - COALESCE((SELECT SUM(im.signo * im.cantidad) FROM inventario_movimientos im
                        WHERE im.producto_id = p.id AND im.sucursal_id = ?),0) AS diferencia
         FROM productos p LEFT JOIN producto_stock ps ON ps.producto_id = p.id AND ps.sucursal_id = ?
        WHERE p.eliminado_en IS NULL AND p.es_maneja_inventario = TRUE
        HAVING diferencia <> 0 ORDER BY ABS(diferencia) DESC`,
      [u.sucursalId, u.sucursalId, u.sucursalId],
    );
    enviarOk(res, { diferencias: datos, cuadrado: datos.length === 0 });
  } catch (e) { next(e); }
});

router.get('/kardex/:id', requierePermiso('inventario.ver'), validar({ params: esquemaParamsId }), async (req, res, next) => {
  try {
    const u = usuarioActual(req);
    const datos = await query(
      `SELECT TO_CHAR(creado_en, 'YYYY-MM-DD HH24:MI') AS fecha, tipo, nota,
              CASE WHEN signo=1 THEN cantidad ELSE 0 END AS entrada, CASE WHEN signo=-1 THEN cantidad ELSE 0 END AS salida,
              saldo_posterior AS saldo, costo_unitario
         FROM inventario_movimientos WHERE producto_id = ? AND sucursal_id = ? ORDER BY id ASC`,
      [datosParams<{ id: number }>(req).id, u.sucursalId],
    );
    enviarOk(res, datos);
  } catch (e) { next(e); }
});

/** Motivos de ajuste activos (para el selector de la pantalla de existencias). */
router.get('/motivos', requierePermiso('inventario.ajustar', 'inventario.ver'), async (_req, res, next) => {
  try {
    enviarOk(res, await query(`SELECT id, codigo, nombre, signo FROM motivos_ajuste WHERE esta_activo = TRUE ORDER BY id`));
  } catch (e) { next(e); }
});

/** Ajuste de inventario: fija la cantidad contada y genera el movimiento. */
const esquemaAjuste = z.object({
  motivoId: z.coerce.number().int().positive(),
  observaciones: z.string().trim().max(255).optional(),
  renglones: z.array(z.object({
    productoId: z.coerce.number().int().positive(),
    cantidadContada: z.union([z.string(), z.number()]).transform(String),
  })).min(1),
});

router.post('/ajustes', requierePermiso('inventario.ajustar'), validar({ body: esquemaAjuste }), async (req: Request, res, next) => {
  try {
    const e = datosBody<z.infer<typeof esquemaAjuste>>(req);
    const u = usuarioActual(req);
    const resultado = await withTransaction(async (cx) => {
      const anio = new Date().getFullYear();
      // Consecutivo de ajuste.
      let cons = await queryOne<{ id: number; ultimo_numero: number; prefijo: string }>(
        `SELECT id, ultimo_numero, prefijo FROM consecutivos WHERE sucursal_id=? AND tipo_documento=? AND anio=? FOR UPDATE`,
        [u.sucursalId, TIPO_DOCUMENTO.AJUSTE, anio], cx,
      );
      let numero: number; let prefijo: string;
      if (!cons) { await insertar(`INSERT INTO consecutivos (sucursal_id, tipo_documento, anio, prefijo, ultimo_numero) VALUES (?,?,?,'AJ-',1)`, [u.sucursalId, TIPO_DOCUMENTO.AJUSTE, anio], cx); numero = 1; prefijo = 'AJ-'; }
      else { numero = cons.ultimo_numero + 1; prefijo = cons.prefijo; await ejecutar(`UPDATE consecutivos SET ultimo_numero=? WHERE id=?`, [numero, cons.id], cx); }

      const ajusteId = await insertar(
        `INSERT INTO ajustes_inventario (sucursal_id, usuario_id, motivo_ajuste_id, prefijo, numero, anio, tipo, estado, observaciones)
         VALUES (?, ?, ?, ?, ?, ?, 'CONTEO_FISICO', 'APLICADO', ?)`,
        [u.sucursalId, u.id, e.motivoId, prefijo, numero, anio, e.observaciones ?? null], cx,
      );

      let linea = 0;
      for (const r of e.renglones) {
        linea += 1;
        const prod = await queryOne<{ nombre: string }>(`SELECT nombre FROM productos WHERE id=? AND eliminado_en IS NULL`, [r.productoId], cx);
        if (!prod) throw new NoEncontrado('PRODUCTO_NO_ENCONTRADO');
        const stock = await queryOne<{ cantidad: string; costo_promedio: string }>(
          `SELECT cantidad, costo_promedio FROM producto_stock WHERE producto_id=? AND sucursal_id=? FOR UPDATE`,
          [r.productoId, u.sucursalId], cx,
        );
        const sistema = aCantidad(stock?.cantidad ?? '0');
        const contada = aCantidad(r.cantidadContada);
        const diferencia = contada - sistema;
        if (diferencia === 0n) continue;
        const cpp = aUnitario(stock?.costo_promedio ?? '0');
        const positivo = diferencia > 0n;
        const absDif = positivo ? diferencia : -diferencia;

        await insertar(
          `INSERT INTO ajuste_detalle (ajuste_id, linea, producto_id, descripcion, cantidad_sistema, cantidad_fisica, cantidad_diferencia, costo_unitario, costo_total_diferencia)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [ajusteId, linea, r.productoId, prod.nombre, cantidadASql(sistema), cantidadASql(contada), cantidadASql(diferencia), unitarioASql(cpp), centavosASql(multiplicarPorCantidad(cpp, absDif))], cx,
        );
        await ejecutar(`UPDATE producto_stock SET cantidad=? WHERE producto_id=? AND sucursal_id=?`, [cantidadASql(contada), r.productoId, u.sucursalId], cx);
        await insertar(
          `INSERT INTO inventario_movimientos
            (sucursal_id, producto_id, tipo, signo, cantidad, costo_unitario, costo_total,
             saldo_anterior, saldo_posterior, costo_promedio_anterior, costo_promedio_posterior,
             documento_tipo, ajuste_id, motivo_id, usuario_id, nota)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            u.sucursalId, r.productoId,
            positivo ? TIPO_MOVIMIENTO_INVENTARIO.AJUSTE_POSITIVO : TIPO_MOVIMIENTO_INVENTARIO.AJUSTE_NEGATIVO,
            positivo ? 1 : -1, cantidadASql(absDif), unitarioASql(cpp), centavosASql(multiplicarPorCantidad(cpp, absDif)),
            cantidadASql(sistema), cantidadASql(contada), unitarioASql(cpp), unitarioASql(cpp),
            DOCUMENTO_TIPO_MOVIMIENTO.AJUSTE, ajusteId, e.motivoId, u.id, 'Ajuste por conteo',
          ], cx,
        );
      }
      return { id: ajusteId, numero: `${prefijo}${numero}` };
    });
    enviarCreado(res, resultado);
  } catch (e) { next(e); }
});

export default router;
