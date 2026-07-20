/**
 * Identificador de solicitud (ULID de 26 caracteres, igual que auditoria.request_id).
 *
 * Se acepta el X-Request-Id entrante si es valido, para poder correlacionar una
 * traza que empieza en el frontend; si no, se genera. Siempre se devuelve en la
 * respuesta y se deja en el contexto para que TODO log de la solicitud lo lleve.
 */
import crypto from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { conContexto } from '../utils/logger';

const ALFABETO_ULID = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'; // Crockford base32
const LONGITUD_ULID = 26;

/** Genera un ULID: 10 chars de timestamp + 16 de aleatoriedad, ordenable por tiempo. */
export function generarUlid(): string {
  let tiempo = Date.now();
  let parteTiempo = '';
  for (let i = 0; i < 10; i += 1) {
    parteTiempo = ALFABETO_ULID[tiempo % 32] + parteTiempo;
    tiempo = Math.floor(tiempo / 32);
  }

  const aleatorio = crypto.randomBytes(16);
  let parteAleatoria = '';
  for (let i = 0; i < 16; i += 1) {
    parteAleatoria += ALFABETO_ULID[(aleatorio[i] ?? 0) % 32];
  }

  return parteTiempo + parteAleatoria;
}

const ULID_VALIDO = new RegExp(`^[0-9A-HJKMNP-TV-Z]{${LONGITUD_ULID}}$`);

export function requestId(req: Request, res: Response, next: NextFunction): void {
  const entrante = req.header('X-Request-Id');
  const id =
    entrante && ULID_VALIDO.test(entrante.toUpperCase())
      ? entrante.toUpperCase()
      : generarUlid();

  req.requestId = id;
  res.setHeader('X-Request-Id', id);

  // Todo lo que ocurra despues (incluidos services y repositories) hereda el contexto.
  conContexto({ requestId: id, ip: req.ip }, () => next());
}
