import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Producto } from '@/lib/tipos';

/** Renglon del carrito del POS. Precios en USD. */
export interface ItemCarrito {
  productoId: number;
  sku: string;
  nombre: string;
  precioUnitario: number; // USD (el que se cobra; detal o mayor)
  precioDetal: number; // USD precio normal
  precioMayorista: number | null; // USD precio al mayor (si el producto lo tiene)
  esMayor: boolean; // true si se esta cobrando al mayor
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
  alternarMayor: (productoId: number) => void;
  aplicarMayorTodo: (activar: boolean) => void;
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
          const mayor = p.precio_venta_mayorista != null ? Number(p.precio_venta_mayorista) : null;
          const item: ItemCarrito = {
            productoId: p.id,
            sku: p.sku,
            nombre: p.nombre,
            precioUnitario: Number(p.precio_venta),
            precioDetal: Number(p.precio_venta),
            precioMayorista: mayor,
            esMayor: false,
            costoUnitario: Number(p.costo_promedio),
            impuestoTasa: Number(p.impuesto_tasa),
            cantidad,
            descuentoUnitario: 0,
            esPesable: Boolean(p.es_pesable),
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
            i.productoId === id ? { ...i, precioUnitario: Math.max(0, precio), esMayor: false } : i,
          ),
        })),

      cambiarDescuento: (id, descuento) =>
        set((s) => ({
          items: s.items.map((i) =>
            i.productoId === id ? { ...i, descuentoUnitario: Math.max(0, descuento) } : i,
          ),
        })),

      // Alterna un renglon entre precio detal y precio al mayor (si el producto lo tiene).
      alternarMayor: (id) =>
        set((s) => ({
          items: s.items.map((i) => {
            if (i.productoId !== id || i.precioMayorista == null) return i;
            const esMayor = !i.esMayor;
            return { ...i, esMayor, precioUnitario: esMayor ? i.precioMayorista : i.precioDetal };
          }),
        })),

      // Aplica (o quita) el precio al mayor a todos los renglones que lo tengan.
      aplicarMayorTodo: (activar) =>
        set((s) => ({
          items: s.items.map((i) =>
            i.precioMayorista == null
              ? i
              : { ...i, esMayor: activar, precioUnitario: activar ? i.precioMayorista : i.precioDetal },
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
