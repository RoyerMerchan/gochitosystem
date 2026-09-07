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
  // 'dashboard' cubre los totales por período y el contador de cartera: sin él, el
  // saldo que te deben se quedaba congelado hasta recargar la página.
  // 'estado-cuenta' es la cuenta de una persona abierta en el modal de abono: si
  // otra caja le fia o le cobra, tiene que verse ahi sin recargar.
  // 'ventas-espera': la gaveta de carritos aparcados es compartida por la sucursal;
  // si otra caja guarda o retoma uno, el contador del POS tiene que moverse solo.
  pos: ['ventas', 'venta-detalle', 'existencias', 'productos', 'prodBuscar', 'cajas-estado', 'turno-activo', 'cartera', 'estado-cuenta', 'clientes', 'dashboard', 'ventas-espera'],
  ventas: ['ventas', 'venta-detalle', 'existencias', 'productos', 'prodBuscar', 'cajas-estado', 'turno-activo', 'cartera', 'estado-cuenta', 'dashboard'],
  // 'dashboard' trae el gasto en mercancía y lo que se le debe a proveedores.
  compras: ['compras', 'compra-detalle', 'existencias', 'productos', 'prodBuscar', 'proveedores', 'dashboard'],
  abonos: ['cartera', 'estado-cuenta', 'clientes', 'cajas-estado', 'turno-activo', 'ventas', 'dashboard'],
  creditos: ['cartera', 'estado-cuenta', 'clientes', 'ventas', 'dashboard'],
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

/*
  Oyentes del escaneo remoto (el telefono leyendo con la camara).

  Viven en un Set del modulo y no colgados del socket a proposito: al cerrar y
  volver a abrir sesion el socket se destruye y se crea otro, y una suscripcion
  hecha directamente sobre el objeto viejo se perderia en silencio —el cajero
  volveria a entrar y el telefono dejaria de agregar productos sin que nadie
  entienda por que—. Suscribirse aqui tambien funciona ANTES de que exista el
  socket, que es justo lo que pasa: el layout se monta antes de conectarse.
*/
const oyentesEscaneo = new Set<(codigo: string) => void>();

/**
 * Escucha los codigos que escanea el telefono de ESTE MISMO usuario.
 * Devuelve la funcion para dejar de escuchar.
 */
export function suscribirEscaneo(cb: (codigo: string) => void): () => void {
  oyentesEscaneo.add(cb);
  return () => {
    oyentesEscaneo.delete(cb);
  };
}

/**
 * Manda un codigo leido con la camara. Devuelve false si no hay conexion viva,
 * para que el telefono avise en vez de tragarse el escaneo.
 */
export function emitirEscaneo(codigo: string): boolean {
  if (!socket?.connected) return false;
  socket.emit('escanear', { codigo });
  return true;
}

/** ¿Hay conexion de tiempo real ahora mismo? */
export function realtimeConectado(): boolean {
  return Boolean(socket?.connected);
}

export function conectarRealtime(): void {
  if (socket) return;

  socket = io(baseSocket(), {
    path: '/socket.io',
    transports: ['websocket'],
    // Funcion: en cada (re)conexion lee el token vigente del store.
    auth: (cb) => cb({ token: authStore.obtenerToken() ?? '' }),
  });

  socket.on('escaneo', (evento: { codigo?: string }) => {
    if (!evento?.codigo) return;
    for (const cb of oyentesEscaneo) cb(evento.codigo);
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
