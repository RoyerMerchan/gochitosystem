/**
 * Escáner de teléfono: la cámara del celular hace de lector de códigos para el
 * Punto de venta que está abierto en la computadora.
 *
 * El teléfono NO arma la venta. Lee el código y lo manda por socket; el POS del
 * mismo usuario lo recibe, busca el producto y lo agrega al carrito (ver
 * `useEscaneoRemoto`). Así el carrito vive en un solo lugar —la caja— y el
 * teléfono es lo que parece: un lector inalámbrico.
 *
 * El lector de códigos se carga solo al abrir esta pantalla: es una librería
 * pesada y la caja, que nunca la usa, no tiene por qué descargarla.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { BrowserMultiFormatReader, type IScannerControls } from '@zxing/browser';
import { ScanLine, Wifi, WifiOff, CameraOff, Check, X, Keyboard } from 'lucide-react';
import { obtener } from '@/lib/axios';
import { emitirEscaneo, realtimeConectado } from '@/lib/socket';
import { toast } from '@/store/toastStore';
import type { Producto } from '@/lib/tipos';

/**
 * La cámara entrega el MISMO código muchas veces por segundo mientras el envase
 * siga delante. Sin esta ventana, una sola pasada mandaría el producto veinte
 * veces al carrito de la caja.
 */
const REPETICION_MS = 2000;

/** Cuánto se queda en pantalla el aviso de un escaneo, en milisegundos. */
const AVISO_MS = 2500;

/**
 * El aviso grande sobre la cámara.
 *
 * La vibración dice "leí algo", pero no dice QUÉ ni si sirvió. Quien va llenando
 * la cesta necesita saber sin apartar la vista del anaquel si ese código entró al
 * carrito de la caja o si no está en el catálogo, y necesita saberlo en el
 * momento, no cuando llegue a cobrar.
 */
interface Aviso {
  tipo: 'enviando' | 'ok' | 'error';
  texto: string;
  /** Cambia en cada escaneo para reiniciar la animación aunque el texto se repita. */
  ts: number;
}

interface Enviado {
  codigo: string;
  /** Nombre del producto, solo para que quien sostiene el teléfono sepa qué leyó. */
  nombre: string | null;
  ts: number;
}

/** Traduce el fallo de la cámara a algo que se pueda arreglar sin saber de navegadores. */
function motivoCamara(e: unknown): string {
  const nombre = (e as { name?: string } | null)?.name ?? '';
  if (nombre === 'NotAllowedError' || nombre === 'SecurityError') {
    return 'No diste permiso para usar la cámara. Habilítalo desde el candado de la barra de direcciones y vuelve a entrar.';
  }
  if (nombre === 'NotFoundError' || nombre === 'OverconstrainedError') {
    return 'Este dispositivo no tiene una cámara que se pueda usar.';
  }
  if (nombre === 'NotReadableError') {
    return 'La cámara está ocupada por otra aplicación. Ciérrala y vuelve a entrar.';
  }
  return 'No se pudo abrir la cámara.';
}

