import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

export type Tema = 'claro' | 'oscuro' | 'sistema';

interface EstadoUi {
  /** Barra lateral desplegada en escritorio. */
  sidebarAbierto: boolean;
  /** Cajon lateral superpuesto en movil. */
  sidebarMovilAbierto: boolean;
  tema: Tema;

  alternarSidebar: () => void;
  establecerSidebar: (abierto: boolean) => void;
  alternarSidebarMovil: () => void;
  establecerSidebarMovil: (abierto: boolean) => void;
  establecerTema: (tema: Tema) => void;
  alternarTema: () => void;
}

/** Aplica la clase `dark` al elemento raiz segun el tema elegido. */
export function aplicarTema(tema: Tema): void {
  const oscuro =
    tema === 'oscuro' ||
    (tema === 'sistema' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.classList.toggle('dark', oscuro);
}

export const useUiStore = create<EstadoUi>()(
  persist(
    (set, get) => ({
      sidebarAbierto: true,
      sidebarMovilAbierto: false,
      tema: 'sistema',

      alternarSidebar: () => set({ sidebarAbierto: !get().sidebarAbierto }),
      establecerSidebar: (abierto) => set({ sidebarAbierto: abierto }),
      alternarSidebarMovil: () => set({ sidebarMovilAbierto: !get().sidebarMovilAbierto }),
      establecerSidebarMovil: (abierto) => set({ sidebarMovilAbierto: abierto }),

      establecerTema: (tema) => {
        aplicarTema(tema);
        set({ tema });
      },

      alternarTema: () => {
        const actual = get().tema;
        const siguiente: Tema = actual === 'oscuro' ? 'claro' : 'oscuro';
        aplicarTema(siguiente);
        set({ tema: siguiente });
      },
    }),
    {
      name: 'gochito.ui',
      storage: createJSONStorage(() => localStorage),
      partialize: (estado) => ({
        sidebarAbierto: estado.sidebarAbierto,
        tema: estado.tema,
      }),
      version: 1,
      onRehydrateStorage: () => (estado) => {
        if (estado) aplicarTema(estado.tema);
      },
    },
  ),
);

/**
 * Mantiene sincronizado el tema "sistema" con el ajuste del sistema operativo.
 * Se invoca una vez desde main.tsx.
 */
export function escucharTemaDelSistema(): () => void {
  const consulta = window.matchMedia('(prefers-color-scheme: dark)');
  const alCambiar = () => {
    if (useUiStore.getState().tema === 'sistema') aplicarTema('sistema');
  };
  consulta.addEventListener('change', alCambiar);
  return () => consulta.removeEventListener('change', alCambiar);
}
