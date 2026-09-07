/**
 * Escaneo desde el telefono: lo que el celular lee con la camara entra al carrito
 * de ESTA pantalla, como si lo hubiera leido un lector de mano enchufado aqui.
 *
 * El backend solo se lo manda a las pantallas del mismo usuario y nunca al propio
 * telefono que escaneo (ver `realtime/io.ts`), asi que este hook puede vivir en el
 * layout: escanear funciona desde cualquier pantalla, no solo con el POS abierto.
 */
import { useEffect } from 'react';
import { suscribirEscaneo } from '@/lib/socket';
import { useAgregarPorCodigo } from './useAgregarPorCodigo';

export function useEscaneoRemoto(): void {
  const agregarPorCodigo = useAgregarPorCodigo();

  useEffect(
    () => suscribirEscaneo((codigo) => {
      void agregarPorCodigo(codigo, 'desde el teléfono');
    }),
    [agregarPorCodigo],
  );
}
