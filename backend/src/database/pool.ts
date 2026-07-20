/**
 * Pools de conexion a MariaDB y helpers de acceso a datos.
 *
 * Se crean DOS pools (ADR-012):
 *   - poolPrincipal: ruta caliente del POS (ventas, inventario, caja).
 *   - poolReportes : consultas analiticas pesadas, con limite bajo de conexiones
 *                    para que un reporte anual no agote el pool del mostrador.
 *
 * Decisiones importantes de configuracion:
 *   - decimalNumbers = false: los DECIMAL llegan como STRING. Convertirlos a
 *     `number` los pasaria por punto flotante y romperia la regla de dinero del
 *     contrato (ADR-013). La conversion se hace en utils/dinero con bigint.
 *   - dateStrings = true: los DATETIME llegan como string en hora de Bogota, sin
 *     que el driver los reinterprete en la zona del proceso.
 *   - supportBigNumbers = true: un BIGINT fuera del rango seguro de JS llega como
 *     string en vez de perder precision silenciosamente.
 */
import mysql, {
  type Pool,
  type PoolConnection,
  type PoolOptions,
  type ResultSetHeader,
  type RowDataPacket,
} from 'mysql2/promise';
import { env } from '../config/env';
import { CONCURRENCIA } from '../config/constantes';
import { logger, describirError } from '../utils/logger';

/** Codigos de error de MariaDB que justifican reintentar la transaccion. */
const ERROR_DEADLOCK = 1213;
const ERROR_LOCK_TIMEOUT = 1205;

const opcionesBase: PoolOptions = {
  host: env.db.host,
  port: env.db.puerto,
  user: env.db.usuario,
  password: env.db.password,
  database: env.db.nombre,
  timezone: env.db.zonaHoraria,
  charset: 'utf8mb4_unicode_ci',
  waitForConnections: true,
  queueLimit: 0,
  enableKeepAlive: true,
  keepAliveInitialDelay: 10_000,
  decimalNumbers: false,
  dateStrings: true,
  supportBigNumbers: true,
  bigNumberStrings: false,
  multipleStatements: false,
};

/** Pool de la ruta transaccional (POS, inventario, caja). */
export const poolPrincipal: Pool = mysql.createPool({
  ...opcionesBase,
  connectionLimit: env.db.limiteConexiones,
});

/** Pool de solo lectura para reportes y exportaciones. */
export const poolReportes: Pool = mysql.createPool({
  ...opcionesBase,
  connectionLimit: Math.max(2, Math.floor(env.db.limiteConexiones / 2)),
});

/** Alias por comodidad: el pool por defecto es el transaccional. */
export const pool = poolPrincipal;

/** Cualquier cosa que sepa ejecutar SQL: un pool o una conexion en transaccion. */
export type Ejecutor = Pool | PoolConnection;

/** Parametros admitidos en una consulta preparada. */
export type ParametrosSql = ReadonlyArray<
  string | number | bigint | boolean | Date | null | Buffer
>;

// -----------------------------------------------------------------------------
// Helpers de consulta
// -----------------------------------------------------------------------------

/** Ejecuta un SELECT y devuelve todas las filas tipadas. */
export async function query<T extends object = RowDataPacket>(
  sql: string,
  parametros: ParametrosSql = [],
  ejecutor: Ejecutor = poolPrincipal,
): Promise<T[]> {
  const [filas] = await ejecutor.execute<RowDataPacket[]>(sql, parametros as unknown as never);
  return filas as unknown as T[];
}

/** Ejecuta un SELECT y devuelve la primera fila, o null si no hay ninguna. */
export async function queryOne<T extends object = RowDataPacket>(
  sql: string,
  parametros: ParametrosSql = [],
  ejecutor: Ejecutor = poolPrincipal,
): Promise<T | null> {
  const filas = await query<T>(sql, parametros, ejecutor);
  return filas[0] ?? null;
}

/** Ejecuta un INSERT/UPDATE/DELETE y devuelve la cabecera del resultado. */
export async function ejecutar(
  sql: string,
  parametros: ParametrosSql = [],
  ejecutor: Ejecutor = poolPrincipal,
): Promise<ResultSetHeader> {
  const [resultado] = await ejecutor.execute<ResultSetHeader>(
    sql,
    parametros as unknown as never,
  );
  return resultado;
}

/** Ejecuta un INSERT y devuelve el id generado. */
export async function insertar(
  sql: string,
  parametros: ParametrosSql = [],
  ejecutor: Ejecutor = poolPrincipal,
): Promise<number> {
  const resultado = await ejecutar(sql, parametros, ejecutor);
  return resultado.insertId;
}

/** Consulta contra el pool de reportes. Usar en TODO reporte y exportacion. */
export async function queryReporte<T extends object = RowDataPacket>(
  sql: string,
  parametros: ParametrosSql = [],
): Promise<T[]> {
  return query<T>(sql, parametros, poolReportes);
}

// -----------------------------------------------------------------------------
// Transacciones
// -----------------------------------------------------------------------------

/** ¿El error amerita reintentar la transaccion completa? (ADR-015) */
function esErrorReintentable(error: unknown): boolean {
  const codigo = (error as { errno?: number } | null)?.errno;
  return codigo === ERROR_DEADLOCK || codigo === ERROR_LOCK_TIMEOUT;
}

/** Espera con jitter para no re-colisionar en el reintento. */
function esperar(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Ejecuta `fn` dentro de una transaccion, con commit/rollback/release garantizados.
 *
 * Reintenta automaticamente hasta CONCURRENCIA.MAX_REINTENTOS veces ante deadlock
 * (1213) o lock wait timeout (1205), como exige el ADR-015.
 *
 * IMPORTANTE: `fn` debe contener SOLO SQL. Nada de HTTP, PDF ni impresion dentro
 * de la transaccion (regla 18): la transaccion de venta apunta a menos de 50 ms.
 * Y todo el SQL de `fn` debe usar la conexion `cx` recibida, nunca el pool global,
 * o esas sentencias quedarian fuera de la transaccion.
 */
export async function withTransaction<T>(
  fn: (cx: PoolConnection) => Promise<T>,
  opciones: { readonly pool?: Pool; readonly reintentos?: number } = {},
): Promise<T> {
  const poolElegido = opciones.pool ?? poolPrincipal;
  const maxReintentos = opciones.reintentos ?? CONCURRENCIA.MAX_REINTENTOS;

  let ultimoError: unknown;

  for (let intento = 0; intento <= maxReintentos; intento += 1) {
    const cx = await poolElegido.getConnection();
    try {
      await cx.query(`SET TRANSACTION ISOLATION LEVEL ${CONCURRENCIA.NIVEL_AISLAMIENTO}`);
      await cx.beginTransaction();

      const resultado = await fn(cx);

      await cx.commit();
      return resultado;
    } catch (error) {
      try {
        await cx.rollback();
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
          errno: (error as { errno?: number }).errno,
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

// -----------------------------------------------------------------------------
// Ciclo de vida
// -----------------------------------------------------------------------------

/** Verifica que la base responda. Lo usa el healthcheck y el arranque. */
export async function verificarConexion(): Promise<boolean> {
  const fila = await queryOne<{ vivo: number }>('SELECT 1 AS vivo');
  return fila?.vivo === 1;
}

/** Cierra los dos pools. Se llama en el apagado limpio del servidor. */
export async function cerrarPools(): Promise<void> {
  await Promise.allSettled([poolPrincipal.end(), poolReportes.end()]);
  logger.info('Pools de base de datos cerrados');
}
