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
    case '40001': // serialization_failure
    case '40P01': // deadlock_detected
      return new Conflicto('CONFLICTO_CONCURRENCIA', { causa: error });
    case '55P03': // lock_not_available
    case '57014': // query_canceled (statement_timeout)
      return new Conflicto('TIEMPO_BLOQUEO_AGOTADO', { causa: error });
    case '23514': // check_violation
    case '23502': // not_null_violation
    case '22P02': // invalid_text_representation (p.ej. texto donde se esperaba numero)
    case '22007': // invalid_datetime_format
      return new ReglaNegocio('DATOS_INVALIDOS', { causa: error });
    default:
      return null;
  }
}

/**
 * Extrae los campos de diagnostico de un error del driver (o Error normal) para
 * exponer la causa real al cliente. Se usa SOLO en fallos no previstos (500), para
 * que el operador vea "el porque" en pantalla y no un generico "error inesperado".
 * Nota: puede incluir fragmentos de SQL; es intencional para depurar este POS.
 */
function diagnosticoError(err: unknown): Record<string, unknown> | undefined {
  const e = err as {
    message?: string; code?: string; detail?: string; constraint?: string;
    table?: string; column?: string; hint?: string; where?: string;
  } | null;
  if (!e) return undefined;
  const d: Record<string, unknown> = {};
  if (typeof e.message === 'string' && e.message) d.causa = e.message;
  if (typeof e.code === 'string' && e.code) d.sqlstate = e.code;
  if (typeof e.detail === 'string' && e.detail) d.detalle = e.detail;
  if (typeof e.constraint === 'string' && e.constraint) d.restriccion = e.constraint;
  if (typeof e.table === 'string' && e.table) d.tabla = e.table;
  if (typeof e.column === 'string' && e.column) d.columna = e.column;
  if (typeof e.hint === 'string' && e.hint) d.pista = e.hint;
  return Object.keys(d).length > 0 ? d : undefined;
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
