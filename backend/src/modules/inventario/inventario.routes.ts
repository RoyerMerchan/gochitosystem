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
import { costoPromedioTrasEntrada } from '../../utils/costeo';
import { existeColumna } from '../../database/esquema';
import { siguienteConsecutivo } from '../../utils/consecutivos';
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
    // La columna es de la migracion 0009; sin ella la pantalla sigue funcionando.
    const hayConfirmado = await existeColumna('producto_stock', 'costo_confirmado');
    const datos = await query(
      `SELECT p.id, p.sku, p.nombre, c.nombre AS categoria, COALESCE(ps.cantidad,0) AS cantidad,
              COALESCE(ps.stock_minimo,0) AS stock_minimo, COALESCE(ps.costo_promedio,0) AS costo_promedio,
              ${hayConfirmado ? 'COALESCE(ps.costo_confirmado, FALSE)' : 'TRUE'} AS costo_confirmado, p.ultimo_costo,
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
    /**
     * Costo de lo que ENTRA, opcional. Solo se mira cuando el ajuste suma
     * unidades: sin el, esas unidades se valorizan al costo promedio que ya
     * tenia el producto, que es lo correcto en un conteo fisico (aparecio
     * mercancia que ya era tuya) pero no cuando se esta cargando existencia
     * nueva que costo plata.
     */
    costoUnitario: z.union([z.string(), z.number()]).transform(String)
      .refine((v) => /^\d+(\.\d+)?$/.test(v), 'Costo invalido').optional(),
  })).min(1),
});

router.post('/ajustes', requierePermiso('inventario.ajustar'), validar({ body: esquemaAjuste }), async (req: Request, res, next) => {
  try {
    const e = datosBody<z.infer<typeof esquemaAjuste>>(req);
    const u = usuarioActual(req);
    const resultado = await withTransaction(async (cx) => {
      const anio = new Date().getFullYear();
      // Consecutivo compartido con ventas/compras/abonos: se autorepara si el
      // contador quedo por debajo del numero mas alto ya usado por un ajuste.
      const { numero, prefijo } = await siguienteConsecutivo(cx, u.sucursalId, TIPO_DOCUMENTO.AJUSTE, anio);

      const ajusteId = await insertar(
        `INSERT INTO ajustes_inventario (sucursal_id, usuario_id, motivo_ajuste_id, prefijo, numero, anio, tipo, estado, observaciones)
         VALUES (?, ?, ?, ?, ?, ?, 'CONTEO_FISICO', 'APLICADO', ?)`,
        [u.sucursalId, u.id, e.motivoId, prefijo, numero, anio, e.observaciones ?? null], cx,
      );

      // Migracion 0009: sin la columna se ajusta como siempre (sin fijar costo).
      const hayConfirmado = await existeColumna('producto_stock', 'costo_confirmado', cx);

      let linea = 0;
      for (const r of e.renglones) {
        linea += 1;
        const prod = await queryOne<{ nombre: string }>(`SELECT nombre FROM productos WHERE id=? AND eliminado_en IS NULL`, [r.productoId], cx);
        if (!prod) throw new NoEncontrado('PRODUCTO_NO_ENCONTRADO');
        const stock = await queryOne<{ cantidad: string; costo_promedio: string; costo_confirmado?: boolean }>(
          `SELECT cantidad, costo_promedio${hayConfirmado ? ', costo_confirmado' : ''} FROM producto_stock WHERE producto_id=? AND sucursal_id=? FOR UPDATE`,
          [r.productoId, u.sucursalId], cx,
        );
        const sistema = aCantidad(stock?.cantidad ?? '0');
        const contada = aCantidad(r.cantidadContada);
        const diferencia = contada - sistema;
        if (diferencia === 0n) continue;
        const cpp = aUnitario(stock?.costo_promedio ?? '0');
        const positivo = diferencia > 0n;
        const absDif = positivo ? diferencia : -diferencia;

        /**
         * Entrada con costo: el ajuste deja de ser solo un movimiento de
         * cantidades y recalcula el CPP como lo haria una entrada de mercancia.
         * Sin costo (o en un ajuste que resta) se sigue valorizando al CPP
         * vigente, que es el comportamiento de siempre.
         */
        const costoEntrada = positivo && r.costoUnitario !== undefined ? aUnitario(r.costoUnitario) : null;
        const cppPosterior = costoEntrada === null ? cpp : costoPromedioTrasEntrada({
          saldoAnterior: sistema, cppAnterior: cpp, cantidad: absDif,
          costoUnitario: costoEntrada, esSemilla: hayConfirmado && !stock?.costo_confirmado,
        });
        // Con que se valoriza el movimiento: lo que costo lo que entra, o el CPP.
        const costoMovimiento = costoEntrada ?? cpp;

        await insertar(
          `INSERT INTO ajuste_detalle (ajuste_id, linea, producto_id, descripcion, cantidad_sistema, cantidad_fisica, cantidad_diferencia, costo_unitario, costo_total_diferencia)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [ajusteId, linea, r.productoId, prod.nombre, cantidadASql(sistema), cantidadASql(contada), cantidadASql(diferencia), unitarioASql(costoMovimiento), centavosASql(multiplicarPorCantidad(costoMovimiento, absDif))], cx,
        );
        /**
         * Puede no haber fila de stock para esta sucursal (el producto se dio de
         * alta en otra): el UPDATE de abajo no ajustaba nada y el movimiento
         * quedaba en el ledger sin existencia detras, descuadrando la
         * reconciliacion. Se crea vacia y el UPDATE la deja en su sitio.
         */
        if (!stock) {
          await ejecutar(
            `INSERT INTO producto_stock (producto_id, sucursal_id, cantidad, costo_promedio)
             VALUES (?, ?, 0, 0) ON CONFLICT (producto_id, sucursal_id) DO NOTHING`,
            [r.productoId, u.sucursalId], cx,
          );
        }
        if (costoEntrada === null) {
          await ejecutar(`UPDATE producto_stock SET cantidad=? WHERE producto_id=? AND sucursal_id=?`, [cantidadASql(contada), r.productoId, u.sucursalId], cx);
        } else {
          await ejecutar(
            `UPDATE producto_stock SET cantidad=?, costo_promedio=?${hayConfirmado ? ', costo_confirmado=TRUE' : ''}, ultima_entrada_en=NOW()
              WHERE producto_id=? AND sucursal_id=?`,
            [cantidadASql(contada), unitarioASql(cppPosterior), r.productoId, u.sucursalId], cx,
          );
          await ejecutar(
            `UPDATE productos SET costo_promedio=?, ultimo_costo=? WHERE id=?`,
            [unitarioASql(cppPosterior), unitarioASql(costoEntrada), r.productoId], cx,
          );
        }
        await insertar(
          `INSERT INTO inventario_movimientos
            (sucursal_id, producto_id, tipo, signo, cantidad, costo_unitario, costo_total,
             saldo_anterior, saldo_posterior, costo_promedio_anterior, costo_promedio_posterior,
             documento_tipo, ajuste_id, motivo_id, usuario_id, nota)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            u.sucursalId, r.productoId,
            positivo ? TIPO_MOVIMIENTO_INVENTARIO.AJUSTE_POSITIVO : TIPO_MOVIMIENTO_INVENTARIO.AJUSTE_NEGATIVO,
            positivo ? 1 : -1, cantidadASql(absDif), unitarioASql(costoMovimiento), centavosASql(multiplicarPorCantidad(costoMovimiento, absDif)),
            cantidadASql(sistema), cantidadASql(contada), unitarioASql(cpp), unitarioASql(cppPosterior),
            DOCUMENTO_TIPO_MOVIMIENTO.AJUSTE, ajusteId, e.motivoId, u.id,
            costoEntrada === null ? 'Ajuste por conteo' : 'Ajuste con costo (fija el costo del producto)',
          ], cx,
        );
      }
      return { id: ajusteId, numero: `${prefijo}${numero}` };
    });
    enviarCreado(res, resultado);
  } catch (e) { next(e); }
});

export default router;
