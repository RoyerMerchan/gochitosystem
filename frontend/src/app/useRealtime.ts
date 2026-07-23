import { useEffect } from 'react';
import { useAuthStore } from '@/store/authStore';
import { conectarRealtime, desconectarRealtime } from '@/lib/socket';

/**
 * Mantiene viva la conexion de tiempo real mientras haya sesion. Al cerrar sesion
 * (token = null) se desconecta; al iniciar de nuevo, reconecta con el token nuevo.
 */
export function useRealtime(): void {
  const autenticado = useAuthStore((s) => Boolean(s.token));

  useEffect(() => {
    if (!autenticado) return;
    conectarRealtime();
    return () => desconectarRealtime();
  }, [autenticado]);
}
