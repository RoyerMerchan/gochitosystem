import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

interface PreferenciasCalculadoraPeso {
  /** null muestra todos; [] conserva la elección de no mostrar ninguno. */
  seleccionados: number[] | null;
  alternar: (id: number, disponibles: number[]) => void;
  seleccionarTodos: () => void;
  desmarcarTodos: () => void;
}

export const useCalculadoraPesoStore = create<PreferenciasCalculadoraPeso>()(
  persist(
    (set) => ({
      seleccionados: null,
      alternar: (id, disponibles) => set((estado) => {
        const actuales = estado.seleccionados ?? disponibles;
        return { seleccionados: actuales.includes(id) ? actuales.filter((actual) => actual !== id) : [...actuales, id] };
      }),
      seleccionarTodos: () => set({ seleccionados: null }),
      desmarcarTodos: () => set({ seleccionados: [] }),
    }),
    {
      name: 'gochito.calculadora-peso',
      storage: createJSONStorage(() => localStorage),
      partialize: (estado) => ({ seleccionados: estado.seleccionados }),
      version: 1,
    },
  ),
);
