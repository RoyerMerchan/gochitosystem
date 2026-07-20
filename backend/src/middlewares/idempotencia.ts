/**
 * Idempotencia de las operaciones criticas del POS (ADR-009).
 *
 * El doble clic no es el unico riesgo: el reintento automatico de axios ante un
 * timeout de red produce dos ventas identicas que descuadran caja e inventario y
 * solo se descubren al cierre. Por eso el cliente envia un UUID v4 en la cabecera
 * `Idempotency-Key` y aqui se reserva ese identificador ANTES de abrir la
 * transaccion de negocio.
 *
 * Secuencia:
 *   1. INSERT ... EN_PROCESO en su propia transaccion (implicita). Si entra, es la
 *      primera vez y la solicitud continua.
 *   2. Si el INSERT choca con la PK (1062) la clave ya existe:
 *        - huella de payload distinta -> 422 IDEMPOTENCY_KEY_REUSE
 *        - EN_PROCESO                 -> 409 SOLICITUD_EN_PROCESO
 *        - COMPLETADA                 -> se reproduce la respuesta original
 *        - FALLIDA                    -> se permite reintentar (no quedo recurso)
 *   3. Al terminar, se guarda el status y el cuerpo para poder reproducirlos.
 *
 * Se aplica a los POST de ventas, compras y abonos.
 */
import crypto from 'node:crypto';
import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { AppError, NoAutenticado } from '../errores/AppError';
import { ejecutar, queryOne } from '../database/pool';
import {
  ESTADO_IDEMPOTENCIA,
  IDEMPOTENCIA_HORAS_VIGENCIA,
} from '../config/constantes';
import { ahoraSql, sumarHorasSql } from '../utils/fechas';
import { logger, describirError } from '../utils/logger';

const ERROR_DUPLICADO = 1062;

const UUID_VALIDO =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

interface FilaIdempotencia {
  clave: string;
  huella_payload: string;
  estado: string;
  http_status: number | null;
  respuesta_json: string | null;
  expira_en: string;
}

/**
 * Serializa el cuerpo de forma canonica (claves ordenadas en todos los niveles)
 * para que dos JSON equivalentes produzcan la misma huella.
 */
function canonicalizar(valor: unknown): string {
  if (valor === null || typeof valor !== 'object') return JSON.stringify(valor) ?? 'null';
  if (Array.isArray(valor)) return `[${valor.map(canonicalizar).join(',')}]`;

  const entradas = Object.entries(valor as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([clave, v]) => `${JSON.stringify(clave)}:${canonicalizar(v)}`);

  return `{${entradas.join(',')}}`;
}

/** SHA-256 del cuerpo canonicalizado (columna huella_payload CHAR(64)). */
export function calcularHuellaPayload(cuerpo: unknown): string {
  return crypto.createHash('sha256').update(canonicalizar(cuerpo)).digest('hex');
}

/** Marca la solicitud como COMPLETADA guardando la respuesta para reproducirla. */
async function registrarResultado(
  clave: string,
  httpStatus: number,
  cuerpo: unknown,
): Promise<void> {
  const exitosa = httpStatus < 400;
  const estado = exitosa
    ? ESTADO_IDEMPOTENCIA.COMPLETADA
    : ESTADO_IDEMPOTENCIA.FALLIDA;

  // De una respuesta de error no se guarda el cuerpo: el reintento debe
  // reprocesarse de verdad, no recibir el error viejo en bucle.
  await ejecutar(
    `UPDATE idempotencia_solicitudes
        SET estado = ?, http_status = ?, respuesta_json = ?
      WHERE clave = ?`,
    [estado, httpStatus, exitosa ? JSON.stringify(cuerpo) : null, clave],
  );
}

/**
 * Middleware de idempotencia.
 *
 * @param endpoint nombre estable del endpoint, se guarda en la columna `endpoint`
 *                 (VARCHAR(120)) para poder auditar y depurar.
 */
