/**
 * Rutas de creditos y abonos.
 *   default -> /api/v1/creditos (cartera + estado de cuenta)
 *   rutasAbonos -> /api/v1/abonos (registrar abono)
 */
import { Router, type Request } from 'express';
import { z } from 'zod';
import { validar, datosBody, datosParams, esquemaParamsId } from '../../middlewares/validar';
import { autenticar, usuarioActual } from '../../middlewares/autenticacion';
import { requierePermiso } from '../../middlewares/autorizacion';
import { idempotencia } from '../../middlewares/idempotencia';
import { enviarOk, enviarCreado } from '../../utils/respuesta';
import * as creditos from './creditos.service';

const router = Router();
router.use(autenticar);

router.get('/cartera', requierePermiso('creditos.ver'), async (_req, res, next) => {
  try { enviarOk(res, await creditos.listarCartera()); } catch (e) { next(e); }
});

router.get('/cliente/:id', requierePermiso('creditos.ver'), validar({ params: esquemaParamsId }), async (req, res, next) => {
  try { enviarOk(res, await creditos.estadoCuenta(datosParams<{ id: number }>(req).id)); } catch (e) { next(e); }
});

// -----------------------------------------------------------------------------
export const rutasAbonos = Router();
rutasAbonos.use(autenticar);

const decimal = z.union([z.string(), z.number()]).transform(String).refine((v) => /^\d+(\.\d+)?$/.test(v), 'Numero invalido');

const esquemaAbono = z.object({
  clienteId: z.coerce.number().int().positive(),
  metodoPagoId: z.coerce.number().int().positive(),
  moneda: z.enum(['USD', 'VES']),
  montoMoneda: decimal.refine((v) => Number(v) > 0, 'El monto debe ser mayor que cero'),
  referencia: z.string().trim().max(60).optional(),
  observaciones: z.string().trim().max(255).optional(),
});

rutasAbonos.post('/', requierePermiso('abonos.registrar'), validar({ body: esquemaAbono }), idempotencia('abonos'), async (req: Request, res, next) => {
  try {
    const r = await creditos.registrarAbono(datosBody(req), usuarioActual(req), req.idempotencia?.clave ?? null);
    enviarCreado(res, r);
  } catch (e) { next(e); }
});

export default router;
