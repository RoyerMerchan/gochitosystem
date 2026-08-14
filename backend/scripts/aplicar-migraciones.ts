/**
 * Aplica las migraciones pendientes contra la base a la que apunte el .env.
 *
 *   npm run db:apply
 *
 * package.json ya apuntaba a este archivo, pero el archivo no existia: en
 * produccion el backend arrancaba con EJECUTAR_MIGRACIONES=false (la base es
 * externa y el esquema se tocaba a mano, aparte del deploy), asi que no habia
 * NINGUNA forma de aplicar una migracion. Por eso 0005 se quedo sin aplicar y el
 * estado de cuenta reventaba con "column a.cambio_moneda does not exist".
 *
 * Desde entonces el despliegue las aplica solo (docker-compose.prod.yml monta
 * database/migraciones en el contenedor y pone EJECUTAR_MIGRACIONES=true). Este
 * comando sigue siendo el camino para aplicarlas a mano contra la base que diga
 * el .env, sin reiniciar nada.
 *
 * A diferencia del arranque del servidor —donde una migracion rota se registra y
 * se sigue, para no dejar la app caida—, aca una que falle termina en codigo de
 * salida 1 y con el nombre en pantalla. Un comando que se ejecuta a proposito
 * tiene que gritar cuando no hizo lo que le pediste.
 */
import fs from 'node:fs';
import { env } from '../src/config/env';
import { ejecutarMigracionesPendientes, resolverDir } from '../src/database/migrador';
import { pool, verificarConexion, cerrarPools } from '../src/database/pool';
import { logger, describirError } from '../src/utils/logger';

/** Versiones ya registradas en la tabla de control. */
async function versionesAplicadas(): Promise<Set<string>> {
  const { rows } = await pool.query<{ version: string }>('SELECT version FROM migraciones');
  return new Set(rows.map((r) => r.version));
}

async function principal(): Promise<void> {
  if (!(await verificarConexion())) {
    throw new Error('No hay conexion con la base de datos; revisa el .env');
  }

  const dir = resolverDir(env.migraciones.dir);
  if (!dir) throw new Error('No se encontro la carpeta database/migraciones');
  logger.info('Carpeta de migraciones', { dir });

  await ejecutarMigracionesPendientes(env.migraciones.dir);

  // El migrador registra los fallos en el log y sigue de largo. Se comprueba
  // contra la tabla de control cuales quedaron fuera y se reporta como error.
  const aplicadas = await versionesAplicadas();
  const faltantes = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .sort()
    .filter((f) => !aplicadas.has(f.split('_')[0] ?? f));

  if (faltantes.length > 0) {
    throw new Error(
      `Quedaron migraciones sin aplicar: ${faltantes.join(', ')}. `
      + 'El detalle del fallo esta arriba, en el log del migrador.',
    );
  }
  logger.info('Todas las migraciones estan aplicadas', { total: aplicadas.size });
}

principal()
  .then(async () => {
    await cerrarPools();
    process.exit(0);
  })
  .catch(async (error) => {
    logger.error('Fallaron las migraciones', describirError(error));
    await cerrarPools().catch(() => undefined);
    process.exit(1);
  });
