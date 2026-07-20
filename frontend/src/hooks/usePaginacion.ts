import { useCallback, useMemo, useState } from 'react';
import type { DireccionOrden, MetaPaginacion } from '@/lib/tipos';

export interface OpcionesPaginacion {
  paginaInicial?: number;
  limiteInicial?: number;
  ordenInicial?: string | null;
  direccionInicial?: DireccionOrden;
}

export interface EstadoPaginacion {
  pagina: number;
  limite: number;
  orden: string | null;
  direccion: DireccionOrden;

  irAPagina: (pagina: number) => void;
  siguiente: () => void;
  anterior: () => void;
  cambiarLimite: (limite: number) => void;
  /** Alterna asc/desc si es la misma columna; si no, ordena asc por la nueva. */
  ordenarPor: (columna: string) => void;
  reiniciar: () => void;

  /** Parametros listos para pasar como query a la API. */
  parametros: {
    pagina: number;
    limite: number;
    orden?: string;
    direccion?: DireccionOrden;
  };
}

export const LIMITES_DISPONIBLES = [10, 25, 50, 100] as const;

/**
 * Estado de paginacion y ordenamiento de un listado.
 * El contrato de la API usa ?pagina=1&limite=25 y devuelve
 * meta:{pagina,limite,total,totalPaginas}.
 */
export function usePaginacion(opciones: OpcionesPaginacion = {}): EstadoPaginacion {
  const {
    paginaInicial = 1,
    limiteInicial = 25,
    ordenInicial = null,
    direccionInicial = 'desc',
  } = opciones;

  const [pagina, setPagina] = useState(paginaInicial);
  const [limite, setLimite] = useState(limiteInicial);
  const [orden, setOrden] = useState<string | null>(ordenInicial);
  const [direccion, setDireccion] = useState<DireccionOrden>(direccionInicial);

  const irAPagina = useCallback((p: number) => setPagina(Math.max(1, p)), []);
  const siguiente = useCallback(() => setPagina((p) => p + 1), []);
  const anterior = useCallback(() => setPagina((p) => Math.max(1, p - 1)), []);

  const cambiarLimite = useCallback((nuevo: number) => {
    setLimite(nuevo);
    setPagina(1); // Cambiar el tamano invalida la pagina actual.
  }, []);

  const ordenarPor = useCallback(
    (columna: string) => {
      if (orden === columna) {
        setDireccion((d) => (d === 'asc' ? 'desc' : 'asc'));
      } else {
        setOrden(columna);
        setDireccion('asc');
      }
      setPagina(1);
    },
    [orden],
  );

  const reiniciar = useCallback(() => {
    setPagina(paginaInicial);
    setLimite(limiteInicial);
    setOrden(ordenInicial);
    setDireccion(direccionInicial);
  }, [paginaInicial, limiteInicial, ordenInicial, direccionInicial]);

  const parametros = useMemo(
    () => ({
      pagina,
      limite,
      ...(orden ? { orden, direccion } : {}),
    }),
    [pagina, limite, orden, direccion],
  );

  return {
    pagina,
    limite,
    orden,
    direccion,
    irAPagina,
    siguiente,
    anterior,
    cambiarLimite,
    ordenarPor,
    reiniciar,
    parametros,
  };
}

/** Meta vacia para el estado de carga inicial de un listado. */
export const META_INICIAL: MetaPaginacion = {
  pagina: 1,
  limite: 25,
  total: 0,
  totalPaginas: 0,
};
