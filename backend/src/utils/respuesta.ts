/**
 * Constructores de la respuesta HTTP.
 *
 * Formato acordado en el contrato canonico (seccion convenciones.api):
 *   exito -> { ok: true, datos, meta? }
 *   error -> { ok: false, error: { codigo, mensaje, detalles? } }
 *
 * Ningun controller debe construir estos objetos a mano.
 */
import type { Response } from 'express';
import type { AppError } from '../errores/AppError';
import type {
  MetaPaginacion,
  RespuestaError,
  RespuestaExito,
} from '../tipos/comunes';

/** Construye el cuerpo de una respuesta de exito. */
export function ok<T>(
  datos: T,
  meta?: MetaPaginacion | Record<string, unknown>,
): RespuestaExito<T> {
  return meta === undefined ? { ok: true, datos } : { ok: true, datos, meta };
}

/** Construye el cuerpo de una respuesta de error a partir de un AppError. */
export function fallo(error: AppError): RespuestaError {
  return { ok: false, error: error.aRespuesta() };
}

/** Envia 200 con los datos. */
export function enviarOk<T>(
  res: Response,
  datos: T,
  meta?: MetaPaginacion | Record<string, unknown>,
): Response {
  return res.status(200).json(ok(datos, meta));
}

/** Envia 201 con el recurso creado. */
export function enviarCreado<T>(res: Response, datos: T): Response {
  return res.status(201).json(ok(datos));
}

/** Envia 202 para trabajos encolados (exportaciones PDF/Excel). */
export function enviarEncolado<T>(res: Response, datos: T): Response {
  return res.status(202).json(ok(datos));
}

/** Envia 204 sin cuerpo. */
export function enviarSinContenido(res: Response): Response {
  return res.status(204).send();
}

/** Envia un error ya tipado. */
export function enviarFallo(res: Response, error: AppError): Response {
  return res.status(error.httpStatus).json(fallo(error));
}
