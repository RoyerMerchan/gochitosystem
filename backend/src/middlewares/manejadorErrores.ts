/**
 * Manejador global de errores de Express 5.
 *
 * Traduce los errores de MariaDB a errores de negocio comprensibles y garantiza
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

// Codigos de error de MariaDB relevantes.
const ER_DUP_ENTRY = 1062;
const ER_NO_REFERENCED_ROW = 1452;
const ER_ROW_IS_REFERENCED = 1451;
const ER_LOCK_DEADLOCK = 1213;
const ER_LOCK_WAIT_TIMEOUT = 1205;
const ER_CHECK_CONSTRAINT = 4025;
const ER_BAD_NULL = 1048;

/** Convierte un error de driver de MariaDB en un AppError del dominio. */
function traducirErrorMariaDB(error: unknown): AppError | null {
  const errno = (error as { errno?: number } | null)?.errno;
  if (errno === undefined) return null;

  switch (errno) {
    case ER_DUP_ENTRY:
      return new Conflicto('REGISTRO_DUPLICADO', { causa: error });
    case ER_NO_REFERENCED_ROW:
      return new ReglaNegocio('REFERENCIA_INEXISTENTE', { causa: error });
    case ER_ROW_IS_REFERENCED:
      return new Conflicto('REFERENCIA_EN_USO', { causa: error });
    case ER_LOCK_DEADLOCK:
      return new Conflicto('CONFLICTO_CONCURRENCIA', { causa: error });
    case ER_LOCK_WAIT_TIMEOUT:
      return new Conflicto('TIEMPO_BLOQUEO_AGOTADO', { causa: error });
    case ER_CHECK_CONSTRAINT:
    case ER_BAD_NULL:
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
    appError = traducirErrorMariaDB(err) ?? new ErrorInterno({ causa: err });
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