export function idempotencia(endpoint: string): RequestHandler {
  return (req: Request, res: Response, next: NextFunction): void => {
    const usuario = req.usuario;
    if (!usuario) {
      next(new NoAutenticado('TOKEN_AUSENTE'));
      return;
    }

    const clave = req.header('Idempotency-Key')?.trim();
    if (!clave) {
      next(new AppError('IDEMPOTENCY_KEY_REQUERIDA'));
      return;
    }
    if (!UUID_VALIDO.test(clave)) {
      next(new AppError('IDEMPOTENCY_KEY_INVALIDA'));
      return;
    }

    const huella = calcularHuellaPayload(req.body);

    reservarClave(clave, usuario.id, endpoint, huella, req, res)
      .then((debeContinuar) => {
        if (debeContinuar) next();
      })
      .catch(next);
  };
}

/**
 * Reserva la clave. Devuelve true si la solicitud debe procesarse, o false si ya
 * se respondio (reproduccion de una respuesta previa).
 */
async function reservarClave(
  clave: string,
  usuarioId: number,
  endpoint: string,
  huella: string,
  req: Request,
  res: Response,
): Promise<boolean> {
  try {
    await ejecutar(
      `INSERT INTO idempotencia_solicitudes
         (clave, usuario_id, endpoint, huella_payload, estado, creado_en, expira_en)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        clave,
        usuarioId,
        endpoint,
        huella,
        ESTADO_IDEMPOTENCIA.EN_PROCESO,
        ahoraSql(),
        sumarHorasSql(IDEMPOTENCIA_HORAS_VIGENCIA),
      ],
    );

    engancharCaptura(clave, req, res);
    return true;
  } catch (error) {
    if ((error as { errno?: number }).errno !== ERROR_DUPLICADO) throw error;
    return resolverClaveExistente(clave, huella, req, res);
  }
}

/** Decide que hacer cuando la clave ya estaba registrada. */
async function resolverClaveExistente(
  clave: string,
  huella: string,
  req: Request,
  res: Response,
): Promise<boolean> {
  const fila = await queryOne<FilaIdempotencia>(
    `SELECT clave, huella_payload, estado, http_status, respuesta_json, expira_en
       FROM idempotencia_solicitudes
      WHERE clave = ?
      LIMIT 1`,
    [clave],
  );

  // Caso de carrera: la fila desaparecio (limpieza) entre el INSERT y el SELECT.
  if (!fila) {
    engancharCaptura(clave, req, res);
    return true;
  }

  // Misma clave con cuerpo distinto: es un error del cliente, no un reintento.
  if (fila.huella_payload !== huella) {
    throw new AppError('IDEMPOTENCY_KEY_REUSE');
  }

  if (fila.estado === ESTADO_IDEMPOTENCIA.EN_PROCESO) {
    throw new AppError('SOLICITUD_EN_PROCESO');
  }

  if (fila.estado === ESTADO_IDEMPOTENCIA.COMPLETADA && fila.respuesta_json !== null) {
    const cuerpo: unknown =
      typeof fila.respuesta_json === 'string'
        ? JSON.parse(fila.respuesta_json)
        : fila.respuesta_json;

    logger.info('Solicitud idempotente reproducida', { clave, endpoint: req.path });
    res.setHeader('Idempotent-Replay', 'true');
    res.status(fila.http_status ?? 200).json(cuerpo);
    return false;
  }

  // FALLIDA: el intento anterior no dejo recurso creado, se permite reprocesar.
  await ejecutar(
    `UPDATE idempotencia_solicitudes
        SET estado = ?, http_status = NULL, respuesta_json = NULL
      WHERE clave = ?`,
    [ESTADO_IDEMPOTENCIA.EN_PROCESO, clave],
  );

  engancharCaptura(clave, req, res);
  return true;
}

/**
 * Envuelve res.json para persistir la respuesta cuando el handler termine.
 * La escritura es asincrona y no bloquea la respuesta al cajero: si falla, se
 * registra en el log; la venta ya quedo protegida por el UNIQUE de la tabla.
 */
function engancharCaptura(clave: string, req: Request, res: Response): void {
  req.idempotencia = { clave, huellaPayload: '' };

  const jsonOriginal = res.json.bind(res);
  let capturado = false;

  res.json = (cuerpo: unknown): Response => {
    if (!capturado) {
      capturado = true;
      void registrarResultado(clave, res.statusCode, cuerpo).catch((error) => {
        logger.error('No se pudo registrar el resultado idempotente', {
          clave,
          ...describirError(error),
        });
      });
    }
    return jsonOriginal(cuerpo);
  };
}
