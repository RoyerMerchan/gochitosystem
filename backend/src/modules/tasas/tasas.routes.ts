/** Rutas de tasas de cambio: /api/v1/tasas-cambio */
import { Router } from 'express';
import { z } from 'zod';
import { validar, datosBody, datosQuery, datosParams, esquemaParamsId } from '../../middlewares/validar';
import { autenticar, usuarioActual } from '../../middlewares/autenticacion';
import { requierePermiso } from '../../middlewares/autorizacion';
import { esquemaPaginacion, normalizarPaginacion, construirMeta } from '../../utils/paginacion';
import { enviarOk, enviarCreado } from '../../utils/respuesta';
import { FUENTE_TASA } from '../../config/constantes';
import * as servicio from './tasas.service';

const router = Router();

const esquemaRegistrar = z.object({
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha invalida (YYYY-MM-DD)').optional(),
  tasa: z.union([z.string(), z.number()]).transform((v) => String(v))
    .refine((v) => /^\d+(\.\d+)?$/.test(v) && Number(v) > 0, 'La tasa debe ser un numero mayor que cero'),
  fuente: z.nativeEnum(FUENTE_TASA).optional(),
  notas: z.string().trim().max(255).optional(),
});

const esquemaCorregir = z.object({
  tasa: z.union([z.string(), z.number()]).transform((v) => String(v))
    .refine((v) => /^\d+(\.\d+)?$/.test(v) && Number(v) > 0, 'La tasa debe ser un numero mayor que cero'),
  notas: z.string().trim().max(255).optional(),
  fuente: z.nativeEnum(FUENTE_TASA).optional(),
});

router.use(autenticar);

/** Tasa vigente de hoy. La consulta el frontend al arrancar. */
router.get('/vigente', async (_req, res, next) => {
  try {
    enviarOk(res, await servicio.obtenerVigente());
  } catch (e) {
    next(e);
  }
});

/** Consulta la tasa BCV del dia en Cotizave (sin registrarla). */
router.get('/bcv', requierePermiso('tasas.registrar', 'tasas.ver'), async (_req, res, next) => {
  try {
    enviarOk(res, await servicio.obtenerTasaBcv());
  } catch (e) {
    next(e);
  }
});

router.get('/', requierePermiso('tasas.ver'), validar({ query: esquemaPaginacion }), async (req, res, next) => {
  try {
    const p = normalizarPaginacion(datosQuery(req));
    const { datos, total } = await servicio.listar(p.desplazamiento, p.limite);
    enviarOk(res, datos, construirMeta(p, total));
  } catch (e) {
    next(e);
  }
});

router.post('/', requierePermiso('tasas.registrar'), validar({ body: esquemaRegistrar }), async (req, res, next) => {
  try {
    const entrada = datosBody<z.infer<typeof esquemaRegistrar>>(req);
    const tasa = await servicio.registrar(entrada, usuarioActual(req).id);
    enviarCreado(res, tasa);
  } catch (e) {
    next(e);
  }
});

router.post('/:id/corregir', requierePermiso('tasas.corregir'),
  validar({ params: esquemaParamsId, body: esquemaCorregir }), async (req, res, next) => {
    try {
      const { id } = datosParams<{ id: number }>(req);
      const { tasa, notas, fuente } = datosBody<z.infer<typeof esquemaCorregir>>(req);
      enviarOk(res, await servicio.corregir(id, tasa, usuarioActual(req).id, notas, fuente));
    } catch (e) {
      next(e);
    }
  });

export default router;
