/**
 * Catalogos base: categorias, metodos de pago, impuestos, unidades de medida.
 * Cada uno se exporta como router y se monta bajo su prefijo en routes/index.
 */
import { Router } from 'express';
import { z } from 'zod';
import { validar, datosBody, datosParams, esquemaParamsId } from '../../middlewares/validar';
import { autenticar } from '../../middlewares/autenticacion';
import { requierePermiso } from '../../middlewares/autorizacion';
import { enviarOk, enviarCreado, enviarSinContenido } from '../../utils/respuesta';
import { Conflicto, NoEncontrado } from '../../errores/AppError';
import { query, queryOne, ejecutar, insertar } from '../../database/pool';

// ---------------------------------------------------------------------------
// Categorias (CRUD)
// ---------------------------------------------------------------------------
export const routerCategorias = Router();
routerCategorias.use(autenticar);

const esqCategoria = z.object({
  nombre: z.string().trim().min(1, 'El nombre es obligatorio').max(100),
  descripcion: z.string().trim().max(255).nullable().optional(),
  categoriaPadreId: z.coerce.number().int().positive().nullable().optional(),
  colorHex: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Color invalido').nullable().optional(),
  orden: z.coerce.number().int().min(0).optional(),
});

routerCategorias.get('/', requierePermiso('categorias.ver', 'productos.ver'), async (_req, res, next) => {
  try {
    const datos = await query(
      `SELECT id, nombre, descripcion, categoria_padre_id, color_hex, orden, esta_activa,
              (SELECT COUNT(*) FROM productos p WHERE p.categoria_id = c.id AND p.eliminado_en IS NULL) AS productos
         FROM categorias c WHERE eliminado_en IS NULL ORDER BY orden, nombre`,
    );
    enviarOk(res, datos);
  } catch (e) { next(e); }
});

routerCategorias.post('/', requierePermiso('categorias.crear'), validar({ body: esqCategoria }), async (req, res, next) => {
  try {
    const e = datosBody<z.infer<typeof esqCategoria>>(req);
    const id = await insertar(
      `INSERT INTO categorias (nombre, descripcion, categoria_padre_id, color_hex, orden) VALUES (?, ?, ?, ?, ?)`,
      [e.nombre, e.descripcion ?? null, e.categoriaPadreId ?? null, e.colorHex ?? null, e.orden ?? 0],
    );
    enviarCreado(res, await queryOne(`SELECT * FROM categorias WHERE id = ?`, [id]));
  } catch (e) { next(e); }
});

routerCategorias.put('/:id', requierePermiso('categorias.editar'), validar({ params: esquemaParamsId, body: esqCategoria }), async (req, res, next) => {
  try {
    const id = datosParams<{ id: number }>(req).id;
    const e = datosBody<z.infer<typeof esqCategoria>>(req);
    const r = await ejecutar(
      `UPDATE categorias SET nombre=?, descripcion=?, categoria_padre_id=?, color_hex=?, orden=? WHERE id=? AND eliminado_en IS NULL`,
      [e.nombre, e.descripcion ?? null, e.categoriaPadreId ?? null, e.colorHex ?? null, e.orden ?? 0, id],
    );
    if (r.affectedRows === 0) throw new NoEncontrado('NO_ENCONTRADO');
    enviarOk(res, await queryOne(`SELECT * FROM categorias WHERE id = ?`, [id]));
  } catch (e) { next(e); }
});

routerCategorias.delete('/:id', requierePermiso('categorias.eliminar'), validar({ params: esquemaParamsId }), async (req, res, next) => {
  try {
    const id = datosParams<{ id: number }>(req).id;
    const enUso = await queryOne<{ n: number }>(`SELECT COUNT(*) AS n FROM productos WHERE categoria_id=? AND eliminado_en IS NULL`, [id]);
    if ((enUso?.n ?? 0) > 0) throw new Conflicto('REFERENCIA_EN_USO');
    await ejecutar(`UPDATE categorias SET eliminado_en = NOW(3) WHERE id = ?`, [id]);
    enviarSinContenido(res);
  } catch (e) { next(e); }
});

// ---------------------------------------------------------------------------
// Metodos de pago (listar + CRUD)
// ---------------------------------------------------------------------------
export const routerMetodosPago = Router();
routerMetodosPago.use(autenticar);

routerMetodosPago.get('/', async (_req, res, next) => {
  try {
    const datos = await query(
      `SELECT id, codigo, nombre, tipo, moneda, afecta_caja_efectivo, requiere_referencia,
              es_permite_cambio, es_no_es_cobro, orden, esta_activo
         FROM metodos_pago WHERE eliminado_en IS NULL ORDER BY orden, nombre`,
    );
    enviarOk(res, datos);
  } catch (e) { next(e); }
});

// ---------------------------------------------------------------------------
// Impuestos (listar)
// ---------------------------------------------------------------------------
export const routerImpuestos = Router();
routerImpuestos.use(autenticar);

routerImpuestos.get('/', async (_req, res, next) => {
  try {
    const datos = await query(
      `SELECT id, codigo, nombre, tasa, tipo, esta_activo FROM impuestos WHERE eliminado_en IS NULL ORDER BY tasa DESC`,
    );
    enviarOk(res, datos);
  } catch (e) { next(e); }
});

// ---------------------------------------------------------------------------
// Unidades de medida (listar)
// ---------------------------------------------------------------------------
export const routerUnidades = Router();
routerUnidades.use(autenticar);

routerUnidades.get('/', async (_req, res, next) => {
  try {
    const datos = await query(
      `SELECT id, codigo, nombre, es_permite_fraccion, decimales, esta_activa FROM unidades_medida WHERE eliminado_en IS NULL ORDER BY codigo`,
    );
    enviarOk(res, datos);
  } catch (e) { next(e); }
});
