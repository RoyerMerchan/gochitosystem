/**
 * Autenticacion por JWT.
 *
 * El access token NO lleva permisos embebidos (ADR-010): solo identifica al usuario.
 * Los permisos se resuelven contra la base en el middleware de autorizacion, para
 * que revocar un permiso surta efecto de inmediato y no en los proximos 15 minutos.
 *
 * En cada solicitud se relee el usuario para detectar desactivacion o borrado
 * logico sin esperar a que expire el token.
 */
import type { NextFunction, Request, RequestHandler, Response } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { NoAutenticado, NoAutorizado } from '../errores/AppError';
import { queryOne } from '../database/pool';
import { ampliarContexto } from '../utils/logger';
import type { PayloadJwt, UsuarioAutenticado } from '../tipos/comunes';

interface FilaUsuario {
  id: number;
  usuario: string;
  nombre_completo: string;
  rol_id: number;
  rol_codigo: string;
  sucursal_predeterminada_id: number | null;
  debe_cambiar_password: number;
  esta_activo: number;
  bloqueado_hasta: string | null;
  eliminado_en: string | null;
}

/** Extrae el token del header Authorization: Bearer <jwt>. */
function extraerToken(req: Request): string | null {
  const cabecera = req.header('Authorization');
  if (!cabecera) return null;

  const [esquema, token] = cabecera.split(' ');
  if (!esquema || esquema.toLowerCase() !== 'bearer' || !token) return null;

  return token.trim();
}

/** Verifica la firma y vigencia del access token. */
export function verificarAccessToken(token: string): PayloadJwt {
  try {
    return jwt.verify(token, env.seguridad.jwtSecreto) as PayloadJwt;
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      throw new NoAutenticado('TOKEN_EXPIRADO', { causa: error });
    }
    throw new NoAutenticado('TOKEN_INVALIDO', { causa: error });
  }
}

/** Carga el usuario vigente desde la base y lo mapea al tipo del dominio. */
async function cargarUsuario(usuarioId: number): Promise<UsuarioAutenticado> {
  const fila = await queryOne<FilaUsuario>(
    `SELECT u.id,
            u.usuario,
            u.nombre_completo,
            u.rol_id,
            r.codigo AS rol_codigo,
            u.sucursal_predeterminada_id,
            u.debe_cambiar_password,
            u.esta_activo,
            u.bloqueado_hasta,
            u.eliminado_en
       FROM usuarios u
       JOIN roles r ON r.id = u.rol_id
      WHERE u.id = ?
      LIMIT 1`,
    [usuarioId],
  );

  if (!fila || fila.eliminado_en !== null) {
    throw new NoAutenticado('TOKEN_INVALIDO');
  }
  if (fila.esta_activo !== 1) {
    throw new NoAutorizado('USUARIO_INACTIVO');
  }

  return {
    id: fila.id,
    usuario: fila.usuario,
    nombreCompleto: fila.nombre_completo,
    rolId: fila.rol_id,
    rolCodigo: fila.rol_codigo,
    // La sucursal efectiva viene del token (el usuario puede operar en varias).
    sucursalId: fila.sucursal_predeterminada_id ?? 0,
    debeCambiarPassword: fila.debe_cambiar_password === 1,
  };
}

/**
 * Middleware principal: exige un token valido y deja el usuario en `req.usuario`.
 */
export const autenticar: RequestHandler = (
  req: Request,
  _res: Response,
  next: NextFunction,
): void => {
  const token = extraerToken(req);
  if (!token) {
    next(new NoAutenticado('TOKEN_AUSENTE'));
    return;
  }

  let payload: PayloadJwt;
  try {
    payload = verificarAccessToken(token);
  } catch (error) {
    next(error);
    return;
  }

  const usuarioId = Number.parseInt(payload.sub, 10);
  if (!Number.isInteger(usuarioId) || usuarioId <= 0) {
    next(new NoAutenticado('TOKEN_INVALIDO'));
    return;
  }

  cargarUsuario(usuarioId)
    .then((usuario) => {
      // La sucursal activa la fija el token: un usuario puede tener varias asignadas.
      req.usuario = {
        ...usuario,
        sucursalId: payload.sucursalId ?? usuario.sucursalId,
      };
      ampliarContexto({
        usuarioId: req.usuario.id,
        sucursalId: req.usuario.sucursalId,
      });
      next();
    })
    .catch(next);
};

/**
 * Bloquea la operacion si el usuario tiene la contrasena vencida.
 * Se monta en las rutas de negocio, nunca en la de cambiar contrasena.
 */
export const exigirPasswordVigente: RequestHandler = (req, _res, next): void => {
  if (req.usuario?.debeCambiarPassword) {
    next(new NoAutorizado('DEBE_CAMBIAR_PASSWORD'));
    return;
  }
  next();
};

/**
 * Devuelve el usuario autenticado o lanza. Evita el `req.usuario!` en cada service.
 */
export function usuarioActual(req: Request): UsuarioAutenticado {
  if (!req.usuario) throw new NoAutenticado('TOKEN_AUSENTE');
  return req.usuario;
}
