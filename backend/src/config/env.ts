/**
 * Carga y validacion de variables de entorno.
 *
 * El .env vive en la RAIZ del repositorio (un solo archivo para backend y frontend),
 * asi que se busca hacia arriba desde este archivo. Si falta cualquier variable
 * obligatoria el proceso NO arranca: es preferible fallar al iniciar que descubrir
 * un JWT_SECRET vacio en produccion.
 */
import path from 'node:path';
import fs from 'node:fs';
import dotenv from 'dotenv';
import { z } from 'zod';

/** Ubica el .env probando primero backend/.env y luego la raiz del repositorio. */
function cargarArchivoEnv(): void {
  const candidatos = [
    path.resolve(process.cwd(), '.env'),
    path.resolve(process.cwd(), '..', '.env'),
    path.resolve(__dirname, '..', '..', '.env'),
    path.resolve(__dirname, '..', '..', '..', '.env'),
  ];

  for (const ruta of candidatos) {
    if (fs.existsSync(ruta)) {
      dotenv.config({ path: ruta });
      return;
    }
  }
  // Sin archivo: se sigue adelante por si las variables vienen del entorno (Docker).
  dotenv.config();
}

cargarArchivoEnv();

/** Entero a partir de string, con mensaje en espanol. */
const entero = (nombre: string) =>
  z
    .string({ required_error: `Falta la variable de entorno ${nombre}` })
    .trim()
    .regex(/^-?\d+$/, `${nombre} debe ser un numero entero`)
    .transform((v) => Number.parseInt(v, 10));

const booleano = z
  .string()
  .trim()
  .toLowerCase()
  .transform((v) => v === '1' || v === 'true' || v === 'si');

const esquemaEnv = z.object({
  // Entorno
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  TZ: z.string().trim().min(1).default('America/Caracas'),

  // API
  // Railway (y otras PaaS) inyectan PORT. Si existe, tiene prioridad sobre API_PORT.
  API_PORT: entero('API_PORT').pipe(z.number().int().min(1).max(65535)).default('4000'),
  PORT: entero('PORT').pipe(z.number().int().min(1).max(65535)).optional(),
  API_HOST: z.string().trim().min(1).default('0.0.0.0'),
  API_PREFIX: z
    .string()
    .trim()
    .startsWith('/', 'API_PREFIX debe empezar con "/"')
    .default('/api/v1'),
  CORS_ORIGINS: z.string().trim().min(1),

  // Base de datos
  DB_HOST: z.string().trim().min(1),
  DB_PORT: entero('DB_PORT').pipe(z.number().int().min(1).max(65535)),
  DB_NAME: z.string().trim().min(1),
  DB_USER: z.string().trim().min(1),
  DB_PASSWORD: z.string().min(1, 'DB_PASSWORD no puede estar vacia'),
  DB_CONNECTION_LIMIT: entero('DB_CONNECTION_LIMIT')
    .pipe(z.number().int().min(1).max(200))
    .default('10'),
  DB_TIMEZONE: z.string().trim().min(1).default('-04:00'),

  // Seguridad / autenticacion
  JWT_SECRET: z.string().min(32, 'JWT_SECRET debe tener al menos 32 caracteres'),
  // Sesion de 1 dia: el cajero trabaja toda la jornada sin re-loguearse.
  JWT_EXPIRES_IN: z.string().trim().min(1).default('1d'),
  JWT_REFRESH_SECRET: z
    .string()
    .min(32, 'JWT_REFRESH_SECRET debe tener al menos 32 caracteres'),
  JWT_REFRESH_EXPIRES_IN: z.string().trim().min(1).default('30d'),
  BCRYPT_ROUNDS: entero('BCRYPT_ROUNDS')
    .pipe(z.number().int().min(10).max(15))
    .default('12'),
  RATE_LIMIT_WINDOW_MS: entero('RATE_LIMIT_WINDOW_MS')
    .pipe(z.number().int().min(1000))
    .default('900000'),
  RATE_LIMIT_MAX: entero('RATE_LIMIT_MAX').pipe(z.number().int().min(1)).default('300'),
  RATE_LIMIT_LOGIN_MAX: entero('RATE_LIMIT_LOGIN_MAX')
    .pipe(z.number().int().min(1))
    .default('10'),

  // Archivos
  UPLOAD_DIR: z.string().trim().min(1).default('./uploads'),
  UPLOAD_MAX_SIZE_MB: entero('UPLOAD_MAX_SIZE_MB')
    .pipe(z.number().int().min(1).max(100))
    .default('5'),
  LOGO_MAX_SIZE_MB: entero('LOGO_MAX_SIZE_MB')
    .pipe(z.number().int().min(1).max(50))
    .default('2'),

  // Negocio (valores iniciales; la tabla `configuracion` manda una vez sembrada)
  NEGOCIO_NOMBRE: z.string().trim().min(1).default('GochitoSystem'),
  NEGOCIO_MONEDA: z.string().trim().length(3).default('COP'),
  NEGOCIO_MONEDA_SIMBOLO: z.string().trim().min(1).default('$'),
  NEGOCIO_IVA_DEFECTO: entero('NEGOCIO_IVA_DEFECTO')
    .pipe(z.number().int().min(0).max(100))
    .default('19'),
  NEGOCIO_DECIMALES: entero('NEGOCIO_DECIMALES')
    .pipe(z.number().int().min(0).max(4))
    .default('0'),
  NEGOCIO_REDONDEO: entero('NEGOCIO_REDONDEO')
    .pipe(z.number().int().min(1))
    .default('50'),

  // Logs
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  LOG_DIR: z.string().trim().min(1).default('./logs'),

  // Backups
  BACKUP_DIR: z.string().trim().min(1).default('./backups'),
  BACKUP_RETENTION_DAYS: entero('BACKUP_RETENTION_DAYS')
    .pipe(z.number().int().min(1))
    .default('7'),
});

