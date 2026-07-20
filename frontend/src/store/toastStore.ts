import { create } from 'zustand';

export type TipoToast = 'exito' | 'error' | 'info';
export interface Toast {
  id: number;
  tipo: TipoToast;
  mensaje: string;
}

interface EstadoToast {
  toasts: Toast[];
  mostrar: (tipo: TipoToast, mensaje: string) => void;
  quitar: (id: number) => void;
}

let contador = 0;

export const useToastStore = create<EstadoToast>((set) => ({
  toasts: [],
  mostrar: (tipo, mensaje) => {
    const id = ++contador;
    set((s) => ({ toasts: [...s.toasts, { id, tipo, mensaje }] }));
    setTimeout(() => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), 4000);
  },
  quitar: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));

/** Atajos para usar fuera de componentes. */
export const toast = {
  exito: (m: string) => useToastStore.getState().mostrar('exito', m),
  error: (m: string) => useToastStore.getState().mostrar('error', m),
  info: (m: string) => useToastStore.getState().mostrar('info', m),
};
