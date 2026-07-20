import { crear, obtener } from './axios';
import { authStore } from '@/store/authStore';
import type { RespuestaLogin, RespuestaSesion, Usuario } from './tipos';

/**
 * Llamadas de autenticacion. Viven aparte del store para que `authStore` no
 * dependa de axios y `axios` pueda leer los tokens sin ciclo de importacion.
 */

export interface Credenciales {
  identificador: string;
  password: string;
}

/**
 * POST /auth/login + GET /auth/me.
 * El login emite los tokens; /me trae los permisos vigentes del rol.
 */
export async function iniciarSesion(credenciales: Credenciales): Promise<RespuestaSesion> {
  const login = await crear<RespuestaLogin>('/auth/login', credenciales);

  // Guarda los tokens antes de /me para que el interceptor pueda autenticarlo.
  authStore.establecerSesion({
    usuario: login.usuario,
    token: login.accessToken,
    refreshToken: login.refreshToken,
    permisos: [],
    expiraEn: login.expiraEn,
  });

  const me = await obtener<{ usuario: Usuario; permisos: string[] }>('/auth/me');

  const sesion: RespuestaSesion = {
    usuario: me.usuario,
    token: login.accessToken,
    refreshToken: login.refreshToken,
    permisos: me.permisos,
    expiraEn: login.expiraEn,
  };
  authStore.establecerSesion(sesion);
  return sesion;
}

/** POST /auth/logout — revoca el refresh token. Limpia el estado local siempre. */
export async function cerrarSesion(): Promise<void> {
  const refreshToken = authStore.obtenerRefreshToken();
  try {
    if (refreshToken) await crear<null>('/auth/logout', { refreshToken });
  } catch {
    // Un logout que falla en el servidor no debe dejar al usuario atrapado.
  } finally {
    authStore.cerrarSesion();
  }
}

/** POST /auth/cambiar-password */
export async function cambiarPassword(datos: {
  passwordActual: string;
  passwordNueva: string;
}): Promise<void> {
  await crear<null>('/auth/cambiar-password', datos);
}

/** GET /auth/me — revalida la sesion y refresca permisos. */
export async function obtenerSesionActual(): Promise<{ usuario: Usuario; permisos: string[] }> {
  return obtener<{ usuario: Usuario; permisos: string[] }>('/auth/me');
}
