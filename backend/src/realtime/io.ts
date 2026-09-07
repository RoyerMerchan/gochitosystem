/**
 * Capa de tiempo real (Socket.IO).
 *
 * - Autentica el handshake con el MISMO access token JWT de la API.
 * - Une cada cliente a una sala por sucursal (`sucursal:<id>`), para que un evento
 *   solo llegue a los clientes de esa sucursal, y a una sala por usuario
 *   (`usuario:<id>`) para lo que es de una persona y no del local.
 * - Expone `emitirCambio(sucursalId, recurso)`: el middleware de mutaciones lo llama
 *   tras una operacion exitosa; el frontend decide que refrescar a partir del recurso.
 */
import type { Server as HttpServer } from 'node:http';
import { Server, type Socket } from 'socket.io';
import { verificarAccessToken } from '../middlewares/autenticacion';
import { env } from '../config/env';
import { logger } from '../utils/logger';

let io: Server | null = null;

function salaSucursal(sucursalId: number): string {
  return `sucursal:${sucursalId}`;
}

function salaUsuario(usuarioId: string | number): string {
  return `usuario:${usuarioId}`;
}

/** Largos aceptables de un codigo de barras o QR de producto. */
const CODIGO_MIN = 3;
const CODIGO_MAX = 64;

export function inicializarRealtime(servidor: HttpServer): void {
  io = new Server(servidor, {
    path: '/socket.io',
    cors: { origin: env.api.origenesCors, credentials: true },
    pingTimeout: 20000,
  });

  // Handshake: exige un access token valido (el cliente lo pasa en `auth.token`).
  io.use((socket: Socket, next: (err?: Error) => void) => {
    const token = (socket.handshake.auth?.token as string | undefined)?.trim();
    if (!token) {
      next(new Error('TOKEN_AUSENTE'));
      return;
    }
    try {
      const payload = verificarAccessToken(token);
      socket.data.sucursalId = Number(payload.sucursalId ?? 0);
      socket.data.usuarioId = payload.sub;
      next();
    } catch {
      next(new Error('TOKEN_INVALIDO'));
    }
  });

  io.on('connection', (socket: Socket) => {
    const sucursalId = socket.data.sucursalId as number;
    const usuarioId = socket.data.usuarioId as string;
    void socket.join(salaSucursal(sucursalId));
    void socket.join(salaUsuario(usuarioId));
    logger.info('Cliente realtime conectado', { socketId: socket.id, sucursalId });

    /*
      Escaneo desde el telefono. El celular lee el codigo con la camara y lo manda
      por aqui; el POS abierto en la computadora lo recibe y agrega el producto.

      Va a la sala del USUARIO y no a la de la sucursal: lo que uno escanea aparece
      solo en SUS pantallas, no en la caja del compañero de al lado.

      `socket.to(...)` en vez de `io.to(...)` excluye al que lo mando: si no, el
      propio telefono se agregaria el producto al carrito y se iria al POS en plena
      pasada de escaneo.

      El codigo se relaya tal cual pero acotado: quien lo recibe lo va a meter en
      una URL de busqueda, y una cadena de 10 KB desde una camara no es un producto.
    */
    socket.on('escanear', (datos: { codigo?: unknown }) => {
      const codigo = typeof datos?.codigo === 'string' ? datos.codigo.trim() : '';
      if (codigo.length < CODIGO_MIN || codigo.length > CODIGO_MAX) return;
      socket.to(salaUsuario(usuarioId)).emit('escaneo', { codigo, ts: Date.now() });
    });

    socket.on('disconnect', (motivo: string) => {
      logger.info('Cliente realtime desconectado', { socketId: socket.id, motivo });
    });
  });

  logger.info('Realtime (Socket.IO) inicializado');
}

/** Notifica a los clientes de una sucursal que un recurso cambio. */
export function emitirCambio(
  sucursalId: number,
  recurso: string,
  meta: Record<string, unknown> = {},
): void {
  if (!io) return;
  io.to(salaSucursal(sucursalId)).emit('cambio', { recurso, ts: Date.now(), ...meta });
}
