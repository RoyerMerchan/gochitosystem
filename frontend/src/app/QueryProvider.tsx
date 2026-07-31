import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

const cliente = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      /**
       * La cache sobrevive media hora aunque la pantalla se cierre. Con el default
       * (5 min) salir de Productos y volver disparaba de nuevo todas las consultas;
       * ahora vuelve pintada al instante y solo refresca por detras si esta vieja.
       */
      gcTime: 30 * 60_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

/**
 * Catalogos que practicamente no cambian (categorias, unidades, impuestos, roles,
 * configuracion). No hace falta re-pedirlos cada 30 s: cuando alguien los edita, el
 * evento de tiempo real los invalida igual (ver MAPA_INVALIDACION en lib/socket).
 */
export const STALE_CATALOGO = 30 * 60_000;

export function QueryProvider({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={cliente}>{children}</QueryClientProvider>;
}

export { cliente as queryClient };
