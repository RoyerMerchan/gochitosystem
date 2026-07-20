/**
 * Construccion de la aplicacion Express.
 *
 * Orden de middlewares (importa):
 *   helmet -> cors -> json -> requestId -> morgan -> rutas -> 404 -> errores.
 * El manejador de errores va SIEMPRE al final, con sus 4 parametros.
 */
import express, { type Application } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import { env } from './config/env';
import { requestId } from './middlewares/requestId';
import { rutaNoEncontrada, manejadorErrores } from './middlewares/manejadorErrores';
import rutas from './routes/index';

export function crearApp(): Application {
  const app = express();

  // Detras de un proxy (nginx/docker) para que req.ip sea la IP real del cliente.
  app.set('trust proxy', 1);

  app.use(helmet());
  app.use(
    cors({
      origin: env.api.origenesCors,
      credentials: true,
    }),
  );
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: false }));
  app.use(requestId);

  if (!env.esPrueba) {
    app.use(
      morgan(env.esDesarrollo ? 'dev' : 'combined', {
        skip: (req) => req.path === `${env.api.prefijo}/salud`,
      }),
    );
  }

  // Rate limit global (el login tiene su propio limite mas estricto).
  app.use(
    rateLimit({
      windowMs: env.seguridad.rateLimitVentanaMs,
      max: env.seguridad.rateLimitMax,
      standardHeaders: true,
      legacyHeaders: false,
      message: {
        ok: false,
        error: { codigo: 'DEMASIADAS_SOLICITUDES', mensaje: 'Demasiadas solicitudes.' },
      },
    }),
  );

  app.use(env.api.prefijo, rutas);

  app.use(rutaNoEncontrada);
  app.use(manejadorErrores);

  return app;
}
