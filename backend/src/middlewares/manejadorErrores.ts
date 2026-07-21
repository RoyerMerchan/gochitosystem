/**
 * Manejador global de errores de Express 5.
 *
 * Traduce los errores de PostgreSQL a errores de negocio comprensibles y garantiza
 * que NUNCA se filtre al cliente un stack, un mensaje de SQL ni una ruta interna.
 * Todo lo que no sea AppError se registra completo en el log y se responde como
 * ERROR_INTERNO generico.
 */
import type { ErrorRequestHandler, RequestHandler } from 'express';
import {
  AppError,
  Conflicto,
  ErrorInterno,
  ReglaNegocio,
  esAppError,
} from '../errores/AppError';
import { enviarFallo } from '../utils/respuesta';
import { logger, describirError } from '../utils/logger';

/** Convierte un error del driver de PostgreSQL en un AppError del dominio. */
function traducirErrorPG(error: unknown): AppError | null {
  const code = (error as { code?: string } | null)?.code;
  if (code === undefined) return null;

  switch (code) {
    case '23505':
      return new Conflicto('REGISTRO_DUPLICADO', { causa: error });
    case '23503':
      return new ReglaNegocio('REFERENCIA_INEXISTENTE', { causa: error });
    case '40001':
      return new Conflicto('CONFLICTO_CONCURRENCIA', { causa: error });
    case '55P03':
      return new Conflicto('TIEMPO_BLOQUEO_AGOTADO', { causa: error });
    case '23514':
    case '23502':
      return new ReglaNegocio('DATOS_INVALIDOS', { causa: error });
    default:
      return null;
  }
}

/** 404 para cualquier ruta no registrada. Va antes del manejador de errores. */
export const rutaNoEncontrada: RequestHandler = (_req, _res, next) => {
  next(new AppError('RUTA_NO_ENCONTRADA'));
};

/** Manejador de errores. DEBE registrarse el ultimo, con los 4 parametros. */
export const manejadorErrores: ErrorRequestHandler = (err, req, res, _next) => {
  // JSON mal formado de express.json().
  if (err instanceof SyntaxError && 'body' in err) {
    const e = new AppError('JSON_MAL_FORMADO');
    enviarFallo(res, e);
    return;
  }

  let appError: AppError;
  if (esAppError(err)) {
    appError = err;
  } else {
    appError = traducirErrorPG(err) ?? new ErrorInterno({ causa: err });
  }

  // Log: los 5xx y los fallos no operacionales van como error; el resto como warn.
  const datos = {
    codigo: appError.codigo,
    httpStatus: appError.httpStatus,
    ruta: `${req.method} ${req.originalUrl}`,
    ...describirError(appError.causa ?? err),
  };
  if (appError.httpStatus >= 500 || !appError.esOperacional) {
    logger.error('Error no controlado en la solicitud', datos);
  } else {
    logger.warn('Error de negocio', datos);
  }

  enviarFallo(res, appError);
};
