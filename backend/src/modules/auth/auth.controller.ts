/** Controladores HTTP del modulo de autenticacion. */
import type { Request, Response, NextFunction } from 'express';
import { enviarOk } from '../../utils/respuesta';
import { datosBody } from '../../middlewares/validar';
import { usuarioActual } from '../../middlewares/autenticacion';
import * as servicio from './auth.service';
import type {
  EntradaLogin,
  EntradaRefresh,
  EntradaCambiarPassword,
} from './auth.schemas';

function contextoDe(req: Request): { ip?: string; userAgent?: string } {
  return { ip: req.ip, userAgent: req.header('User-Agent') ?? undefined };
}

export async function postLogin(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const entrada = datosBody<EntradaLogin>(req);
    const resultado = await servicio.login(entrada, contextoDe(req));
    enviarOk(res, resultado);
  } catch (error) {
    next(error);
  }
}

export async function postRefresh(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { refreshToken } = datosBody<EntradaRefresh>(req);
    const resultado = await servicio.refrescar(refreshToken, contextoDe(req));
    enviarOk(res, resultado);
  } catch (error) {
    next(error);
  }
}

export async function postLogout(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { refreshToken } = datosBody<EntradaRefresh>(req);
    await servicio.logout(refreshToken);
    enviarOk(res, { mensaje: 'Sesion cerrada' });
  } catch (error) {
    next(error);
  }
}

export async function getMe(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const datos = await servicio.perfil(usuarioActual(req));
    enviarOk(res, datos);
  } catch (error) {
    next(error);
  }
}

export async function postCambiarPassword(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { passwordActual, passwordNueva } = datosBody<EntradaCambiarPassword>(req);
    await servicio.cambiarPassword(usuarioActual(req).id, passwordActual, passwordNueva);
    enviarOk(res, { mensaje: 'Contrasena actualizada' });
  } catch (error) {
    next(error);
  }
}
