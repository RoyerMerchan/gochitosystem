/**
 * Validacion de entrada con Zod.
 *
 * OJO Express 5: `req.query` y `req.params` son getters de solo lectura; asignarlos
 * lanza TypeError. Por eso los valores ya parseados se dejan en `req.datosValidados`
 * y se leen con los helpers `datosBody` / `datosQuery` / `datosParams`.
 * `req.body` si es asignable, y se reemplaza por la version parseada de Zod
 * (con sus coerciones y valores por defecto aplicados).
 */
import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { z, type ZodTypeAny } from 'zod';
import { ErrorValidacion, type DetalleError } from '../errores/AppError';

export interface EsquemasValidacion {
  readonly body?: ZodTypeAny;
  readonly query?: ZodTypeAny;
  readonly params?: ZodTypeAny;
}

/** Traduce los issues de Zod al detalle por campo que espera el frontend. */
function aDetalles(error: z.ZodError, origen: string): DetalleError[] {
  return error.issues.map((issue) => ({
    campo: issue.path.length > 0 ? issue.path.join('.') : origen,
    mensaje: issue.message,
  }));
}

/**
 * Middleware que valida body, query y params contra los esquemas indicados.
 * Acumula los errores de las tres fuentes en una sola respuesta 422.
 */
export function validar(esquemas: EsquemasValidacion): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const detalles: DetalleError[] = [];
    const validados: { body?: unknown; query?: unknown; params?: unknown } = {};

    if (esquemas.params) {
      const r = esquemas.params.safeParse(req.params);
      if (r.success) validados.params = r.data;
      else detalles.push(...aDetalles(r.error, 'params'));
    }

    if (esquemas.query) {
      const r = esquemas.query.safeParse(req.query);
      if (r.success) validados.query = r.data;
      else detalles.push(...aDetalles(r.error, 'query'));
    }

    if (esquemas.body) {
      const r = esquemas.body.safeParse(req.body);
      if (r.success) {
        validados.body = r.data;
        req.body = r.data;
      } else {
        detalles.push(...aDetalles(r.error, 'body'));
      }
    }

    if (detalles.length > 0) {
      next(new ErrorValidacion({ detalles }));
      return;
    }

    req.datosValidados = validados;
    next();
  };
}

/**
 * Lectores tipados de los datos validados.
 *
 * Uso en el controller:
 *   const filtros = datosQuery<z.infer<typeof esquemaListado>>(req);
 *
 * El tipo se afirma porque Zod ya garantizo la forma en el middleware; hacerlo
 * generico evita que cada controller repita el cast.
 */
export function datosBody<T>(req: Request): T {
  return req.datosValidados?.body as T;
}

export function datosQuery<T>(req: Request): T {
  return req.datosValidados?.query as T;
}

export function datosParams<T>(req: Request): T {
  return req.datosValidados?.params as T;
}

/** Esquema reutilizable para rutas con :id numerico. */
export const esquemaParamsId = z.object({
  id: z.coerce
    .number()
    .int('El id debe ser un numero entero')
    .positive('El id debe ser mayor que cero'),
});

export type ParamsId = z.infer<typeof esquemaParamsId>;
