import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { RespuestaSesion, Usuario } from '@/lib/tipos';
import {
  tieneAlgunPermiso,
  tienePermiso as evaluarPermiso,
  tieneTodosLosPermisos,
  type Permiso,
} from '@/lib/permisos';

/**
 * Estado de sesion. Es estado puro: no hace llamadas HTTP, para que el cliente
 * axios pueda leerlo y escribirlo desde sus interceptores sin dependencia
 * circular. Las llamadas de login/logout viven en src/lib/authApi.ts.
 */
interface EstadoAuth {
  usuario: Usuario | null;
  token: string | null;
  refreshToken: string | null;
  /** Set de codigos de permiso vigentes para la sucursal del contexto. */
  permisos: string[];
  sucursalActivaId: number | null;

  establecerSesion: (sesion: RespuestaSesion) => void;
  actualizarTokens: (token: string, refreshToken: string) => void;
  actualizarUsuario: (usuario: Usuario) => void;
  cambiarSucursalActiva: (sucursalId: number) => void;
  cerrarSesion: () => void;

  estaAutenticado: () => boolean;
  tienePermiso: (permiso: Permiso) => boolean;
  tieneAlguno: (permisos: readonly Permiso[]) => boolean;
  tieneTodos: (permisos: readonly Permiso[]) => boolean;
}

const ESTADO_INICIAL = {
  usuario: null,
  token: null,
  refreshToken: null,
  permisos: [] as string[],
  sucursalActivaId: null,
};

export const useAuthStore = create<EstadoAuth>()(
  persist(
    (set, get) => ({
      ...ESTADO_INICIAL,

      establecerSesion: (sesion) =>
        set({
          usuario: sesion.usuario,
          token: sesion.token,
          refreshToken: sesion.refreshToken,
          permisos: sesion.permisos,
          sucursalActivaId: sesion.usuario.sucursalId,
        }),

      actualizarTokens: (token, refreshToken) => set({ token, refreshToken }),

      actualizarUsuario: (usuario) => set({ usuario }),

      cambiarSucursalActiva: (sucursalId) => set({ sucursalActivaId: sucursalId }),

      cerrarSesion: () => set({ ...ESTADO_INICIAL }),

      estaAutenticado: () => Boolean(get().token && get().usuario),

      tienePermiso: (permiso) => evaluarPermiso(new Set(get().permisos), permiso),

      tieneAlguno: (permisos) => tieneAlgunPermiso(new Set(get().permisos), permisos),

      tieneTodos: (permisos) => tieneTodosLosPermisos(new Set(get().permisos), permisos),
    }),
    {
      name: 'gochito.auth',
      storage: createJSONStorage(() => localStorage),
      // Las funciones no se serializan; solo se persiste el estado.
      partialize: (estado) => ({
        usuario: estado.usuario,
        token: estado.token,
        refreshToken: estado.refreshToken,
        permisos: estado.permisos,
        sucursalActivaId: estado.sucursalActivaId,
      }),
      version: 1,
    },
  ),
);

/** Acceso al estado fuera de React (interceptores de axios). */
export const authStore = {
  obtenerToken: (): string | null => useAuthStore.getState().token,
  obtenerRefreshToken: (): string | null => useAuthStore.getState().refreshToken,
  obtenerSucursalActivaId: (): number | null => useAuthStore.getState().sucursalActivaId,
  actualizarTokens: (token: string, refreshToken: string): void =>
    useAuthStore.getState().actualizarTokens(token, refreshToken),
  establecerSesion: (sesion: RespuestaSesion): void =>
    useAuthStore.getState().establecerSesion(sesion),
  cerrarSesion: (): void => useAuthStore.getState().cerrarSesion(),
};
