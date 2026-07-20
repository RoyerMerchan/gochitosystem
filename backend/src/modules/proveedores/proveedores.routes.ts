/** Rutas de proveedores: /api/v1/proveedores (CRUD + service inline). */
import { Router } from 'express';
import { z } from 'zod';
import { validar, datosBody, datosQuery, datosParams, esquemaParamsId } from '../../middlewares/validar';
import { autenticar } from '../../middlewares/autenticacion';
import { requierePermiso } from '../../middlewares/autorizacion';
import { esquemaPaginacion, normalizarPaginacion, construirMeta } from '../../utils/paginacion';
import { enviarOk, enviarCreado, enviarSinContenido } from '../../utils/respuesta';
import { Conflicto, NoEncontrado } from '../../errores/AppError';
import { query, queryOne, ejecutar, insertar } from '../../database/pool';

const router = Router();
router.use(autenticar);

interface ProvFila {
  id: number; nit: string | null; razon_social: string; nombre_comercial: string | null;
  contacto_nombre: string | null; telefono: string | null; email: string | null;
  direccion: string | null; ciudad: string | null; dias_plazo: number;
  cupo_credito: string; saldo_actual: string; esta_activo: number;
}

const SELECT = `SELECT id, nit, razon_social, nombre_comercial, contacto_nombre, telefono, email,
       direccion, ciudad, dias_plazo, cupo_credito, saldo_actual, esta_activo FROM proveedores`;

const esquema = z.object({
  nit: z.string().trim().max(32).nullable().optional(),
  razonSocial: z.string().trim().min(1, 'La razon social es obligatoria').max(160),
  nombreComercial: z.string().trim().max(120).nullable().optional(),
  contactoNombre: z.string().trim().max(120).nullable().optional(),
  telefono: z.string().trim().max(40).nullable().optional(),
  email: z.string().trim().max(160).nullable().optional(),
  direccion: z.string().trim().max(200).nullable().optional(),
  ciudad: z.string().trim().max(80).nullable().optional(),
  diasPlazo: z.coerce.number().int().min(0).max(365).optional(),
});

const listado = esquemaPaginacion.extend({ busqueda: z.string().trim().max(120).optional() });

async function obtener(id: number): Promise<ProvFila> {
  const p = await queryOne<ProvFila>(`${SELECT} WHERE id = ? AND eliminado_en IS NULL`, [id]);
  if (!p) throw new NoEncontrado('PROVEEDOR_NO_ENCONTRADO');
  return p;
}

router.get('/', requierePermiso('proveedores.ver'), validar({ query: listado }), async (req, res, next) => {
  try {
    const q = datosQuery<z.infer<typeof listado>>(req);
    const p = normalizarPaginacion(q);
    const cond = ['eliminado_en IS NULL']; const params: (string | number)[] = [];
    if (q.busqueda) { cond.push('(razon_social LIKE ? OR nit LIKE ?)'); const l = `%${q.busqueda}%`; params.push(l, l); }
    const where = `WHERE ${cond.join(' AND ')}`;
    const datos = await query<ProvFila>(`${SELECT} ${where} ORDER BY razon_social LIMIT ? OFFSET ?`, [...params, p.limite, p.desplazamiento]);
    const total = await queryOne<{ n: number }>(`SELECT COUNT(*) AS n FROM proveedores ${where}`, params);
    enviarOk(res, datos, construirMeta(p, total?.n ?? 0));
  } catch (e) { next(e); }
});

router.get('/:id', requierePermiso('proveedores.ver'), validar({ params: esquemaParamsId }), async (req, res, next) => {
  try { enviarOk(res, await obtener(datosParams<{ id: number }>(req).id)); } catch (e) { next(e); }
});

router.post('/', requierePermiso('proveedores.crear'), validar({ body: esquema }), async (req, res, next) => {
  try {
    const e = datosBody<z.infer<typeof esquema>>(req);
    const id = await insertar(
      `INSERT INTO proveedores (nit, razon_social, nombre_comercial, contacto_nombre, telefono, email, direccion, ciudad, dias_plazo)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [e.nit ?? null, e.razonSocial, e.nombreComercial ?? null, e.contactoNombre ?? null, e.telefono ?? null, e.email ?? null, e.direccion ?? null, e.ciudad ?? null, e.diasPlazo ?? 0],
    );
    enviarCreado(res, await obtener(id));
  } catch (e) { next(e); }
});

router.put('/:id', requierePermiso('proveedores.editar'), validar({ params: esquemaParamsId, body: esquema }), async (req, res, next) => {
  try {
    const id = datosParams<{ id: number }>(req).id;
    await obtener(id);
    const e = datosBody<z.infer<typeof esquema>>(req);
    await ejecutar(
      `UPDATE proveedores SET nit=?, razon_social=?, nombre_comercial=?, contacto_nombre=?, telefono=?, email=?, direccion=?, ciudad=?, dias_plazo=? WHERE id=?`,
      [e.nit ?? null, e.razonSocial, e.nombreComercial ?? null, e.contactoNombre ?? null, e.telefono ?? null, e.email ?? null, e.direccion ?? null, e.ciudad ?? null, e.diasPlazo ?? 0, id],
    );
    enviarOk(res, await obtener(id));
  } catch (e) { next(e); }
});

router.delete('/:id', requierePermiso('proveedores.eliminar'), validar({ params: esquemaParamsId }), async (req, res, next) => {
  try {
    const id = datosParams<{ id: number }>(req).id;
    const p = await obtener(id);
    if (Number(p.saldo_actual) > 0) throw new Conflicto('REFERENCIA_EN_USO');
    await ejecutar(`UPDATE proveedores SET eliminado_en = NOW(3) WHERE id = ?`, [id]);
    enviarSinContenido(res);
  } catch (e) { next(e); }
});

export default router;
