/**
 * Cliente de tiempo real (Socket.IO).
 *
 * Se conecta al backend con el access token JWT y escucha el evento `cambio`. Cada
 * `cambio` trae un `recurso` (el segmento de ruta que muto en el backend, p.ej.
 * `ventas`); aqui lo traducimos a las query keys de React Query que hay que
 * invalidar, y TanStack Query refetchea solo lo que este montado. Asi las pantallas
 * se actualizan solas al hacer ventas, entradas, abonos, etc.
 */
import { io, type Socket } from 'socket.io-client';
import { authStore } from '@/store/authStore';
import { queryClient } from '@/app/QueryProvider';
import { URL_API } from './axios';

/**
 * recurso del backend -> prefijos de queryKey a invalidar. `invalidateQueries` hace
 * match por prefijo, asi que ['ventas'] invalida ['ventas', {filtros...}], etc.
 */
const MAPA_INVALIDACION: Record<string, string[]> = {
  // Una venta del POS toca: lista de ventas, existencias, caja y (si es fiado) cartera.
  pos: ['ventas', 'venta-detalle', 'existencias', 'productos', 'prodBuscar', 'cajas-estado', 'turno-activo', 'cartera', 'clientes'],
  ventas: ['ventas', 'venta-detalle', 'existencias', 'productos', 'prodBuscar', 'cajas-estado', 'turno-activo', 'cartera'],
  compras: ['compras', 'compra-detalle', 'existencias', 'productos', 'prodBuscar', 'proveedores'],
  abonos: ['cartera', 'clientes', 'cajas-estado', 'turno-activo', 'ventas'],
  creditos: ['cartera', 'clientes', 'ventas'],
  'turnos-caja': ['cajas-estado', 'turno-activo'],
  inventario: ['existencias', 'productos', 'prodBuscar'],
  productos: ['productos', 'existencias', 'prodBuscar', 'categorias'],
  clientes: ['clientes', 'clientes-pos', 'cartera'],
  proveedores: ['proveedores'],
  'tasas-cambio': ['tasa'],
  categorias: ['categorias', 'productos'],
  'metodos-pago': ['metodos-pago'],
  impuestos: ['impuestos', 'productos'],
  'unidades-medida': ['unidades', 'productos'],
  configuracion: ['config'],
  usuarios: ['usuarios'],
  roles: ['roles', 'usuarios'],
};

/** Origen del backend: sirve tanto si VITE_API_URL es absoluta como relativa. */
function baseSocket(): string {
  return new URL(URL_API, window.location.origin).origin;
}

let socket: Socket | null = null;

export function conectarRealtime(): void {
  if (socket) return;

  socket = io(baseSocket(), {
    path: '/socket.io',
    transports: ['websocket'],
    // Funcion: en cada (re)conexion lee el token vigente del store.
    auth: (cb) => cb({ token: authStore.obtenerToken() ?? '' }),
  });

  socket.on('cambio', (evento: { recurso?: string }) => {
    const prefijos = evento?.recurso ? MAPA_INVALIDACION[evento.recurso] : undefined;
    if (!prefijos) return;
    for (const prefijo of prefijos) {
      void queryClient.invalidateQueries({ queryKey: [prefijo] });
    }
  });
}

export function desconectarRealtime(): void {
  socket?.disconnect();
  socket = null;
}
