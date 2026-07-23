/**
 * Capa de tiempo real (Socket.IO).
 *
 * - Autentica el handshake con el MISMO access token JWT de la API.
 * - Une cada cliente a una sala por sucursal (`sucursal:<id>`), para que un evento
 *   solo llegue a los clientes de esa sucursal.
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
    void socket.join(salaSucursal(sucursalId));
    logger.info('Cliente realtime conectado', { socketId: socket.id, sucursalId });

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
