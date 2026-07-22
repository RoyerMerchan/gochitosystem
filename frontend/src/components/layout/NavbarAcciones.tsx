/** Botones del navbar: alternar tema claro/oscuro e instalar como app (PWA). */
import { useEffect, useState } from 'react';
import { Sun, Moon, Download } from 'lucide-react';
import { useUiStore } from '@/store/uiStore';
import { toast } from '@/store/toastStore';

const BTN = 'rounded-lg p-2 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700';

/** Alterna entre modo claro y oscuro. Usa el tema persistido del uiStore. */
export function ToggleTema() {
  const tema = useUiStore((s) => s.tema);
  const alternar = useUiStore((s) => s.alternarTema);
  const oscuro =
    tema === 'oscuro' ||
    (tema === 'sistema' && window.matchMedia('(prefers-color-scheme: dark)').matches);

  return (
    <button onClick={alternar} className={BTN} title={oscuro ? 'Modo claro' : 'Modo oscuro'} aria-label="Cambiar tema">
      {oscuro ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
    </button>
  );
}

interface PromptInstalar extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: string }>;
}

/** Botón para instalar la app (escritorio/Android vía prompt; iOS con instrucciones). */
export function BotonInstalarApp() {
  const [evento, setEvento] = useState<PromptInstalar | null>(null);
  const [instalada, setInstalada] = useState(false);

  const esIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const yaEnApp =
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as unknown as { standalone?: boolean }).standalone === true;

  useEffect(() => {
    const alPrompt = (e: Event) => {
      e.preventDefault();
      setEvento(e as PromptInstalar);
    };
    const alInstalar = () => {
      setInstalada(true);
      setEvento(null);
      toast.exito('App instalada');
    };
    window.addEventListener('beforeinstallprompt', alPrompt);
    window.addEventListener('appinstalled', alInstalar);
    return () => {
      window.removeEventListener('beforeinstallprompt', alPrompt);
      window.removeEventListener('appinstalled', alInstalar);
    };
  }, []);

  if (instalada || yaEnApp) return null;
  // Escritorio/Android: solo cuando el navegador la marca instalable. iOS: siempre (instrucciones).
  if (!evento && !esIOS) return null;

  const instalar = async () => {
    if (evento) {
      await evento.prompt();
      await evento.userChoice;
      setEvento(null);
    } else {
      toast.info('En iPhone/iPad: toca Compartir ⬆ y luego "Agregar a inicio".');
    }
  };

  return (
    <button onClick={instalar} className={`${BTN} hover:bg-amber-50 hover:text-amber-600 dark:hover:bg-amber-900/30`}
      title="Instalar como app" aria-label="Instalar app">
      <Download className="h-5 w-5" />
    </button>
  );
}
