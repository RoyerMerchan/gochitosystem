import { create } from 'zustand';

export interface OpcionesConfirm {
  titulo: string;
  mensaje: string;
  confirmar?: string;
  cancelar?: string;
  peligro?: boolean;
}

interface EstadoConfirm {
  abierto: boolean;
  opciones: OpcionesConfirm | null;
  resolver: ((v: boolean) => void) | null;
  pedir: (o: OpcionesConfirm) => Promise<boolean>;
  responder: (v: boolean) => void;
}

export const useConfirmStore = create<EstadoConfirm>((set, get) => ({
  abierto: false,
  opciones: null,
  resolver: null,
  pedir: (opciones) =>
    new Promise<boolean>((resolve) => {
      set({ abierto: true, opciones, resolver: resolve });
    }),
  responder: (v) => {
    get().resolver?.(v);
    set({ abierto: false, opciones: null, resolver: null });
  },
}));

/** Devuelve una función async que muestra el diálogo de confirmación. */
export function useConfirm(): (o: OpcionesConfirm) => Promise<boolean> {
  return useConfirmStore((s) => s.pedir);
}
