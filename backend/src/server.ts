/**
 * Punto de entrada del servidor. Arranca la API y apaga limpio ante SIGTERM/SIGINT.
 */
import { crearApp } from './app';
import { env } from './config/env';
import { verificarConexion, cerrarPools } from './database/pool';
import { logger, describirError } from './utils/logger';

async function main(): Promise<void> {
  // Falla temprano si la base no responde: mejor no arrancar que aceptar ventas sin BD.
  try {
    const ok = await verificarConexion();
    if (!ok) throw new Error('La base de datos respondio pero no como se esperaba');
    logger.info('Conexion a la base de datos verificada');
  } catch (error) {
    logger.error('No se pudo conectar a la base de datos. El servidor no arranca.', describirError(error));
    process.exit(1);
  }

  const app = crearApp();
  const servidor = app.listen(env.api.puerto, env.api.host, () => {
    logger.info('GochitoSystem API en linea', {
      puerto: env.api.puerto,
      host: env.api.host,
      prefijo: env.api.prefijo,
      entorno: env.entorno,
    });
  });

  const apagar = (senal: string): void => {
    logger.info(`Senal ${senal} recibida. Apagando...`);
    servidor.close(() => {
      cerrarPools()
        .then(() => {
          logger.info('Apagado limpio completado');
          process.exit(0);
        })
        .catch((error) => {
          logger.error('Error al cerrar los pools', describirError(error));
          process.exit(1);
        });
    });
    // Red de seguridad: si algo se cuelga, forzar salida.
    setTimeout(() => process.exit(1), 10_000).unref();
  };

  process.on('SIGTERM', () => apagar('SIGTERM'));
  process.on('SIGINT', () => apagar('SIGINT'));
}

void main();
