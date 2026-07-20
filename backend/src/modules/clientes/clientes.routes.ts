/** Rutas de clientes: /api/v1/clientes */
import { Router } from 'express';
import { z } from 'zod';
import { validar, datosBody, datosQuery, datosParams, esquemaParamsId } from '../../middlewares/validar';
import { autenticar } from '../../middlewares/autenticacion';
import { requierePermiso } from '../../middlewares/autorizacion';
import { esquemaPaginacion, normalizarPaginacion, construirMeta } from '../../utils/paginacion';
import { enviarOk, enviarCreado, enviarSinContenido } from '../../utils/respuesta';
import * as clientes from './clientes.service';

const router = Router();
router.use(autenticar);

const decimal = z.union([z.string(), z.number()]).transform(String).refine((v) => /^\d+(\.\d+)?$/.test(v), 'Numero invalido');

const esquemaCliente = z.object({
  tipoDocumento: z.enum(['CC', 'CE', 'NIT', 'PASAPORTE', 'SIN_IDENTIFICAR']).optional(),
  documento: z.string().trim().max(30).nullable().optional(),
  nombre: z.string().trim().min(1, 'El nombre es obligatorio').max(140),
  telefono: z.string().trim().max(40).nullable().optional(),
  email: z.string().trim().email('Correo invalido').max(160).nullable().optional().or(z.literal('')),
  direccion: z.string().trim().max(200).nullable().optional(),
  cupoCredito: decimal.optional(),
  diasPlazo: z.coerce.number().int().min(0).max(365).optional(),
  esPermiteCredito: z.coerce.boolean().optional(),
  notas: z.string().trim().max(255).nullable().optional(),
});

const esquemaListado = esquemaPaginacion.extend({
  busqueda: z.string().trim().max(120).optional(),
  conDeuda: z.coerce.boolean().optional(),
});

router.get('/', requierePermiso('clientes.ver'), validar({ query: esquemaListado }), async (req, res, next) => {
  try {
    const q = datosQuery<z.infer<typeof esquemaListado>>(req);
    const p = normalizarPaginacion(q);
    const { datos, total } = await clientes.listar({ busqueda: q.busqueda, conDeuda: q.conDeuda, desplazamiento: p.desplazamiento, limite: p.limite });
    enviarOk(res, datos, construirMeta(p, total));
  } catch (e) { next(e); }
});

router.get('/:id', requierePermiso('clientes.ver'), validar({ params: esquemaParamsId }), async (req, res, next) => {
  try {
    enviarOk(res, await clientes.obtener(datosParams<{ id: number }>(req).id));
  } catch (e) { next(e); }
});

router.post('/', requierePermiso('clientes.crear'), validar({ body: esquemaCliente }), async (req, res, next) => {
  try {
    enviarCreado(res, await clientes.crear(datosBody(req)));
  } catch (e) { next(e); }
});

router.put('/:id', requierePermiso('clientes.editar'), validar({ params: esquemaParamsId, body: esquemaCliente }), async (req, res, next) => {
  try {
    enviarOk(res, await clientes.actualizar(datosParams<{ id: number }>(req).id, datosBody(req)));
  } catch (e) { next(e); }
});

router.delete('/:id', requierePermiso('clientes.eliminar'), validar({ params: esquemaParamsId }), async (req, res, next) => {
  try {
    await clientes.eliminar(datosParams<{ id: number }>(req).id);
    enviarSinContenido(res);
  } catch (e) { next(e); }
});

export default router;
