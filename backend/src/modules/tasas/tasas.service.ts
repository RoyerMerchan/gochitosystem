/**
 * Tasas de cambio USD -> Bs. Modulo critico del modelo bimonetario.
 *
 * Reglas:
 *   - Una sola tasa VIGENTE por dia (UNIQUE (fecha, activo_uk) en el esquema).
 *   - La tasa nunca se sobrescribe: corregir = crear una fila nueva que marca la
 *     anterior como eliminada (es_correccion=1, corrige_tasa_id).
 *   - Si no hay tasa para HOY, vender se bloquea con SIN_TASA_DEL_DIA.
 */
import { Conflicto, NoEncontrado, ReglaNegocio } from '../../errores/AppError';
import {
  query,
  queryOne,
  ejecutar,
  insertar,
  withTransaction,
  type Ejecutor,
} from '../../database/pool';
import { FUENTE_TASA, type FuenteTasa } from '../../config/constantes';
import { env } from '../../config/env';
import { aTasaCambio } from '../../utils/moneda';
import type { Id, DecimalSql } from '../../tipos/comunes';

export interface TasaVigente {
  readonly id: Id;
  readonly fecha: string;
  readonly tasa: DecimalSql;
}

interface FilaTasa {
  id: number;
  fecha: string;
  tasa: string;
  fuente: string;
  es_correccion: number;
  notas: string | null;
  usuario_id: number;
  usuario_nombre: string;
  creado_en: string;
}

/** Devuelve la tasa vigente de una fecha (por defecto hoy), o null si no hay. */
export async function tasaDeFecha(
  fecha?: string,
  ejecutor?: Ejecutor,
): Promise<{ id: number; tasa: string; fecha: string } | null> {
  const sql = `SELECT id, tasa, TO_CHAR(fecha, 'YYYY-MM-DD') AS fecha
                 FROM tasas_cambio
                WHERE fecha = ${fecha ? '?' : 'CURRENT_DATE'} AND eliminado_en IS NULL
                LIMIT 1`;
  const params = fecha ? [fecha] : [];
  return queryOne<{ id: number; tasa: string; fecha: string }>(sql, params, ejecutor);
}

/**
 * Obtiene la tasa vigente de HOY o lanza SIN_TASA_DEL_DIA.
 * La usa el POS antes de registrar cualquier venta.
 */
export async function exigirTasaDeHoy(
  ejecutor?: Ejecutor,
): Promise<{ id: number; tasa: string; fecha: string }> {
  const tasa = await tasaDeFecha(undefined, ejecutor);
  if (!tasa) throw new ReglaNegocio('SIN_TASA_DEL_DIA');
  return tasa;
}

export async function obtenerVigente(): Promise<TasaVigente | null> {
  const tasa = await tasaDeFecha();
  return tasa ? { id: tasa.id, fecha: tasa.fecha, tasa: tasa.tasa } : null;
}

/** Registra la tasa del dia. Falla si ya existe una vigente para esa fecha. */
export async function registrar(
  entrada: { fecha?: string; tasa: string; fuente?: FuenteTasa; notas?: string },
  usuarioId: Id,
): Promise<TasaVigente> {
  // Valida que sea un decimal positivo antes de tocar la base.
  if (aTasaCambio(entrada.tasa) <= 0n) throw new ReglaNegocio('TASA_INVALIDA');

  const existente = await tasaDeFecha(entrada.fecha);
  if (existente) throw new Conflicto('TASA_YA_REGISTRADA');

  const id = await insertar(
     `INSERT INTO tasas_cambio (fecha, tasa, fuente, usuario_id, notas)
      VALUES (${entrada.fecha ? '?' : 'CURRENT_DATE'}, ?, ?, ?, ?)`,
    [
      ...(entrada.fecha ? [entrada.fecha] : []),
      entrada.tasa,
      entrada.fuente ?? FUENTE_TASA.MANUAL,
      usuarioId,
      entrada.notas ?? null,
    ],
  );

  const creada = await queryOne<{ id: number; tasa: string; fecha: string }>(
    `SELECT id, tasa, TO_CHAR(fecha, 'YYYY-MM-DD') AS fecha FROM tasas_cambio WHERE id = ?`,
    [id],
  );
  return { id, fecha: creada?.fecha ?? '', tasa: creada?.tasa ?? entrada.tasa };
}

