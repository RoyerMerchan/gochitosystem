/** Rutas de compras: /api/v1/compras */
import { Router, type Request } from 'express';
import { z } from 'zod';
import { validar, datosBody, datosQuery, datosParams, esquemaParamsId } from '../../middlewares/validar';
import { autenticar, usuarioActual } from '../../middlewares/autenticacion';
import { requierePermiso } from '../../middlewares/autorizacion';
import { idempotencia } from '../../middlewares/idempotencia';
import { esquemaPaginacion, normalizarPaginacion, construirMeta } from '../../utils/paginacion';
import { enviarOk, enviarCreado } from '../../utils/respuesta';
import * as compras from './compras.service';

const router = Router();
router.use(autenticar);

const decimal = z.union([z.string(), z.number()]).transform(String).refine((v) => /^\d+(\.\d+)?$/.test(v), 'Numero invalido');

const esquemaCompra = z.object({
  proveedorId: z.coerce.number().int().positive().optional(),
  numeroFacturaProveedor: z.string().trim().max(60).optional(),
  fechaDocumento: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  condicionPago: z.enum(['CONTADO', 'CREDITO']).optional(),
  monedaPago: z.enum(['USD', 'VES']).optional(),
  observaciones: z.string().trim().max(255).optional(),
  renglones: z.array(z.object({
    productoId: z.coerce.number().int().positive(),
    cantidad: decimal.refine((v) => Number(v) > 0, 'Cantidad invalida'),
    costoUnitario: decimal,
    descuentoUnitario: decimal.optional(),
  })).min(1, 'La compra debe tener al menos un producto'),
});

const esquemaListadoCompras = esquemaPaginacion.extend({
  desde: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  hasta: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

router.get('/', requierePermiso('compras.ver'), validar({ query: esquemaListadoCompras }), async (req, res, next) => {
  try {
    const q = datosQuery<z.infer<typeof esquemaListadoCompras>>(req);
    const p = normalizarPaginacion(q);
    const u = usuarioActual(req);
    const { datos, total } = await compras.listar(u.sucursalId, p.desplazamiento, p.limite, { desde: q.desde, hasta: q.hasta });
    enviarOk(res, datos, construirMeta(p, total));
  } catch (e) { next(e); }
});

router.get('/:id', requierePermiso('compras.ver'), validar({ params: esquemaParamsId }), async (req, res, next) => {
  try {
    enviarOk(res, await compras.detalle(datosParams<{ id: number }>(req).id, usuarioActual(req).sucursalId));
  } catch (e) { next(e); }
});

router.post('/', requierePermiso('compras.crear'), validar({ body: esquemaCompra }), idempotencia('compras'), async (req: Request, res, next) => {
  try {
    const resultado = await compras.registrar(datosBody(req), usuarioActual(req), req.idempotencia?.clave ?? null);
    enviarCreado(res, resultado);
  } catch (e) { next(e); }
});

router.post('/:id/anular', requierePermiso('compras.anular'),
  validar({ params: esquemaParamsId, body: z.object({ motivo: z.string().trim().min(3).max(200) }) }), async (req, res, next) => {
    try {
      const id = datosParams<{ id: number }>(req).id;
      const { motivo } = datosBody<{ motivo: string }>(req);
      await compras.anular(id, usuarioActual(req).sucursalId, usuarioActual(req), motivo);
      enviarOk(res, { mensaje: 'Compra anulada' });
    } catch (e) { next(e); }
  });

export default router;
