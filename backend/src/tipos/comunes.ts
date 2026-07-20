/** Tipos compartidos por todas las capas del backend. */
import type { CodigoError } from '../errores/codigos';

/** Identificador de fila: BIGINT UNSIGNED en MariaDB, `number` en JS. */
export type Id = number;

/**
 * Valor monetario tal como lo devuelve mysql2 para una columna DECIMAL: STRING.
 * Nunca se convierte a `number` para operar; se usa `utils/dinero`.
 */
export type DecimalSql = string;

/** Metadatos de paginacion devueltos por la API. */
export interface MetaPaginacion {
  readonly pagina: number;
  readonly limite: number;
  readonly total: number;
  readonly totalPaginas: number;
}

/** Respuesta de exito de la API. */
export interface RespuestaExito<T> {
  readonly ok: true;
  readonly datos: T;
  readonly meta?: MetaPaginacion | Record<string, unknown>;
}

/** Respuesta de error de la API. */
export interface RespuestaError {
  readonly ok: false;
  readonly error: {
    readonly codigo: CodigoError;
    readonly mensaje: string;
    readonly detalles?: unknown;
  };
}

export type Respuesta<T> = RespuestaExito<T> | RespuestaError;

/** Resultado paginado que devuelven los repositorios. */
export interface ResultadoPaginado<T> {
  readonly datos: readonly T[];
  readonly total: number;
}

/** Parametros de paginacion ya normalizados (pagina/limite validados). */
export interface ParametrosPaginacion {
  readonly pagina: number;
  readonly limite: number;
  readonly desplazamiento: number;
}

/**
 * Usuario autenticado que viaja en `req.usuario`.
 * El JWT NO lleva permisos embebidos (ADR-010): se resuelven contra la base.
 */
export interface UsuarioAutenticado {
  readonly id: Id;
  readonly usuario: string;
  readonly nombreCompleto: string;
  readonly rolId: Id;
  readonly rolCodigo: string;
  readonly sucursalId: Id;
  readonly debeCambiarPassword: boolean;
}

/** Contenido del access token JWT. */
export interface PayloadJwt {
  /** subject = usuarios.id */
  readonly sub: string;
  readonly usuario: string;
  readonly sucursalId: Id;
  /** Identificador de la sesion que emitio el token. */
  readonly sid?: string;
  readonly iat?: number;
  readonly exp?: number;
}

/** Contexto de la solicitud en curso, disponible para logs y auditoria. */
export interface ContextoSolicitud {
  readonly requestId: string;
  readonly usuarioId?: Id;
  readonly sucursalId?: Id;
  readonly ip?: string;
}

/** Vuelve opcionales las claves indicadas de T. */
export type OpcionalEn<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;