/**
 * Corrige una tasa: marca la anterior como eliminada y crea una nueva para la
 * misma fecha con es_correccion=1. Todo en una transaccion.
 */
export async function corregir(
  tasaId: Id,
  nuevaTasa: string,
  usuarioId: Id,
  notas?: string,
  fuente: FuenteTasa = FUENTE_TASA.MANUAL,
): Promise<TasaVigente> {
  if (aTasaCambio(nuevaTasa) <= 0n) throw new ReglaNegocio('TASA_INVALIDA');

  return withTransaction(async (cx) => {
    const anterior = await queryOne<{ id: number; fecha: string }>(
      `SELECT id, TO_CHAR(fecha, 'YYYY-MM-DD') AS fecha
         FROM tasas_cambio WHERE id = ? AND eliminado_en IS NULL LIMIT 1`,
      [tasaId],
      cx,
    );
    if (!anterior) throw new NoEncontrado('NO_ENCONTRADO');

    await ejecutar(`UPDATE tasas_cambio SET eliminado_en = NOW() WHERE id = ?`, [tasaId], cx);

    const id = await insertar(
      `INSERT INTO tasas_cambio (fecha, tasa, fuente, es_correccion, corrige_tasa_id, usuario_id, notas)
       VALUES (?, ?, ?, TRUE, ?, ?, ?)`,
      [anterior.fecha, nuevaTasa, fuente, tasaId, usuarioId, notas ?? null],
      cx,
    );

    return { id, fecha: anterior.fecha, tasa: nuevaTasa };
  });
}

/**
 * Obtiene la tasa BCV del día desde Cotizave (https://cotizave.com/api-bcv).
 * Devuelve el valor sin registrarlo: el usuario decide si lo guarda.
 */
export async function obtenerTasaBcv(): Promise<{ tasa: string; actualizadoEn: string | null }> {
  const apiKey = env.integraciones.cotizaveApiKey;
  if (!apiKey) throw new ReglaNegocio('BCV_SIN_API_KEY');

  let respuesta: Response;
  try {
    respuesta = await fetch(env.integraciones.cotizaveUrl, {
      headers: { 'X-API-Key': apiKey, Accept: 'application/json' },
      signal: AbortSignal.timeout(8000),
    });
  } catch (causa) {
    throw new ReglaNegocio('BCV_NO_DISPONIBLE', { causa });
  }
  if (!respuesta.ok) throw new ReglaNegocio('BCV_NO_DISPONIBLE');

  const datos = (await respuesta.json()) as { mid?: number; updated_at?: string };
  if (typeof datos.mid !== 'number' || !(datos.mid > 0)) {
    throw new ReglaNegocio('BCV_NO_DISPONIBLE');
  }
  return { tasa: String(datos.mid), actualizadoEn: datos.updated_at ?? null };
}

/** Historial de tasas paginado. */
export async function listar(
  desplazamiento: number,
  limite: number,
): Promise<{ datos: FilaTasa[]; total: number }> {
  const datos = await query<FilaTasa>(
    `SELECT t.id, TO_CHAR(t.fecha, 'YYYY-MM-DD') AS fecha, t.tasa, t.fuente,
            t.es_correccion, t.notas, t.usuario_id, u.nombre_completo AS usuario_nombre,
            t.creado_en
       FROM tasas_cambio t
       JOIN usuarios u ON u.id = t.usuario_id
      WHERE t.eliminado_en IS NULL
      ORDER BY t.fecha DESC, t.id DESC
      LIMIT ? OFFSET ?`,
    [limite, desplazamiento],
  );
  const total = await queryOne<{ n: number }>(
    `SELECT COUNT(*) AS n FROM tasas_cambio WHERE eliminado_en IS NULL`,
  );
  return { datos, total: total?.n ?? 0 };
}
