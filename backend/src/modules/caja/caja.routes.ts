/** Rutas de caja y turnos: /api/v1/turnos-caja */
import { Router } from 'express';
import { z } from 'zod';
import { validar, datosBody, datosParams, esquemaParamsId } from '../../middlewares/validar';
import { autenticar, usuarioActual } from '../../middlewares/autenticacion';
import { requierePermiso } from '../../middlewares/autorizacion';
import { enviarOk, enviarCreado } from '../../utils/respuesta';
import * as caja from './caja.service';

const router = Router();

const decimalPositivo = z.union([z.string(), z.number()]).transform((v) => String(v))
  .refine((v) => /^\d+(\.\d+)?$/.test(v), 'Monto invalido');

const esquemaAbrir = z.object({
  cajaId: z.coerce.number().int().positive(),
  baseInicialUsd: decimalPositivo.default('0'),
  baseInicialBs: decimalPositivo.default('0'),
});

const esquemaMovimiento = z.object({
  turnoId: z.coerce.number().int().positive(),
  tipo: z.enum(['INGRESO', 'EGRESO']),
  moneda: z.enum(['USD', 'VES']),
  monto: decimalPositivo,
  concepto: z.string().trim().min(1).max(200),
});

const esquemaCerrar = z.object({
  contadoUsd: decimalPositivo.default('0'),
  contadoBs: decimalPositivo.default('0'),
  denominacionesUsd: z.record(z.string(), z.number()).optional(),
  denominacionesBs: z.record(z.string(), z.number()).optional(),
  observaciones: z.string().trim().max(255).optional(),
});

router.use(autenticar);

/** Turno abierto del usuario actual (lo consulta el POS al cargar). */
router.get('/activo', requierePermiso('caja.ver', 'pos.vender'), async (req, res, next) => {
  try {
    const u = usuarioActual(req);
    enviarOk(res, await caja.turnoActivoDeUsuario(u.id, u.sucursalId));
  } catch (e) {
    next(e);
  }
});

router.post('/abrir', requierePermiso('caja.abrir'), validar({ body: esquemaAbrir }), async (req, res, next) => {
  try {
    const e = datosBody<z.infer<typeof esquemaAbrir>>(req);
    const u = usuarioActual(req);
    const turno = await caja.abrirTurno(
      { cajaId: e.cajaId, baseInicialUsd: e.baseInicialUsd, baseInicialBs: e.baseInicialBs },
      u.id,
      u.sucursalId,
    );
    enviarCreado(res, turno);
  } catch (e) {
    next(e);
  }
});

router.post('/movimiento', requierePermiso('caja.movimiento'), validar({ body: esquemaMovimiento }), async (req, res, next) => {
  try {
    await caja.movimientoManual(datosBody(req), usuarioActual(req).id);
    enviarOk(res, { mensaje: 'Movimiento registrado' });
  } catch (e) {
    next(e);
  }
});

router.post('/:id/cerrar', requierePermiso('caja.cerrar'),
  validar({ params: esquemaParamsId, body: esquemaCerrar }), async (req, res, next) => {
    try {
      const { id } = datosParams<{ id: number }>(req);
      const body = datosBody<z.infer<typeof esquemaCerrar>>(req);
      enviarOk(res, await caja.cerrarTurno({ turnoId: id, ...body }, usuarioActual(req).id));
    } catch (e) {
      next(e);
    }
  });

export default router;
