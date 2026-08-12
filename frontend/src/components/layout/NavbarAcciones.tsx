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

declare global {
  interface Window {
    /** Evento de instalacion que atrapo el script de index.html. */
    __promptInstalar: PromptInstalar | null;
  }
}

/**
 * Cuando el navegador no ofrece el prompt automatico, se le dice al usuario donde
 * esta el boton de instalar en SU navegador. Es lo unico que hace falta: la app se
 * instala igual, solo que a mano.
 */
function comoInstalar(): string {
  const ua = navigator.userAgent;
  // Sin HTTPS no hay PWA. Es la causa mas comun de que el navegador no la ofrezca:
  // entrar por la IP de la red (http://192.168.x.x) en vez de por el dominio.
  if (!window.isSecureContext) {
    return 'Para instalarla hace falta abrir el sistema por HTTPS (o como localhost en esta misma PC).';
  }
  if (/iphone|ipad|ipod/i.test(ua)) {
    return 'En iPhone/iPad: toca Compartir ⬆ y luego "Agregar a inicio".';
  }
  if (/firefox/i.test(ua)) {
    return 'Firefox no instala apps web. Abre el sistema en Chrome o Edge para instalarlo.';
  }
  if (/android/i.test(ua)) {
    return 'Abre el menú ⋮ del navegador y toca "Instalar app" o "Agregar a pantalla de inicio".';
  }
  return 'Busca el ícono de instalar (⊕) al final de la barra de direcciones, o el menú ⋮ → "Instalar Los Gochitos".';
}

/**
 * Botón para instalar la app (PWA).
 *
 * Se muestra SIEMPRE que la app no esté ya instalada. Antes se escondía cuando el
 * navegador todavía no había ofrecido el prompt, y como ese evento casi siempre
 * llega antes de que monte el navbar, en la práctica no aparecía nunca. Si no hay
 * prompt que disparar, el botón explica cómo instalarla a mano.
 */
export function BotonInstalarApp() {
  // El evento pudo llegar antes de montar: el script de index.html lo guardó.
  const [evento, setEvento] = useState<PromptInstalar | null>(() => window.__promptInstalar);
  const [instalada, setInstalada] = useState(false);

  const yaEnApp =
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as unknown as { standalone?: boolean }).standalone === true;

  useEffect(() => {
    // Dos fuentes: el evento nativo, por si llega después de montar, y el aviso
    // del script de index.html, por si llegó antes y quedó guardado.
    const alPrompt = (e: Event) => {
      e.preventDefault();
      setEvento(e as PromptInstalar);
    };
    const alGuardado = () => setEvento(window.__promptInstalar);
    const alInstalar = () => {
      setInstalada(true);
      setEvento(null);
      window.__promptInstalar = null;
      toast.exito('App instalada');
    };
    window.addEventListener('beforeinstallprompt', alPrompt);
    window.addEventListener('gochito:instalable', alGuardado);
    window.addEventListener('appinstalled', alInstalar);
    return () => {
      window.removeEventListener('beforeinstallprompt', alPrompt);
      window.removeEventListener('gochito:instalable', alGuardado);
      window.removeEventListener('appinstalled', alInstalar);
    };
  }, []);

  // Lo único que justifica esconderlo: que ya esté instalada.
  if (instalada || yaEnApp) return null;

  const instalar = async () => {
    if (!evento) {
      toast.info(comoInstalar());
      return;
    }
    await evento.prompt();
    const { outcome } = await evento.userChoice;
    // El prompt nativo se consume de un solo uso: el navegador manda otro después.
    window.__promptInstalar = null;
    setEvento(null);
    if (outcome !== 'accepted') toast.info('Puedes instalarla más tarde desde este mismo botón.');
  };

  return (
    <button onClick={instalar} className={`${BTN} hover:bg-amber-50 hover:text-amber-600 dark:hover:bg-amber-900/30`}
      title={evento ? 'Instalar como app' : 'Cómo instalar la app'} aria-label="Instalar app">
      <Download className="h-5 w-5" />
    </button>
  );
}
