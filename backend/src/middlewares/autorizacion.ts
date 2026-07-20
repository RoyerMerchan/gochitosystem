/**
 * Autorizacion RBAC basada en la matriz rol_permisos.
 *
 * Los permisos siguen la convencion `modulo.accion` (ventas.anular,
 * productos.editar_costo, reportes.utilidad.ver) y viven en la base, no en el
 * codigo: otorgar o revocar es un INSERT/DELETE desde la interfaz (ADR-010).
 *
 * Se cachean por rol durante unos segundos para no consultar la matriz en cada
 * request del POS; el TTL corto acota cuanto sobrevive un permiso ya revocado.
 */
import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { NoAutenticado, NoAutorizado } from '../errores/AppError';
import { query } from '../database/pool';

/** Vigencia del cache de permisos por rol, en milisegundos. */
const TTL_CACHE_MS = 30_000;

interface EntradaCache {
  readonly permisos: ReadonlySet<string>;
  readonly expiraEn: number;
}

const cachePermisos = new Map<number, EntradaCache>();

/** Carga los codigos de permiso de un rol, con cache de corta vida. */
export async function permisosDeRol(rolId: number): Promise<ReadonlySet<string>> {
  const enCache = cachePermisos.get(rolId);
  if (enCache && enCache.expiraEn > Date.now()) return enCache.permisos;

  const filas = await query<{ codigo: string }>(
    `SELECT p.codigo
       FROM rol_permisos rp
       JOIN permisos p ON p.id = rp.permiso_id
      WHERE rp.rol_id = ?`,
    [rolId],
  );

  const permisos = new Set(filas.map((f) => f.codigo));
  cachePermisos.set(rolId, { permisos, expiraEn: Date.now() + TTL_CACHE_MS });
  return permisos;
}

/**
 * Invalida el cache de un rol (o de todos).
 * El modulo de roles DEBE llamarlo tras modificar la matriz rol_permisos.
 */
export function invalidarCachePermisos(rolId?: number): void {
  if (rolId === undefined) cachePermisos.clear();
  else cachePermisos.delete(rolId);
}

/**
 * Exige uno o varios permisos. Con varios, basta con tener UNO (OR).
 *
 *   router.post('/:id/anular', autenticar, requierePermiso('ventas.anular'), ctrl)
 */
export function requierePermiso(...requeridos: readonly string[]): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const usuario = req.usuario;
    if (!usuario) {
      next(new NoAutenticado('TOKEN_AUSENTE'));
      return;
    }

    permisosDeRol(usuario.rolId)
      .then((permisos) => {
        const autorizado = requeridos.some((codigo) => permisos.has(codigo));
        if (!autorizado) {
          next(
            new NoAutorizado('PERMISO_DENEGADO', {
              detalles: { requeridos, rol: usuario.rolCodigo },
            }),
          );
          return;
        }
        next();
      })
      .catch(next);
  };
}

/** Exige TODOS los permisos indicados (AND). */
export function requiereTodosLosPermisos(
  ...requeridos: readonly string[]
): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const usuario = req.usuario;
    if (!usuario) {
      next(new NoAutenticado('TOKEN_AUSENTE'));
      return;
    }

    permisosDeRol(usuario.rolId)
      .then((permisos) => {
        const faltantes = requeridos.filter((codigo) => !permisos.has(codigo));
        if (faltantes.length > 0) {
          next(new NoAutorizado('PERMISO_DENEGADO', { detalles: { faltantes } }));
          return;
        }
        next();
      })
      .catch(next);
  };
}

/**
 * Exige que el usuario tenga asignada la sucursal sobre la que va a operar.
 * Evita fugas entre sedes cuando llegue la segunda sucursal (ADR-005).
 */
export function requiereSucursal(obtenerSucursalId: (req: Request) => number | undefined) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const usuario = req.usuario;
    if (!usuario) {
      next(new NoAutenticado('TOKEN_AUSENTE'));
      return;
    }

    const solicitada = obtenerSucursalId(req) ?? usuario.sucursalId;
    if (solicitada === usuario.sucursalId) {
      next();
      return;
    }

    query<{ total: number }>(
      `SELECT COUNT(*) AS total
         FROM usuario_sucursales
        WHERE usuario_id = ? AND sucursal_id = ?`,
      [usuario.id, solicitada],
    )
      .then((filas) => {
        if ((filas[0]?.total ?? 0) === 0) {
          next(new NoAutorizado('SUCURSAL_NO_ASIGNADA', { detalles: { solicitada } }));
          return;
        }
        next();
      })
      .catch(next);
  };
}
