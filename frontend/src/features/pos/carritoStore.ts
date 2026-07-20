import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Producto } from '@/lib/tipos';

/** Renglon del carrito del POS. Precios en USD. */
export interface ItemCarrito {
  productoId: number;
  sku: string;
  nombre: string;
  precioUnitario: number; // USD
  costoUnitario: number; // USD (para referencia)
  impuestoTasa: number;
  cantidad: number;
  descuentoUnitario: number; // USD
  esPesable: boolean;
  stock: number;
}

interface EstadoCarrito {
  items: ItemCarrito[];
  clienteId: number | null;
  clienteNombre: string;

  agregar: (p: Producto, cantidad?: number) => void;
  cambiarCantidad: (productoId: number, cantidad: number) => void;
  cambiarPrecio: (productoId: number, precio: number) => void;
  cambiarDescuento: (productoId: number, descuento: number) => void;
  quitar: (productoId: number) => void;
  fijarCliente: (id: number | null, nombre: string) => void;
  limpiar: () => void;

  totalUsd: () => number;
  totalItems: () => number;
}

export const useCarrito = create<EstadoCarrito>()(
  persist(
    (set, get) => ({
      items: [],
      clienteId: null,
      clienteNombre: 'CONSUMIDOR FINAL',

      agregar: (p, cantidad = 1) =>
        set((s) => {
          const existe = s.items.find((i) => i.productoId === p.id);
          if (existe) {
            return {
              items: s.items.map((i) =>
                i.productoId === p.id ? { ...i, cantidad: i.cantidad + cantidad } : i,
              ),
            };
          }
          const item: ItemCarrito = {
            productoId: p.id,
            sku: p.sku,
            nombre: p.nombre,
            precioUnitario: Number(p.precio_venta),
            costoUnitario: Number(p.costo_promedio),
            impuestoTasa: Number(p.impuesto_tasa),
            cantidad,
            descuentoUnitario: 0,
            esPesable: p.es_pesable === 1,
            stock: Number(p.cantidad),
          };
          return { items: [...s.items, item] };
        }),

      cambiarCantidad: (id, cantidad) =>
        set((s) => ({
          items: s.items
            .map((i) => (i.productoId === id ? { ...i, cantidad: Math.max(0, cantidad) } : i))
            .filter((i) => i.cantidad > 0),
        })),

      cambiarPrecio: (id, precio) =>
        set((s) => ({
          items: s.items.map((i) =>
            i.productoId === id ? { ...i, precioUnitario: Math.max(0, precio) } : i,
          ),
        })),

      cambiarDescuento: (id, descuento) =>
        set((s) => ({
          items: s.items.map((i) =>
            i.productoId === id ? { ...i, descuentoUnitario: Math.max(0, descuento) } : i,
          ),
        })),

      quitar: (id) => set((s) => ({ items: s.items.filter((i) => i.productoId !== id) })),

      fijarCliente: (id, nombre) => set({ clienteId: id, clienteNombre: nombre }),

      limpiar: () => set({ items: [], clienteId: null, clienteNombre: 'CONSUMIDOR FINAL' }),

      totalUsd: () =>
        get().items.reduce(
          (acc, i) => acc + (i.precioUnitario - i.descuentoUnitario) * i.cantidad,
          0,
        ),

      totalItems: () => get().items.reduce((acc, i) => acc + i.cantidad, 0),
    }),
    { name: 'gochito.carrito' },
  ),
);
