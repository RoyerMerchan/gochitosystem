import axios, {
  AxiosError,
  type AxiosInstance,
  type AxiosRequestConfig,
  type InternalAxiosRequestConfig,
} from 'axios';
import { authStore } from '@/store/authStore';
import { ErrorApi, CODIGOS_ERROR } from './errores';
import type { MetaPaginacion, Paginado, RespuestaApi } from './tipos';

/** En desarrollo el proxy de Vite reenvia /api al backend en el puerto 4000. */
export const URL_API = import.meta.env.VITE_API_URL || '/api/v1';

/** Rutas que NO deben disparar el ciclo de refresco al responder 401. */
const RUTAS_SIN_REFRESCO = ['/auth/login', '/auth/refresh', '/auth/logout'];

/** POST que exigen Idempotency-Key segun el contrato canonico. */
const RUTAS_IDEMPOTENTES = ['/ventas', '/compras', '/abonos', '/pos/ventas', '/devoluciones'];

interface ConfigConReintento extends InternalAxiosRequestConfig {
  /** Marca interna para reintentar una sola vez tras refrescar el token. */
  _yaReintentado?: boolean;
}

function generarUuid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  // Respaldo para navegadores sin crypto.randomUUID.
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/* ------------------------------------------------------------------ */
/* Instancia principal                                                 */
/* ------------------------------------------------------------------ */

export const api: AxiosInstance = axios.create({
  baseURL: URL_API,
  timeout: 20000,
  headers: { 'Content-Type': 'application/json' },
});

/**
 * Instancia limpia, sin interceptores, exclusiva para refrescar el token.
 * Si usara `api` entraria en recursion infinita al recibir otro 401.
 */
const apiSinInterceptores: AxiosInstance = axios.create({
  baseURL: URL_API,
  timeout: 20000,
  headers: { 'Content-Type': 'application/json' },
});

/* ------------------------------------------------------------------ */
/* Interceptor de peticion: token, trazabilidad e idempotencia         */
/* ------------------------------------------------------------------ */

api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = authStore.obtenerToken();
  if (token) {
    config.headers.set('Authorization', `Bearer ${token}`);
  }

  // X-Request-Id: el backend lo propaga y lo devuelve para correlacionar logs.
  if (!config.headers.get('X-Request-Id')) {
    config.headers.set('X-Request-Id', generarUuid());
  }

  // Idempotency-Key en los POST con consecuencia economica.
  const metodo = (config.method ?? 'get').toLowerCase();
  const url = config.url ?? '';
  if (
    metodo === 'post' &&
    !config.headers.get('Idempotency-Key') &&
    RUTAS_IDEMPOTENTES.some((ruta) => url.startsWith(ruta))
  ) {
    config.headers.set('Idempotency-Key', generarUuid());
  }

  return config;
});

/* ------------------------------------------------------------------ */
/* Refresco de token: una sola peticion en vuelo, el resto hace cola   */
/* ------------------------------------------------------------------ */

let refrescoEnCurso: Promise<string> | null = null;

async function refrescarToken(): Promise<string> {
  const refreshToken = authStore.obtenerRefreshToken();
  if (!refreshToken) {
    throw new ErrorApi({
      codigo: CODIGOS_ERROR.sesionExpirada,
      mensaje: 'La sesion expiro. Vuelve a iniciar sesion.',
      estadoHttp: 401,
    });
  }

  const respuesta = await apiSinInterceptores.post<
    RespuestaApi<{ accessToken: string; refreshToken: string }>
  >('/auth/refresh', { refreshToken });

  const cuerpo = respuesta.data;
  if (!cuerpo.ok) {
    throw ErrorApi.desdePayload(cuerpo.error, respuesta.status);
  }

  const datos = cuerpo.datos ?? cuerpo.data;
  if (!datos?.accessToken) {
    throw new ErrorApi({
      codigo: CODIGOS_ERROR.sesionExpirada,
      mensaje: 'No se pudo renovar la sesion.',
      estadoHttp: 401,
    });
  }

  // El refresh token es rotativo: el backend devuelve uno nuevo en cada canje.
  authStore.actualizarTokens(datos.accessToken, datos.refreshToken);
  return datos.accessToken;
}

