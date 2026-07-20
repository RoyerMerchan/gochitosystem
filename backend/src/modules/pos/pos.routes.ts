/**
 * Rutas del POS y del historial de ventas.
 *   default        -> /api/v1/pos      (POST /ventas: registrar venta)
 *   rutasVentas    -> /api/v1/ventas   (historial y detalle)
 */
import { Router, type Request } from 'express';
import { z } from 'zod';
import {
  validar,
  datosBody,
  datosQuery,
  datosParams,
  esquemaParamsId,
} from '../../middlewares/validar';
import { autenticar, usuarioActual } from '../../middlewares/autenticacion';
import { requierePermiso } from '../../middlewares/autorizacion';
import { idempotencia } from '../../middlewares/idempotencia';
import { esquemaPaginacion, normalizarPaginacion, construirMeta } from '../../utils/paginacion';
import { enviarCreado, enviarOk } from '../../utils/respuesta';
import * as pos from './pos.service';
import type { VentaEntrada } from './pos.types';

const decimal = z
  .union([z.string(), z.number()])
  .transform((v) => String(v))
  .refine((v) => /^\d+(\.\d+)?$/.test(v), 'Numero invalido');

const esquemaVenta = z.object({
  clienteId: z.coerce.number().int().positive().nullable().optional(),
  renglones: z
    .array(
      z.object({
        productoId: z.coerce.number().int().positive(),
        cantidad: decimal.refine((v) => Number(v) > 0, 'La cantidad debe ser mayor que cero'),
        precioUnitario: decimal.optional(),
        descuentoUnitario: decimal.optional(),
      }),
    )
    .min(1, 'La venta debe tener al menos un producto'),
  pagos: z
    .array(
      z.object({
        metodoPagoId: z.coerce.number().int().positive(),
        montoMoneda: decimal.refine((v) => Number(v) > 0, 'El monto debe ser mayor que cero'),
        referencia: z.string().trim().max(60).optional(),
      }),
    )
    .min(1, 'Indique al menos un metodo de pago'),
  descuentoDocumento: decimal.optional(),
  observaciones: z.string().trim().max(255).optional(),
  monedaVuelto: z.enum(['USD', 'VES']).optional(),
});

// -----------------------------------------------------------------------------
// Router POS: registrar venta
// -----------------------------------------------------------------------------
const router = Router();
router.use(autenticar);

router.post(
  '/ventas',
  requierePermiso('pos.vender'),
  validar({ body: esquemaVenta }),
  idempotencia('pos.ventas'),
  async (req: Request, res, next) => {
    try {
      const entrada = datosBody<VentaEntrada>(req);
      const clave = req.idempotencia?.clave ?? null;
      const resultado = await pos.registrarVenta(entrada, usuarioActual(req), clave);
      enviarCreado(res, resultado);
    } catch (e) {
      next(e);
    }
  },
);

// -----------------------------------------------------------------------------
// Router Ventas: historial y detalle
// -----------------------------------------------------------------------------
export const rutasVentas = Router();
rutasVentas.use(autenticar);

const esquemaListadoVentas = esquemaPaginacion.extend({
  desde: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  hasta: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  metodoPagoId: z.coerce.number().int().positive().optional(),
  estado: z.enum(['ABIERTA', 'CERRADA', 'ANULADA']).optional(),
});

rutasVentas.get(
  '/',
  requierePermiso('ventas.ver'),
  validar({ query: esquemaListadoVentas }),
  async (req, res, next) => {
    try {
      const q = datosQuery<z.infer<typeof esquemaListadoVentas>>(req);
      const p = normalizarPaginacion(q);
      const u = usuarioActual(req);
      const { datos, total } = await pos.listarVentas(u.sucursalId, {
        desde: q.desde, hasta: q.hasta, metodoPagoId: q.metodoPagoId, estado: q.estado,
        desplazamiento: p.desplazamiento, limite: p.limite,
      });
      enviarOk(res, datos, construirMeta(p, total));
    } catch (e) {
      next(e);
    }
  },
);

rutasVentas.get(
  '/:id',
  requierePermiso('ventas.ver'),
  validar({ params: esquemaParamsId }),
  async (req, res, next) => {
    try {
      const { id } = datosParams<{ id: number }>(req);
      enviarOk(res, await pos.detalleVenta(id, usuarioActual(req).sucursalId));
    } catch (e) {
      next(e);
    }
  },
);

rutasVentas.post(
  '/:id/anular',
  requierePermiso('ventas.anular'),
  validar({ params: esquemaParamsId, body: z.object({ motivo: z.string().trim().min(3, 'Indique el motivo').max(200) }) }),
  async (req, res, next) => {
    try {
      const { id } = datosParams<{ id: number }>(req);
      const { motivo } = datosBody<{ motivo: string }>(req);
      await pos.anularVenta(id, usuarioActual(req).sucursalId, usuarioActual(req), motivo);
      enviarOk(res, { mensaje: 'Venta anulada' });
    } catch (e) {
      next(e);
    }
  },
);

export default router;
