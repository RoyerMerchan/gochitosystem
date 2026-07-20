/**
 * Jerarquia de errores de la aplicacion.
 *
 * Todo error que llegue al cliente pasa por aqui. Un error que NO sea AppError se
 * considera un fallo no previsto y el manejador global lo convierte en
 * ERROR_INTERNO sin filtrar su mensaje al cliente (puede contener SQL o rutas).
 */
import { CODIGOS_ERROR, type CodigoError } from './codigos';

/** Detalle por campo devuelto en los errores de validacion. */
export interface DetalleError {
  readonly campo: string;
  readonly mensaje: string;
}

export type DetallesError = readonly DetalleError[] | Record<string, unknown>;

export interface OpcionesAppError {
  /** Mensaje que reemplaza al del catalogo (para contexto concreto). */
  readonly mensaje?: string;
  /** Detalle adicional: errores por campo, ids involucrados, etc. */
  readonly detalles?: DetallesError;
  /** Error original, se registra en el log pero NUNCA se envia al cliente. */
  readonly causa?: unknown;
  /** Fuerza un HTTP status distinto al del catalogo. */
  readonly httpStatus?: number;
}

export class AppError extends Error {
  public readonly codigo: CodigoError;
  public readonly httpStatus: number;
  public readonly detalles?: DetallesError;
  public readonly causa?: unknown;
  /** true = error esperado del dominio; false = fallo no previsto. */
  public readonly esOperacional: boolean = true;

  constructor(codigo: CodigoError, opciones: OpcionesAppError = {}) {
    const definicion = CODIGOS_ERROR[codigo] ?? CODIGOS_ERROR.ERROR_INTERNO;
    super(opciones.mensaje ?? definicion.mensaje);

    this.name = new.target.name;
    this.codigo = codigo;
    this.httpStatus = opciones.httpStatus ?? definicion.httpStatus;
    this.detalles = opciones.detalles;
    this.causa = opciones.causa;

    Error.captureStackTrace?.(this, new.target);
  }

  /** Serializacion segura para la respuesta HTTP (nunca incluye `causa`). */
  public aRespuesta(): {
    codigo: CodigoError;
    mensaje: string;
    detalles?: DetallesError;
  } {
    return this.detalles === undefined
      ? { codigo: this.codigo, mensaje: this.message }
      : { codigo: this.codigo, mensaje: this.message, detalles: this.detalles };
  }
}

/** 422 — El cuerpo, query o params no pasaron la validacion de Zod. */
export class ErrorValidacion extends AppError {
  constructor(opciones: OpcionesAppError = {}) {
    super('DATOS_INVALIDOS', { httpStatus: 422, ...opciones });
  }

  /** Variante con un codigo mas especifico del catalogo. */
  static conCodigo(codigo: CodigoError, opciones: OpcionesAppError = {}): AppError {
    return new AppError(codigo, { httpStatus: 422, ...opciones });
  }
}

/** 401 — Falta el token, esta vencido o no es valido. */
export class NoAutenticado extends AppError {
  constructor(codigo: CodigoError = 'TOKEN_AUSENTE', opciones: OpcionesAppError = {}) {
    super(codigo, { httpStatus: 401, ...opciones });
  }
}

/** 403 — Hay identidad, pero no permiso para esta operacion. */
export class NoAutorizado extends AppError {
  constructor(codigo: CodigoError = 'PERMISO_DENEGADO', opciones: OpcionesAppError = {}) {
    super(codigo, { httpStatus: 403, ...opciones });
  }
}

/** 404 — El recurso no existe o fue eliminado logicamente. */
export class NoEncontrado extends AppError {
  constructor(codigo: CodigoError = 'NO_ENCONTRADO', opciones: OpcionesAppError = {}) {
    super(codigo, { httpStatus: 404, ...opciones });
  }
}

/** 409 — Conflicto de estado: duplicado, concurrencia, documento ya anulado. */
export class Conflicto extends AppError {
  constructor(
    codigo: CodigoError = 'REGISTRO_DUPLICADO',
    opciones: OpcionesAppError = {},
  ) {
    super(codigo, { httpStatus: 409, ...opciones });
  }
}

/**
 * 422 — Regla de negocio violada.
 *
 * Nota: algunas reglas del contrato responden 409 y no 422 (STOCK_INSUFICIENTE,
 * CUPO_CREDITO_EXCEDIDO, CAJA_NO_ABIERTA). Por eso NO se fuerza el status: se
 * respeta el que declara el catalogo para ese codigo.
 */
export class ReglaNegocio extends AppError {
  constructor(codigo: CodigoError = 'REGLA_NEGOCIO', opciones: OpcionesAppError = {}) {
    super(codigo, opciones);
  }
}

/** 500 — Fallo no previsto. El mensaje real nunca se envia al cliente. */
export class ErrorInterno extends AppError {
  public override readonly esOperacional = false;

  constructor(opciones: OpcionesAppError = {}) {
    super('ERROR_INTERNO', { httpStatus: 500, ...opciones });
  }
}

/** Type guard para distinguir errores del dominio de fallos inesperados. */
export function esAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}