/** Garantiza que solo exista un refresco simultaneo. */
function obtenerRefrescoCompartido(): Promise<string> {
  if (!refrescoEnCurso) {
    refrescoEnCurso = refrescarToken().finally(() => {
      refrescoEnCurso = null;
    });
  }
  return refrescoEnCurso;
}

/** Cierra la sesion local y lleva al login conservando el destino. */
function forzarCierreDeSesion(): void {
  authStore.cerrarSesion();
  const rutaActual = window.location.pathname + window.location.search;
  if (!window.location.pathname.startsWith('/login')) {
    window.location.assign(`/login?redirigir=${encodeURIComponent(rutaActual)}`);
  }
}

/* ------------------------------------------------------------------ */
/* Interceptor de respuesta: refresco + normalizacion a ErrorApi       */
/* ------------------------------------------------------------------ */

api.interceptors.response.use(
  (respuesta) => respuesta,
  async (error: unknown) => {
    if (!axios.isAxiosError(error)) {
      return Promise.reject(
        new ErrorApi({
          codigo: CODIGOS_ERROR.errorInterno,
          mensaje: error instanceof Error ? error.message : 'Error inesperado.',
        }),
      );
    }

    const err = error as AxiosError<RespuestaApi<unknown>>;
    const config = err.config as ConfigConReintento | undefined;
    const estado = err.response?.status ?? 0;
    const requestId = (err.response?.headers?.['x-request-id'] as string | undefined) ?? null;

    // --- Sin respuesta: red caida o timeout -------------------------
    if (!err.response) {
      const esTimeout = err.code === 'ECONNABORTED' || err.code === 'ETIMEDOUT';
      return Promise.reject(
        new ErrorApi({
          codigo: esTimeout ? CODIGOS_ERROR.tiempoAgotado : CODIGOS_ERROR.sinConexion,
          mensaje: esTimeout
            ? 'El servidor tardo demasiado en responder.'
            : 'No hay conexion con el servidor. Revisa tu red.',
          estadoHttp: 0,
          requestId,
        }),
      );
    }

    // --- 401: refrescar el token y reintentar UNA sola vez -----------
    const rutaLlamada = config?.url ?? '';
    const esRutaDeAuth = RUTAS_SIN_REFRESCO.some((ruta) => rutaLlamada.startsWith(ruta));

    if (estado === 401 && config && !config._yaReintentado && !esRutaDeAuth) {
      config._yaReintentado = true;
      try {
        const tokenNuevo = await obtenerRefrescoCompartido();
        config.headers.set('Authorization', `Bearer ${tokenNuevo}`);
        return await api.request(config);
      } catch {
        forzarCierreDeSesion();
        return Promise.reject(
          new ErrorApi({
            codigo: CODIGOS_ERROR.sesionExpirada,
            mensaje: 'Tu sesion expiro. Inicia sesion nuevamente.',
            estadoHttp: 401,
            requestId,
          }),
        );
      }
    }

    // 401 que ya se reintento (o venia de /auth): la sesion no es recuperable.
    if (estado === 401 && !esRutaDeAuth) {
      forzarCierreDeSesion();
    }

    // --- Error con cuerpo del contrato ------------------------------
    const cuerpo = err.response.data;
    if (cuerpo && typeof cuerpo === 'object' && 'error' in cuerpo && cuerpo.ok === false) {
      return Promise.reject(ErrorApi.desdePayload(cuerpo.error, estado, requestId));
    }

    // --- Error HTTP sin cuerpo esperado -----------------------------
    return Promise.reject(
      new ErrorApi({
        codigo: mapearEstadoACodigo(estado),
        mensaje: mensajePorDefecto(estado),
        estadoHttp: estado,
        requestId,
      }),
    );
  },
);

