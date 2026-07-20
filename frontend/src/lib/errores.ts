import type { ErrorPayload } from './tipos';

/**
 * Error normalizado de la API. Todo fallo que salga del cliente axios es una
 * instancia de esta clase, venga del backend, de la red o de un timeout,
 * para que las pantallas nunca tengan que inspeccionar AxiosError.
 */
export class ErrorApi extends Error {
  readonly codigo: string;
  readonly detalles: unknown;
  readonly estadoHttp: number;
  readonly requestId: string | null;

  constructor(params: {
    codigo: string;
    mensaje: string;
    detalles?: unknown;
    estadoHttp?: number;
    requestId?: string | null;
  }) {
    super(params.mensaje);
    this.name = 'ErrorApi';
    this.codigo = params.codigo;
    this.detalles = params.detalles ?? null;
    this.estadoHttp = params.estadoHttp ?? 0;
    this.requestId = params.requestId ?? null;
    Object.setPrototypeOf(this, ErrorApi.prototype);
  }

  static desdePayload(
    payload: ErrorPayload,
    estadoHttp: number,
    requestId?: string | null,
  ): ErrorApi {
    return new ErrorApi({
      codigo: payload.codigo,
      mensaje: payload.mensaje,
      detalles: payload.detalles,
      estadoHttp,
      requestId: requestId ?? null,
    });
  }

  /** Errores de validacion (400) traen detalles por campo. */
  get esValidacion(): boolean {
    return this.estadoHttp === 400 || this.codigo === 'VALIDACION';
  }

  get esSinPermiso(): boolean {
    return this.estadoHttp === 403;
  }

  get esConflictoDeNegocio(): boolean {
    return this.estadoHttp === 409;
  }

  get esDeRed(): boolean {
    return this.codigo === 'SIN_CONEXION' || this.codigo === 'TIEMPO_AGOTADO';
  }

  /**
   * Errores de validacion por campo, si el backend los envio como
   * detalles: [{ campo, mensaje }] o { campo: mensaje }.
   */
  erroresPorCampo(): Record<string, string> {
    const salida: Record<string, string> = {};
    const d = this.detalles;
    if (Array.isArray(d)) {
      for (const item of d) {
        if (item && typeof item === 'object') {
          const obj = item as Record<string, unknown>;
          const campo = typeof obj['campo'] === 'string' ? obj['campo'] : null;
          const mensaje = typeof obj['mensaje'] === 'string' ? obj['mensaje'] : null;
          if (campo && mensaje) salida[campo] = mensaje;
        }
      }
    } else if (d && typeof d === 'object') {
      for (const [campo, valor] of Object.entries(d as Record<string, unknown>)) {
        if (typeof valor === 'string') salida[campo] = valor;
      }
    }
    return salida;
  }
}

/** Codigos de error de dominio estables que la interfaz trata de forma especial. */
export const CODIGOS_ERROR = {
  sinConexion: 'SIN_CONEXION',
  tiempoAgotado: 'TIEMPO_AGOTADO',
  noAutenticado: 'NO_AUTENTICADO',
  sesionExpirada: 'SESION_EXPIRADA',
  sinPermiso: 'SIN_PERMISO',
  noEncontrado: 'NO_ENCONTRADO',
  validacion: 'VALIDACION',
  stockInsuficiente: 'STOCK_INSUFICIENTE',
  cupoExcedido: 'CUPO_EXCEDIDO',
  turnoCerrado: 'TURNO_CERRADO',
  enProceso: 'EN_PROCESO',
  idempotencyKeyReuse: 'IDEMPOTENCY_KEY_REUSE',
  limiteSolicitudes: 'LIMITE_SOLICITUDES',
  errorInterno: 'ERROR_INTERNO',
} as const;

/** Convierte cualquier excepcion en un mensaje presentable. */
export function mensajeDeError(error: unknown): string {
  if (error instanceof ErrorApi) return error.message;
  if (error instanceof Error) return error.message;
  return 'Ocurrio un error inesperado.';
}
