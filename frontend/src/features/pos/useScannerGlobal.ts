/**
 * Scanner global: detecta lectura de código de barras en CUALQUIER parte de la app
 * (teclas muy rápidas terminadas en Enter, con el foco fuera de un campo de texto),
 * agrega el producto al carrito y lleva al Punto de venta.
 *
 * Si el foco está en un input (p.ej. el buscador del POS), no interfiere: ese campo
 * ya recibe el código directamente.
 */
import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { obtener } from '@/lib/axios';
import { useCarrito } from './carritoStore';
import { toast } from '@/store/toastStore';
import type { Producto } from '@/lib/tipos';

const GAP_MAX_MS = 50; // separación máxima entre teclas para considerarlo scanner
const LARGO_MIN = 3; // largo mínimo del código

export function useScannerGlobal(): void {
  const navigate = useNavigate();
  const agregar = useCarrito((s) => s.agregar);
  const buffer = useRef('');
  const ultimaTecla = useRef(0);

  useEffect(() => {
    const esEditable = (el: EventTarget | null): boolean => {
      const n = el as HTMLElement | null;
      if (!n || !n.tagName) return false;
      const tag = n.tagName;
      return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || n.isContentEditable;
    };

    const procesar = async (codigo: string): Promise<void> => {
      try {
        const r = await obtener<Producto[]>(`/productos/buscar?q=${encodeURIComponent(codigo)}`);
        const prod = r[0];
        if (!prod) {
          toast.error(`Código ${codigo}: producto no encontrado`);
          return;
        }
        agregar(prod);
        toast.exito(`${prod.nombre} agregado`);
        navigate('/pos');
      } catch {
        toast.error('No se pudo buscar el código escaneado');
      }
    };

    const onKey = (e: KeyboardEvent): void => {
      // El foco en un campo: dejar que ese campo reciba el scanner.
      if (esEditable(document.activeElement)) return;

      const ahora = e.timeStamp;
      if (e.key === 'Enter') {
        const codigo = buffer.current;
        buffer.current = '';
        if (codigo.length >= LARGO_MIN) {
          e.preventDefault();
          void procesar(codigo);
        }
        return;
      }
      if (e.key.length === 1) {
        if (ahora - ultimaTecla.current > GAP_MAX_MS) buffer.current = '';
        buffer.current += e.key;
        ultimaTecla.current = ahora;
      }
    };

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [navigate, agregar]);
}