function mapearEstadoACodigo(estado: number): string {
  switch (estado) {
    case 400:
      return CODIGOS_ERROR.validacion;
    case 401:
      return CODIGOS_ERROR.noAutenticado;
    case 403:
      return CODIGOS_ERROR.sinPermiso;
    case 404:
      return CODIGOS_ERROR.noEncontrado;
    case 422:
      return CODIGOS_ERROR.idempotencyKeyReuse;
    case 429:
      return CODIGOS_ERROR.limiteSolicitudes;
    default:
      return CODIGOS_ERROR.errorInterno;
  }
}

function mensajePorDefecto(estado: number): string {
  switch (estado) {
    case 400:
      return 'Los datos enviados no son validos.';
    case 401:
      return 'Debes iniciar sesion.';
    case 403:
      return 'No tienes permiso para realizar esta accion.';
    case 404:
      return 'No se encontro el recurso solicitado.';
    case 409:
      return 'La operacion entra en conflicto con el estado actual.';
    case 422:
      return 'Esta operacion ya fue procesada.';
    case 429:
      return 'Demasiadas solicitudes. Espera un momento.';
    default:
      return 'Ocurrio un error en el servidor.';
  }
}

/* ------------------------------------------------------------------ */
/* Ayudantes tipados: desempacan el sobre { ok, datos, meta }          */
/* ------------------------------------------------------------------ */

function desempacar<T>(cuerpo: RespuestaApi<T>, estado: number): T {
  if (!cuerpo.ok) throw ErrorApi.desdePayload(cuerpo.error, estado);
  const datos = (cuerpo.datos ?? cuerpo.data) as T | undefined;
  if (datos === undefined) {
    throw new ErrorApi({
      codigo: CODIGOS_ERROR.errorInterno,
      mensaje: 'La respuesta del servidor no trae datos.',
      estadoHttp: estado,
    });
  }
  return datos;
}

export async function obtener<T>(url: string, config?: AxiosRequestConfig): Promise<T> {
  const r = await api.get<RespuestaApi<T>>(url, config);
  return desempacar(r.data, r.status);
}

export async function crear<T>(
  url: string,
  cuerpo?: unknown,
  config?: AxiosRequestConfig,
): Promise<T> {
  const r = await api.post<RespuestaApi<T>>(url, cuerpo, config);
  return desempacar(r.data, r.status);
}

export async function reemplazar<T>(
  url: string,
  cuerpo?: unknown,
  config?: AxiosRequestConfig,
): Promise<T> {
  const r = await api.put<RespuestaApi<T>>(url, cuerpo, config);
  return desempacar(r.data, r.status);
}

export async function modificar<T>(
  url: string,
  cuerpo?: unknown,
  config?: AxiosRequestConfig,
): Promise<T> {
  const r = await api.patch<RespuestaApi<T>>(url, cuerpo, config);
  return desempacar(r.data, r.status);
}

export async function eliminar<T = void>(url: string, config?: AxiosRequestConfig): Promise<T> {
  const r = await api.delete<RespuestaApi<T>>(url, config);
  return desempacar(r.data, r.status);
}

const META_VACIA: MetaPaginacion = { pagina: 1, limite: 0, total: 0, totalPaginas: 0 };

/** GET de un listado paginado: devuelve { datos, meta } ya desempacado. */
export async function obtenerPaginado<T>(
  url: string,
  config?: AxiosRequestConfig,
): Promise<Paginado<T>> {
  const r = await api.get<RespuestaApi<T[]>>(url, config);
  const datos = desempacar(r.data, r.status);
  const meta = r.data.ok ? (r.data.meta ?? META_VACIA) : META_VACIA;
  return { datos, meta };
}

/** Descarga un archivo binario (PDF/Excel ya generado). */
export async function descargar(url: string, config?: AxiosRequestConfig): Promise<Blob> {
  const r = await api.get<Blob>(url, { ...config, responseType: 'blob' });
  return r.data;
}

export { generarUuid };
export default api;
