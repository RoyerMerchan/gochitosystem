import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '@/store/authStore';

/** Exige sesion activa. Redirige a /login conservando el destino. */
export function ProtectedRoute({ children }: { children: ReactNode }) {
  const autenticado = useAuthStore((s) => Boolean(s.token && s.usuario));
  const ubicacion = useLocation();

  if (!autenticado) {
    const destino = encodeURIComponent(ubicacion.pathname + ubicacion.search);
    return <Navigate to={`/login?redirigir=${destino}`} replace />;
  }
  return <>{children}</>;
}