const resultado = esquemaEnv.safeParse(process.env);

if (!resultado.success) {
  const detalles = resultado.error.issues
    .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
    .join('\n');
  // No se usa el logger aqui: el logger depende del env que acaba de fallar.
  console.error(
    `\n[GochitoSystem] Configuracion invalida. El servidor no puede arrancar:\n${detalles}\n`,
  );
  process.exit(1);
}

const crudo = resultado.data;

/** Zona horaria fija del proyecto: todo el dominio opera en America/Bogota. */
process.env.TZ = crudo.TZ;

export const env = {
  entorno: crudo.NODE_ENV,
  esProduccion: crudo.NODE_ENV === 'production',
  esDesarrollo: crudo.NODE_ENV === 'development',
  esPrueba: crudo.NODE_ENV === 'test',
  zonaHoraria: crudo.TZ,

  api: {
    // PORT (Railway/Render/etc.) manda; si no, el API_PORT del .env.
    puerto: crudo.PORT ?? crudo.API_PORT,
    host: crudo.API_HOST,
    prefijo: crudo.API_PREFIX,
    origenesCors: crudo.CORS_ORIGINS.split(',')
      .map((o) => o.trim())
      .filter((o) => o.length > 0),
  },

  db: {
    host: crudo.DB_HOST,
    puerto: crudo.DB_PORT,
    nombre: crudo.DB_NAME,
    usuario: crudo.DB_USER,
    password: crudo.DB_PASSWORD,
    limiteConexiones: crudo.DB_CONNECTION_LIMIT,
    zonaHoraria: crudo.DB_TIMEZONE,
  },

  seguridad: {
    jwtSecreto: crudo.JWT_SECRET,
    jwtExpiraEn: crudo.JWT_EXPIRES_IN,
    jwtRefreshSecreto: crudo.JWT_REFRESH_SECRET,
    jwtRefreshExpiraEn: crudo.JWT_REFRESH_EXPIRES_IN,
    bcryptRondas: crudo.BCRYPT_ROUNDS,
    rateLimitVentanaMs: crudo.RATE_LIMIT_WINDOW_MS,
    rateLimitMax: crudo.RATE_LIMIT_MAX,
    rateLimitLoginMax: crudo.RATE_LIMIT_LOGIN_MAX,
  },

  archivos: {
    directorioSubidas: crudo.UPLOAD_DIR,
    tamanoMaximoMb: crudo.UPLOAD_MAX_SIZE_MB,
    tamanoMaximoLogoMb: crudo.LOGO_MAX_SIZE_MB,
  },

  negocio: {
    nombre: crudo.NEGOCIO_NOMBRE,
    moneda: crudo.NEGOCIO_MONEDA,
    monedaSimbolo: crudo.NEGOCIO_MONEDA_SIMBOLO,
    ivaDefecto: crudo.NEGOCIO_IVA_DEFECTO,
    decimales: crudo.NEGOCIO_DECIMALES,
    redondeoMultiplo: crudo.NEGOCIO_REDONDEO,
  },

  logs: {
    nivel: crudo.LOG_LEVEL,
    directorio: crudo.LOG_DIR,
  },

  backups: {
    directorio: crudo.BACKUP_DIR,
    diasRetencion: crudo.BACKUP_RETENTION_DAYS,
  },
} as const;

export type Env = typeof env;
