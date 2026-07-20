/**
 * Log estructurado en JSON (una linea por evento).
 *
 * El requestId se propaga con AsyncLocalStorage, asi que los servicios y
 * repositorios pueden loguear sin recibir `req` como parametro (lo que romperia
 * la separacion de capas: el repository no conoce req/res).
 */
import { AsyncLocalStorage } from 'node:async_hooks';
import { env } from '../config/env';
import type { ContextoSolicitud } from '../tipos/comunes';

const almacen = new AsyncLocalStorage<ContextoSolicitud>();

const NIVELES = { debug: 10, info: 20, warn: 30, error: 40 } as const;
type Nivel = keyof typeof NIVELES;

const nivelMinimo = NIVELES[env.logs.nivel];

/** Claves que jamas deben aparecer en un log (ADR: nunca serializar secretos). */
const CLAVES_SENSIBLES = new Set([
  'password',
  'contrasena',
  'password_hash',
  'passwordHash',
  'token',
  'accessToken',
  'refreshToken',
  'token_hash',
  'tokenHash',
  'authorization',
  'jwt',
  'secreto',
  'secret',
]);

/** Reemplaza recursivamente los valores sensibles por '[REDACTADO]'. */
function sanear(valor: unknown, profundidad = 0): unknown {
  if (profundidad > 6 || valor === null || typeof valor !== 'object') return valor;
  if (Array.isArray(valor)) return valor.map((v) => sanear(v, profundidad + 1));

  const salida: Record<string, unknown> = {};
  for (const [clave, v] of Object.entries(valor as Record<string, unknown>)) {
    salida[clave] = CLAVES_SENSIBLES.has(clave.toLowerCase())
      ? '[REDACTADO]'
      : sanear(v, profundidad + 1);
  }
  return salida;
}

function escribir(nivel: Nivel, mensaje: string, datos?: Record<string, unknown>): void {
  if (NIVELES[nivel] < nivelMinimo) return;

  const contexto = almacen.getStore();
  const evento = {
    nivel,
    hora: new Date().toISOString(),
    mensaje,
    ...(contexto?.requestId ? { requestId: contexto.requestId } : {}),
    ...(contexto?.usuarioId ? { usuarioId: contexto.usuarioId } : {}),
    ...(contexto?.sucursalId ? { sucursalId: contexto.sucursalId } : {}),
    ...(datos ? (sanear(datos) as Record<string, unknown>) : {}),
  };

  const linea = JSON.stringify(evento);
  if (nivel === 'error' || nivel === 'warn') process.stderr.write(`${linea}\n`);
  else process.stdout.write(`${linea}\n`);
}

/** Normaliza un `unknown` capturado en un catch para poder loguearlo. */
export function describirError(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    return {
      error: error.name,
      mensaje: error.message,
      ...(env.esProduccion ? {} : { stack: error.stack }),
    };
  }
  return { error: 'Desconocido', mensaje: String(error) };
}

export const logger = {
  debug: (mensaje: string, datos?: Record<string, unknown>) =>
    escribir('debug', mensaje, datos),
  info: (mensaje: string, datos?: Record<string, unknown>) =>
    escribir('info', mensaje, datos),
  warn: (mensaje: string, datos?: Record<string, unknown>) =>
    escribir('warn', mensaje, datos),
  error: (mensaje: string, datos?: Record<string, unknown>) =>
    escribir('error', mensaje, datos),
};

/** Ejecuta `fn` con el contexto de solicitud asociado. */
export function conContexto<T>(contexto: ContextoSolicitud, fn: () => T): T {
  return almacen.run(contexto, fn);
}

/** Contexto de la solicitud en curso, si existe. */
export function contextoActual(): ContextoSolicitud | undefined {
  return almacen.getStore();
}

/** Enriquece el contexto actual (por ejemplo tras autenticar al usuario). */
export function ampliarContexto(extra: Partial<ContextoSolicitud>): void {
  const actual = almacen.getStore();
  if (!actual) return;
  Object.assign(actual, extra);
}
