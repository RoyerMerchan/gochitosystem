import { create } from 'zustand';
import type { TasaCambio } from '@/lib/tipos';

/**
 * Tasa de cambio vigente del dia. La carga el TasaProvider al arrancar y la
 * consultan el POS y el TasaBadge. Si `tasa` es null, no hay tasa registrada
 * hoy y el POS debe bloquear la venta.
 */
interface EstadoTasa {
  tasa: TasaCambio | null;
  cargando: boolean;
  establecer: (t: TasaCambio | null) => void;
  setCargando: (v: boolean) => void;
}

export const useTasaStore = create<EstadoTasa>((set) => ({
  tasa: null,
  cargando: true,
  establecer: (tasa) => set({ tasa, cargando: false }),
  setCargando: (cargando) => set({ cargando }),
}));

/** Valor numerico de la tasa vigente (0 si no hay). */
export function tasaVigenteNumero(): number {
  const t = useTasaStore.getState().tasa;
  return t ? Number(t.tasa) : 0;
}
