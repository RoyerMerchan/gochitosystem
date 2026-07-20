/**
 * Tipos del contrato de API (alineados al backend real de GochitoSystem).
 * Respuesta de exito { ok: true, datos, meta? }; error { ok:false, error }.
 */

export interface MetaPaginacion {
  pagina: number;
  limite: number;
  total: number;
  totalPaginas: number;
}

export interface RespuestaOk<T> {
  ok: true;
  datos: T;
  data?: T; // alias tolerado
  meta?: MetaPaginacion;
}

export interface ErrorPayload {
  codigo: string;
  mensaje: string;
  detalles?: unknown;
}

export interface RespuestaError {
  ok: false;
  error: ErrorPayload;
}

export type RespuestaApi<T> = RespuestaOk<T> | RespuestaError;

export interface Paginado<T> {
  datos: T[];
  meta: MetaPaginacion;
}

/** Usuario autenticado, tal como lo devuelve /auth/login y /auth/me. */
export interface Usuario {
  id: number;
  usuario: string;
  nombreCompleto: string;
  rolId: number;
  rolCodigo: string;
  sucursalId: number;
  debeCambiarPassword: boolean;
}

/** Respuesta de POST /auth/login. */
export interface RespuestaLogin {
  usuario: Usuario;
  accessToken: string;
  refreshToken: string;
  expiraEn?: string;
}

/** Sesion completa que se guarda en el store (login + permisos de /auth/me). */
export interface RespuestaSesion {
  usuario: Usuario;
  token: string;
  refreshToken: string;
  permisos: string[];
  expiraEn?: string;
}

/** Tasa de cambio vigente (USD -> Bs). */
export interface TasaCambio {
  id: number;
  fecha: string;
  tasa: string;
}

/** Producto tal como lo lista el backend (precios en USD + equivalente en Bs). */
export interface Producto {
  id: number;
  sku: string;
  nombre: string;
  categoria_id: number;
  categoria_nombre: string;
  unidad_codigo: string;
  impuesto_id: number;
  impuesto_tasa: string;
  precio_venta: string;
  precio_venta_bs?: string;
  costo_promedio: string;
  es_precio_incluye_impuesto: number;
  es_pesable: number;
  es_favorito_pos: number;
  imagen_ruta: string | null;
  cantidad: string;
  stock_minimo: string;
  esta_activo: number;
}

export interface ParametrosListado {
  pagina?: number;
  limite?: number;
  busqueda?: string;
  categoriaId?: number;
  soloActivos?: boolean;
  stockBajo?: boolean;
  favoritos?: boolean;
}

export type Moneda = 'USD' | 'VES';

export type DireccionOrden = 'asc' | 'desc';
