/**
 * Carga la tasa de cambio vigente al arrancar la app y la mantiene en el store.
 * El POS y el TasaBadge la leen desde ahi.
 */
import { useEffect, type ReactNode } from 'react';
import { obtener } from '@/lib/axios';
import { useAuthStore } from '@/store/authStore';
import { useTasaStore } from '@/store/tasaStore';
import type { TasaCambio } from '@/lib/tipos';

export function TasaProvider({ children }: { children: ReactNode }) {
  const autenticado = useAuthStore((s) => Boolean(s.token && s.usuario));
  const establecer = useTasaStore((s) => s.establecer);
  const setCargando = useTasaStore((s) => s.setCargando);

  useEffect(() => {
    if (!autenticado) return;
    let activo = true;
    setCargando(true);
    obtener<TasaCambio | null>('/tasas-cambio/vigente')
      .then((t) => activo && establecer(t))
      .catch(() => activo && establecer(null));
    return () => {
      activo = false;
    };
  }, [autenticado, establecer, setCargando]);

  return <>{children}</>;
}
