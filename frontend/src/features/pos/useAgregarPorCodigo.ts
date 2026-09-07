/**
 * Un codigo leido -> el producto en el carrito, venga de donde venga.
 *
 * Hay dos lectores: el de mano conectado a la computadora (teclas muy rapidas,
 * `useScannerGlobal`) y la camara del telefono, que manda el codigo por socket
 * (`useEscaneoRemoto`). Los dos terminan aqui para que hagan exactamente lo
 * mismo: si el cajero ve un comportamiento con el lector de mano y otro con el
 * telefono, deja de confiar en el que le falle primero.
 */
import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { obtener } from '@/lib/axios';
import { useCarrito } from './carritoStore';
import { toast } from '@/store/toastStore';
import type { Producto } from '@/lib/tipos';

export function useAgregarPorCodigo(): (codigo: string, origen?: string) => Promise<void> {
  const navigate = useNavigate();
  const agregar = useCarrito((s) => s.agregar);

  return useCallback(
    async (codigo: string, origen?: string): Promise<void> => {
      try {
        const r = await obtener<Producto[]>(`/productos/buscar?q=${encodeURIComponent(codigo)}`);
        const prod = r[0];
        if (!prod) {
          toast.error(`Código ${codigo}: producto no encontrado`);
          return;
        }
        agregar(prod);
        toast.exito(`${prod.nombre} agregado${origen ? ` · ${origen}` : ''}`);
        navigate('/pos');
      } catch {
        toast.error('No se pudo buscar el código escaneado');
      }
    },
    [navigate, agregar],
  );
}
