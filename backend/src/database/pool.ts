import pg, {
  type Pool,
  type PoolClient,
  type QueryResultRow,
} from 'pg';
import { env } from '../config/env';
import { CONCURRENCIA } from '../config/constantes';
import { logger, describirError } from '../utils/logger';

const ERROR_SERIALIZATION = '40001';
const ERROR_LOCK_TIMEOUT = '55P03';

const poolPrincipal: Pool = new pg.Pool({
  host: env.db.host,
  port: env.db.puerto,
  user: env.db.usuario,
  password: env.db.password,
  database: env.db.nombre,
  max: env.db.limiteConexiones,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
  application_name: 'gochitosystem',
});

const poolReportes: Pool = new pg.Pool({
  host: env.db.host,
  port: env.db.puerto,
  user: env.db.usuario,
  password: env.db.password,
  database: env.db.nombre,
  max: Math.max(2, Math.floor(env.db.limiteConexiones / 2)),
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
  application_name: 'gochitosystem-reportes',
});

export const pool = poolPrincipal;

export type Ejecutor = Pool | PoolClient;

export type ParametrosSql = ReadonlyArray<
  string | number | bigint | boolean | Date | null | Buffer
>;

function convertirPlaceholders(sql: string): string {
  let index = 0;
  return sql.replace(/\?/g, () => `$${++index}`);
}

export async function query<T extends object = QueryResultRow>(
  sql: string,
  parametros: ParametrosSql = [],
  ejecutor: Ejecutor = poolPrincipal,
): Promise<T[]> {
  const sqlPg = convertirPlaceholders(sql);
  const resultado = await ejecutor.query<T>(sqlPg, parametros as unknown as never[]);
  return resultado.rows;
}

export async function queryOne<T extends object = QueryResultRow>(
  sql: string,
  parametros: ParametrosSql = [],
  ejecutor: Ejecutor = poolPrincipal,
): Promise<T | null> {
  const filas = await query<T>(sql, parametros, ejecutor);
  return filas[0] ?? null;
}

export async function ejecutar(
  sql: string,
  parametros: ParametrosSql = [],
  ejecutor: Ejecutor = poolPrincipal,
): Promise<{ rowCount: number }> {
  const sqlPg = convertirPlaceholders(sql);
  const resultado = await ejecutor.query(sqlPg, parametros as unknown as never[]);
  return { rowCount: resultado.rowCount ?? 0 };
}

export async function insertar(
  sql: string,
  parametros: ParametrosSql = [],
  ejecutor: Ejecutor = poolPrincipal,
): Promise<number> {
  const sqlPg = convertirPlaceholders(sql) + ' RETURNING id';
  const resultado = await ejecutor.query<{ id: number }>(sqlPg, parametros as unknown as never[]);
  return resultado.rows[0]?.id ?? 0;
}

export async function queryReporte<T extends object = QueryResultRow>(
  sql: string,
  parametros: ParametrosSql = [],
): Promise<T[]> {
  return query<T>(sql, parametros, poolReportes);
}

function esErrorReintentable(error: unknown): boolean {
  const code = (error as { code?: string } | null)?.code;
  return code === ERROR_SERIALIZATION || code === ERROR_LOCK_TIMEOUT;
}

function esperar(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function withTransaction<T>(
  fn: (cx: PoolClient) => Promise<T>,
  opciones: { readonly pool?: Pool; readonly reintentos?: number } = {},
): Promise<T> {
  const poolElegido = opciones.pool ?? poolPrincipal;
  const maxReintentos = opciones.reintentos ?? CONCURRENCIA.MAX_REINTENTOS;

  let ultimoError: unknown;

  for (let intento = 0; intento <= maxReintentos; intento += 1) {
    const cx = await poolElegido.connect();
    try {
      await cx.query('BEGIN');
      await cx.query(`SET TRANSACTION ISOLATION LEVEL ${CONCURRENCIA.NIVEL_AISLAMIENTO}`);

      const resultado = await fn(cx);

      await cx.query('COMMIT');
      return resultado;
    } catch (error) {
      try {
        await cx.query('ROLLBACK');
      } catch (errorRollback) {
        logger.error('Fallo el rollback de la transaccion', describirError(errorRollback));
      }

      ultimoError = error;

      if (esErrorReintentable(error) && intento < maxReintentos) {
        const espera = CONCURRENCIA.ESPERA_REINTENTO_MS * (intento + 1);
        const jitter = Math.floor(Math.random() * CONCURRENCIA.ESPERA_REINTENTO_MS);
        logger.warn('Transaccion reintentada por conflicto de bloqueo', {
          intento: intento + 1,
          maxReintentos,
          code: (error as { code?: string }).code,
        });
        await esperar(espera + jitter);
        continue;
      }

      throw error;
    } finally {
      cx.release();
    }
  }

  throw ultimoError;
}

export async function verificarConexion(): Promise<boolean> {
  try {
    const fila = await queryOne<{ vivo: number }>('SELECT 1 AS vivo');
    return fila?.vivo === 1;
  } catch {
    return false;
  }
}

export async function cerrarPools(): Promise<void> {
  await Promise.allSettled([poolPrincipal.end(), poolReportes.end()]);
  logger.info('Pools de base de datos cerrados');
}
