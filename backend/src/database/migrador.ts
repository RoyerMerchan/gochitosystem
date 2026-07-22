/**
 * Migrador de esquema. Se ejecuta al arrancar el backend (server.ts) y aplica los
 * archivos database/migraciones/NNNN_*.sql que aún no se hayan aplicado, en orden.
 *
 * - Registra cada migración aplicada en la tabla `migraciones` (idempotente: no se
 *   repite lo ya aplicado).
 * - Cada archivo se ejecuta como un lote (simple query protocol de pg); si algo falla,
 *   ese archivo se revierte, se registra el error y el servidor arranca igual —así un
 *   problema de migración no deja la app caída; se reintenta en el próximo deploy.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { pool } from './pool';
import { logger, describirError } from '../utils/logger';

/** Resuelve la carpeta de migraciones: variable de entorno o rutas por defecto. */
function resolverDir(dirConfigurado: string | null): string | null {
  const candidatos = [
    dirConfigurado,
    path.resolve(process.cwd(), 'migraciones'), // contenedor: volumen en /app/migraciones
    path.resolve(process.cwd(), '..', 'database', 'migraciones'), // dev: backend/ -> repo/database
    path.resolve(__dirname, '..', '..', '..', 'database', 'migraciones'),
  ].filter((c): c is string => Boolean(c));
  return candidatos.find((c) => fs.existsSync(c)) ?? null;
}

export async function ejecutarMigracionesPendientes(dirConfigurado: string | null): Promise<void> {
  const dir = resolverDir(dirConfigurado);
  if (!dir) {
    logger.warn('No se encontró la carpeta de migraciones; se omite el migrador');
    return;
  }

  const archivos = fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
  if (archivos.length === 0) {
    logger.info('Sin migraciones que aplicar', { dir });
    return;
  }

  // Tabla de control (por si aún no existe el esquema).
  await pool.query(`CREATE TABLE IF NOT EXISTS migraciones (
    version      VARCHAR(32)  PRIMARY KEY,
    nombre       VARCHAR(160) NOT NULL,
    checksum     CHAR(64)     NOT NULL,
    aplicada_en  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    duracion_ms  INTEGER      NOT NULL DEFAULT 0,
    aplicada_por VARCHAR(60)
  );`);

  const { rows } = await pool.query<{ version: string }>('SELECT version FROM migraciones');
  const aplicadas = new Set(rows.map((r: { version: string }) => r.version));

  let nuevas = 0;
  for (const archivo of archivos) {
    const version = archivo.split('_')[0] ?? archivo;
    if (aplicadas.has(version)) continue;

    const sql = fs.readFileSync(path.join(dir, archivo), 'utf8');
    const checksum = crypto.createHash('sha256').update(sql).digest('hex');
    const inicio = Date.now();
    const cliente = await pool.connect();
    try {
      logger.info('Aplicando migración', { archivo });
      await cliente.query(sql);
      await cliente.query(
        `INSERT INTO migraciones (version, nombre, checksum, duracion_ms, aplicada_por)
         VALUES ($1, $2, $3, $4, 'backend')`,
        [version, archivo, checksum, Date.now() - inicio],
      );
      nuevas += 1;
      logger.info('Migración aplicada', { archivo, ms: Date.now() - inicio });
    } catch (error) {
      logger.error('Falló una migración; el servidor arranca igual y se reintentará', {
        archivo,
        ...describirError(error),
      });
    } finally {
      cliente.release();
    }
  }

  logger.info('Migrador finalizado', { total: archivos.length, nuevas });
}
