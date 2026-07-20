/** Rutas de productos: /api/v1/productos */
import { Router } from 'express';
import { z } from 'zod';
import { validar, datosBody, datosQuery, datosParams, esquemaParamsId } from '../../middlewares/validar';
import { autenticar, usuarioActual } from '../../middlewares/autenticacion';
import { requierePermiso } from '../../middlewares/autorizacion';
import { esquemaPaginacion, normalizarPaginacion, construirMeta } from '../../utils/paginacion';
import { enviarOk, enviarCreado, enviarSinContenido } from '../../utils/respuesta';
import * as productos from './productos.service';
import { tasaDeFecha } from '../tasas/tasas.service';

const decimal = z.union([z.string(), z.number()]).transform(String).refine((v) => /^\d+(\.\d+)?$/.test(v), 'Numero invalido');

const esquemaProducto = z.object({
  sku: z.string().trim().min(1, 'El código (SKU) es obligatorio').max(40),
  nombre: z.string().trim().min(1, 'El nombre es obligatorio').max(160),
  descripcion: z.string().trim().max(500).nullable().optional(),
  categoriaId: z.coerce.number().int().positive(),
  unidadMedidaId: z.coerce.number().int().positive(),
  impuestoId: z.coerce.number().int().positive(),
  precioVenta: decimal,
  costoInicial: decimal.optional(),
  stockMinimo: decimal.optional(),
  esPrecioIncluyeImpuesto: z.coerce.boolean().optional(),
  esPesable: z.coerce.boolean().optional(),
  esFavoritoPos: z.coerce.boolean().optional(),
  codigoBarras: z.string().trim().max(64).optional(),
});

const router = Router();

const esquemaListado = esquemaPaginacion.extend({
  busqueda: z.string().trim().max(120).optional(),
  categoriaId: z.coerce.number().int().positive().optional(),
  soloActivos: z.coerce.boolean().optional().default(true),
  stockBajo: z.coerce.boolean().optional(),
  favoritos: z.coerce.boolean().optional(),
});

const esquemaBusqueda = z.object({
  q: z.string().trim().min(1, 'Indique un termino de busqueda').max(120),
});

router.use(autenticar);

/** Busqueda rapida del POS: por codigo de barras, SKU o nombre. */
router.get('/buscar', requierePermiso('productos.ver', 'pos.vender'),
  validar({ query: esquemaBusqueda }), async (req, res, next) => {
    try {
      const { q } = datosQuery<{ q: string }>(req);
      const usuario = usuarioActual(req);
      const tasa = await tasaDeFecha();
      const resultados = await productos.buscarPos(q, usuario.sucursalId, tasa?.tasa ?? null);
      enviarOk(res, resultados);
    } catch (e) {
      next(e);
    }
  });

router.get('/', requierePermiso('productos.ver', 'pos.vender'),
  validar({ query: esquemaListado }), async (req, res, next) => {
    try {
      const q = datosQuery<z.infer<typeof esquemaListado>>(req);
      const p = normalizarPaginacion(q);
      const usuario = usuarioActual(req);
      const tasa = await tasaDeFecha();
      const { datos, total } = await productos.listar(
        {
          busqueda: q.busqueda,
          categoriaId: q.categoriaId,
          soloActivos: q.soloActivos,
          stockBajo: q.stockBajo,
          favoritos: q.favoritos,
          desplazamiento: p.desplazamiento,
          limite: p.limite,
          sucursalId: usuario.sucursalId,
        },
        tasa?.tasa ?? null,
      );
      enviarOk(res, datos, construirMeta(p, total));
    } catch (e) {
      next(e);
    }
  });

router.get('/:id', requierePermiso('productos.ver', 'pos.vender'),
  validar({ params: esquemaParamsId }), async (req, res, next) => {
    try {
      const { id } = datosParams<{ id: number }>(req);
      const usuario = usuarioActual(req);
      const tasa = await tasaDeFecha();
      enviarOk(res, await productos.obtenerPorId(id, usuario.sucursalId, tasa?.tasa ?? null));
    } catch (e) {
      next(e);
    }
  });

router.get('/:id/kardex', requierePermiso('inventario.ver'),
  validar({ params: esquemaParamsId }), async (req, res, next) => {
    try {
      const { id } = datosParams<{ id: number }>(req);
      enviarOk(res, await productos.kardex(id, usuarioActual(req).sucursalId));
    } catch (e) {
      next(e);
    }
  });

router.post('/', requierePermiso('productos.crear'), validar({ body: esquemaProducto }), async (req, res, next) => {
  try {
    const u = usuarioActual(req);
    enviarCreado(res, await productos.crear(datosBody(req), u.sucursalId, u.id));
  } catch (e) { next(e); }
});

router.put('/:id', requierePermiso('productos.editar'), validar({ params: esquemaParamsId, body: esquemaProducto }), async (req, res, next) => {
  try {
    const u = usuarioActual(req);
    enviarOk(res, await productos.actualizar(datosParams<{ id: number }>(req).id, datosBody(req), u.sucursalId));
  } catch (e) { next(e); }
});

router.delete('/:id', requierePermiso('productos.eliminar'), validar({ params: esquemaParamsId }), async (req, res, next) => {
  try {
    await productos.eliminar(datosParams<{ id: number }>(req).id);
    enviarSinContenido(res);
  } catch (e) { next(e); }
});

router.post('/:id/precio', requierePermiso('productos.cambiar_precio', 'productos.editar'),
  validar({ params: esquemaParamsId, body: z.object({ precioVenta: decimal, motivo: z.string().trim().max(200).optional() }) }), async (req, res, next) => {
    try {
      const { id } = datosParams<{ id: number }>(req);
      const { precioVenta, motivo } = datosBody<{ precioVenta: string; motivo?: string }>(req);
      await productos.cambiarPrecio(id, precioVenta, usuarioActual(req).id, motivo);
      enviarOk(res, { mensaje: 'Precio actualizado' });
    } catch (e) { next(e); }
  });

export default router;
