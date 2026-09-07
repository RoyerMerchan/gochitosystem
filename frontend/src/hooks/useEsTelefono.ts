/**
 * ¿La app se está viendo en un teléfono?
 *
 * Se mide con el MISMO corte que usa Tailwind para `md`, que es el que ya decide
 * el resto del layout (el sidebar que tapa el contenido, las tablas que se
 * apilan). Si esto usara otro número, habría pantallas donde la app se comporta
 * como teléfono a medias.
 *
 * Es reactivo a propósito: al girar el teléfono o al abrir las herramientas de
 * desarrollo el ancho cambia, y una lectura de una sola vez deja la interfaz
 * mostrando lo que no es.
 */
import { useEffect, useState } from 'react';

const CONSULTA = '(max-width: 767px)';

export function useEsTelefono(): boolean {
  const [esTelefono, setEsTelefono] = useState(() => window.matchMedia(CONSULTA).matches);

  useEffect(() => {
    const mq = window.matchMedia(CONSULTA);
    const alCambiar = (e: MediaQueryListEvent) => setEsTelefono(e.matches);
    mq.addEventListener('change', alCambiar);
    // Por si cambió entre el primer render y el efecto.
    setEsTelefono(mq.matches);
    return () => mq.removeEventListener('change', alCambiar);
  }, []);

  return esTelefono;
}