export default function EscanerPage() {
  const video = useRef<HTMLVideoElement>(null);
  const ultimo = useRef<{ codigo: string; ts: number }>({ codigo: '', ts: 0 });
  const [estado, setEstado] = useState<'iniciando' | 'listo' | 'error'>('iniciando');
  const [motivo, setMotivo] = useState('');
  const [enviados, setEnviados] = useState<Enviado[]>([]);
  const [manual, setManual] = useState('');
  const [conectado, setConectado] = useState(realtimeConectado());
  const [aviso, setAviso] = useState<Aviso | null>(null);
  const temporizadorAviso = useRef<ReturnType<typeof setTimeout> | null>(null);

  /*
    Un solo temporizador para todos los avisos: escaneando rápido, cada código
    reinicia la cuenta en vez de dejar que el anterior apague el mensaje nuevo.
  */
  const mostrarAviso = useCallback((tipo: Aviso['tipo'], texto: string) => {
    setAviso({ tipo, texto, ts: Date.now() });
    if (temporizadorAviso.current) clearTimeout(temporizadorAviso.current);
    temporizadorAviso.current = setTimeout(() => setAviso(null), AVISO_MS);
  }, []);

  useEffect(() => () => {
    if (temporizadorAviso.current) clearTimeout(temporizadorAviso.current);
  }, []);

  // El socket no avisa de su estado; se mira cada tanto para poder advertir a
  // tiempo que lo que se escanee no va a llegar a la caja.
  useEffect(() => {
    const t = setInterval(() => setConectado(realtimeConectado()), 2000);
    return () => clearInterval(t);
  }, []);

  const procesar = useCallback(async (codigo: string): Promise<void> => {
    const limpio = codigo.trim();
    if (limpio.length < 3) return;

    const ahora = Date.now();
    if (limpio === ultimo.current.codigo && ahora - ultimo.current.ts < REPETICION_MS) return;
    ultimo.current = { codigo: limpio, ts: ahora };

    // Vibrar es el único acuse que se siente sin mirar la pantalla.
    navigator.vibrate?.(60);

    if (!emitirEscaneo(limpio)) {
      mostrarAviso('error', 'Sin conexión con la caja: no se envió');
      toast.error('Sin conexión con la caja: el código no se envió');
      return;
    }
    // Acuse inmediato: el nombre tarda lo que tarde la búsqueda, pero el código
    // ya salió y quien escanea tiene que verlo ya.
    mostrarAviso('enviando', limpio);

    /*
      El nombre se busca solo para mostrarlo aquí. Quien va llenando la cesta no
      ve la pantalla de la caja: necesita saber en el momento si leyó lo que
      creía, o si ese código no está en el catálogo.
    */
    let nombre: string | null = null;
    try {
      const r = await obtener<Producto[]>(`/productos/buscar?q=${encodeURIComponent(limpio)}`);
      nombre = r[0]?.nombre ?? null;
    } catch {
      nombre = null;
    }
    setEnviados((l) => [{ codigo: limpio, nombre, ts: ahora }, ...l].slice(0, 20));
    if (nombre) mostrarAviso('ok', nombre);
    else mostrarAviso('error', `${limpio} no está en el catálogo`);
  }, [mostrarAviso]);

  useEffect(() => {
    /*
      La cámara solo se puede abrir en un origen seguro. En la red del local eso
      quiere decir https o `localhost`: entrar por la IP en http deja el escáner
      muerto sin decir por qué, así que se dice aquí.
    */
    if (!window.isSecureContext) {
      setEstado('error');
      setMotivo('El navegador solo deja usar la cámara en páginas seguras (https). Abre el sistema por https y vuelve a entrar.');
      return;
    }

    let vivo = true;
    let controles: IScannerControls | null = null;
    const lector = new BrowserMultiFormatReader();

    lector
      .decodeFromConstraints(
        // `environment` es la cámara de atrás: enfoca de cerca y no obliga a leer
        // el código en espejo.
        { video: { facingMode: { ideal: 'environment' } } },
        video.current!,
        (resultado) => {
          if (resultado) void procesar(resultado.getText());
        },
      )
      .then((c) => {
        if (!vivo) {
          c.stop();
          return;
        }
        controles = c;
        setEstado('listo');
      })
      .catch((e: unknown) => {
        if (!vivo) return;
        setEstado('error');
        setMotivo(motivoCamara(e));
      });

    // Sin esto la cámara se queda encendida al salir de la pantalla y el teléfono
    // se calienta con la luz prendida en el bolsillo.
    return () => {
      vivo = false;
      controles?.stop();
    };
  }, [procesar]);

  const enviarManual = (e: React.FormEvent) => {
    e.preventDefault();
    void procesar(manual);
    setManual('');
  };

  return (
    <div className="mx-auto max-w-md space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h1 className="flex items-center gap-2 text-xl font-bold">
          <ScanLine className="h-5 w-5" /> Escanear
        </h1>
        <span
          className={`flex items-center gap-1 rounded-full px-2 py-1 text-xs font-medium ${
            conectado
              ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300'
              : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300'
          }`}
        >
          {conectado ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}
          {conectado ? 'Conectado a la caja' : 'Sin conexión'}
        </span>
      </div>

      <p className="text-xs text-gray-500">
        Lo que leas aquí se agrega al carrito del Punto de venta abierto en la computadora,
        en las pantallas de tu propio usuario.
      </p>

      <div className="relative overflow-hidden rounded-2xl bg-black" style={{ aspectRatio: '3 / 4' }}>
        <video ref={video} className="h-full w-full object-cover" playsInline muted />

        {estado === 'listo' && (
          // Marco guía: sin él la gente acerca el código al borde de la pantalla.
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div
              className={`h-32 w-64 rounded-xl border-2 shadow-[0_0_0_9999px_rgba(0,0,0,0.35)] transition-colors ${
                aviso?.tipo === 'ok'
                  ? 'border-green-400'
                  : aviso?.tipo === 'error'
                    ? 'border-red-400'
                    : 'border-white/80'
              }`}
            />
          </div>
        )}

        {estado !== 'listo' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-gray-900 p-6 text-center">
            {estado === 'iniciando' ? (
              <p className="text-sm text-gray-300">Abriendo la cámara…</p>
            ) : (
              <>
                <CameraOff className="h-8 w-8 text-gray-500" />
                <p className="text-sm leading-relaxed text-gray-300">{motivo}</p>
                <p className="text-xs text-gray-500">Mientras tanto puedes teclear el código abajo.</p>
              </>
            )}
          </div>
        )}

        {/*
          El aviso va ENCIMA de la cámara, que es donde ya están puestos los ojos.
          Un toast en una esquina se lo pierde quien está apuntando a un anaquel.
        */}
        {aviso && (
          <div
            key={aviso.ts}
            className={`absolute inset-x-0 bottom-0 flex items-center gap-2 p-3 text-white ${
              aviso.tipo === 'ok'
                ? 'bg-green-600/95'
                : aviso.tipo === 'error'
                  ? 'bg-red-600/95'
                  : 'bg-gray-900/90'
            }`}
          >
            {aviso.tipo === 'ok' ? (
              <Check className="h-5 w-5 shrink-0" />
            ) : aviso.tipo === 'error' ? (
              <X className="h-5 w-5 shrink-0" />
            ) : (
              <ScanLine className="h-5 w-5 shrink-0 animate-pulse" />
            )}
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{aviso.texto}</p>
              <p className="text-[11px] opacity-90">
                {aviso.tipo === 'ok'
                  ? 'Agregado al carrito de la caja'
                  : aviso.tipo === 'error'
                    ? 'No se agregó nada'
                    : 'Enviando a la caja…'}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Escribir el código a mano: etiquetas rotas, envases sin código, cámara caída. */}
      <form onSubmit={enviarManual} className="flex gap-2">
        <div className="relative flex-1">
          <Keyboard className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            value={manual}
            onChange={(e) => setManual(e.target.value)}
            inputMode="numeric"
            placeholder="Código a mano"
            className="w-full rounded-lg border border-gray-300 py-2 pl-9 pr-3 text-sm focus:border-amber-500 focus:outline-none dark:border-gray-600 dark:bg-gray-700"
          />
        </div>
        <button
          type="submit"
          disabled={manual.trim().length < 3}
          className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-600 disabled:opacity-40"
        >
          Enviar
        </button>
      </form>

      <div>
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
          Enviados a la caja
        </h2>
        {enviados.length === 0 ? (
          <p className="rounded-lg border border-dashed border-gray-300 p-4 text-center text-sm text-gray-400 dark:border-gray-600">
            Apunta la cámara a un código de barras o QR
          </p>
        ) : (
          <ul className="space-y-1">
            {enviados.map((e) => (
              <li
                key={`${e.codigo}-${e.ts}`}
                className="flex items-center gap-2 rounded-lg border border-gray-200 p-2 text-sm dark:border-gray-700"
              >
                {e.nombre ? (
                  <Check className="h-4 w-4 shrink-0 text-green-600" />
                ) : (
                  <X className="h-4 w-4 shrink-0 text-red-500" />
                )}
                <div className="min-w-0 flex-1">
                  <p className={`truncate font-medium ${e.nombre ? '' : 'text-red-500'}`}>
                    {e.nombre ?? 'No está en el catálogo'}
                  </p>
                  <p className="truncate text-xs text-gray-400">{e.codigo}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
