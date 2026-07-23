/**
 * Middleware que, tras una MUTACION exitosa, avisa por Socket.IO a la sucursal del
 * usuario para que los clientes refresquen sin recargar la pagina.
 *
 * No conoce el detalle del cambio: emite el "recurso" (primer segmento de la ruta,
 * p.ej. `ventas`, `compras`, `turnos-caja`) y el frontend decide que consultas
 * invalidar. Se apoya en `res.on('finish')`, asi que ya tiene el status final y el
 * `req.usuario` cargado por el middleware de autenticacion.
 */
import type { RequestHandler } from 'express';
import { env } from '../config/env';
import { emitirCambio } from '../realtime/io';

const METODOS_MUTANTES = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

// Recursos (primer segmento de ruta) cuyas mutaciones interesan en tiempo real.
const RECURSOS = new Set([
  'pos',
  'ventas',
  'compras',
  'abonos',
  'creditos',
  'turnos-caja',
  'inventario',
  'productos',
  'clientes',
  'proveedores',
  'tasas-cambio',
  'categorias',
  'metodos-pago',
  'impuestos',
  'unidades-medida',
  'configuracion',
  'usuarios',
  'roles',
]);

function recursoDesdePath(path: string): string | null {
  const sinPrefijo = path.startsWith(env.api.prefijo)
    ? path.slice(env.api.prefijo.length)
    : path;
  return sinPrefijo.split('/').filter(Boolean)[0] ?? null;
}

export const notificarCambiosRealtime: RequestHandler = (req, res, next) => {
  if (!METODOS_MUTANTES.has(req.method.toUpperCase())) {
    next();
    return;
  }

  res.on('finish', () => {
    // Solo exitos (2xx/3xx) y solo si hubo usuario autenticado (sabemos su sucursal).
    if (res.statusCode >= 400) return;
    const usuario = req.usuario;
    if (!usuario) return;

    const recurso = recursoDesdePath(req.path);
    if (!recurso || !RECURSOS.has(recurso)) return;

    emitirCambio(usuario.sucursalId, recurso, { por: usuario.id, accion: req.method });
  });

  next();
};
