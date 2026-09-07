/**
 * Crea un usuario contra la base a la que apunte el .env, sin pasar por la API.
 *
 *   npm run db:usuario -- --usuario Alejandrito --nombre "Alejandrito" --clave "Alejo.17"
 *   npm run db:usuario -- --usuario cajera1 --nombre "Ana" --clave "..." --rol CAJERO
 *
 * Sirve para cuando no hay una sesión de administrador a mano (pantalla de
 * Usuarios recién montada, entorno de pruebas, la clave del admin perdida).
 * Hace lo MISMO que POST /usuarios: hashea con bcrypt usando las rondas del .env
 * y deja también la fila de `usuario_sucursales`, que es la que decide a qué
 * sucursal entra. Sin esa segunda fila el usuario se crea pero no puede operar.
 *
 * No pisa a nadie por accidente: si el usuario ya existe termina en error, salvo
 * que se pase --forzar, y ahí se le cambia la clave y el rol.
 */
import bcrypt from 'bcrypt';
import { env } from '../src/config/env';
import { queryOne, ejecutar, insertar, verificarConexion, cerrarPools } from '../src/database/pool';
import { logger, describirError } from '../src/utils/logger';

/** Mismas reglas que el formulario de Usuarios, para no crear algo que la app rechace. */
const USUARIO_VALIDO = /^[a-zA-Z0-9_.]+$/;
const CLAVE_MIN = 8;
const SUCURSAL = 1;

interface Args {
  usuario: string;
  nombre: string;
  clave: string;
  rol: string;
  email: string | null;
  forzar: boolean;
}

function leerArgs(): Args {
  const argv = process.argv.slice(2);
  const valor = (nombre: string): string | null => {
    const i = argv.indexOf(`--${nombre}`);
    return i >= 0 && argv[i + 1] ? argv[i + 1]! : null;
  };

  const usuario = (valor('usuario') ?? '').trim();
  const nombre = (valor('nombre') ?? usuario).trim();
  const clave = valor('clave') ?? '';

  if (!usuario) throw new Error('Falta --usuario');
  if (!USUARIO_VALIDO.test(usuario)) {
    throw new Error('El usuario solo admite letras, números, punto y guion bajo');
  }
  if (usuario.length < 3) throw new Error('El usuario debe tener al menos 3 caracteres');
  if (clave.length < CLAVE_MIN) {
    throw new Error(`La clave debe tener al menos ${CLAVE_MIN} caracteres`);
  }

  return {
    usuario,
    nombre,
    clave,
    rol: (valor('rol') ?? 'ADMIN').toUpperCase(),
    email: valor('email'),
    forzar: argv.includes('--forzar'),
  };
}

async function principal(): Promise<void> {
  const a = leerArgs();

  if (!(await verificarConexion())) {
    throw new Error('No hay conexión con la base de datos; revisa el .env');
  }

  /*
    El rol tiene que estar VIVO. En la semilla solo queda activo ADMIN: los demás
    nacen con `eliminado_en` puesto. Crear un usuario contra un rol borrado lo deja
    entrando a un sistema sin permisos, que desde afuera se ve como "la app está
    rota" en vez de "ese rol no existe".
  */
  const rol = await queryOne<{ id: number; nombre: string }>(
    `SELECT id, nombre FROM roles
      WHERE codigo = ?::codigo_rol AND esta_activo = TRUE AND eliminado_en IS NULL
      LIMIT 1`,
    [a.rol],
  );
  if (!rol) {
    const vivos = await queryOne<{ codigos: string }>(
      `SELECT STRING_AGG(codigo::TEXT, ', ' ORDER BY codigo::TEXT) AS codigos
         FROM roles WHERE esta_activo = TRUE AND eliminado_en IS NULL`,
    );
    throw new Error(
      `El rol ${a.rol} no existe o está inactivo. Disponibles: ${vivos?.codigos ?? 'ninguno'}`,
    );
  }

  const existente = await queryOne<{ id: number }>(
    `SELECT id FROM usuarios WHERE usuario = ? AND eliminado_en IS NULL`,
    [a.usuario],
  );
  if (existente && !a.forzar) {
    throw new Error(
      `El usuario "${a.usuario}" ya existe (id ${existente.id}). `
      + 'Usa otro nombre, o --forzar para cambiarle la clave y el rol.',
    );
  }

  const hash = await bcrypt.hash(a.clave, env.seguridad.bcryptRondas);

  let id: number;
  if (existente) {
    await ejecutar(
      `UPDATE usuarios
          SET nombre_completo = ?, password_hash = ?, rol_id = ?, email = COALESCE(?, email),
              esta_activo = TRUE, intentos_fallidos = 0, bloqueado_hasta = NULL,
              debe_cambiar_password = FALSE, actualizado_en = CURRENT_TIMESTAMP
        WHERE id = ?`,
      [a.nombre, hash, rol.id, a.email, existente.id],
    );
    id = existente.id;
  } else {
    id = await insertar(
      `INSERT INTO usuarios (usuario, email, nombre_completo, password_hash, rol_id, sucursal_predeterminada_id)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [a.usuario, a.email, a.nombre, hash, rol.id, SUCURSAL],
    );
  }

  // La sucursal por la que entra. `ON CONFLICT` para que --forzar también la corrija.
  await ejecutar(
    `INSERT INTO usuario_sucursales (usuario_id, sucursal_id, rol_id) VALUES (?, ?, ?)
     ON CONFLICT (usuario_id, sucursal_id) DO UPDATE SET rol_id = EXCLUDED.rol_id`,
    [id, SUCURSAL, rol.id],
  );

  logger.info(existente ? 'Usuario actualizado' : 'Usuario creado', {
    id,
    usuario: a.usuario,
    rol: rol.nombre,
    sucursal: SUCURSAL,
  });
}

principal()
  .then(async () => {
    await cerrarPools();
    process.exit(0);
  })
  .catch(async (error) => {
    logger.error('No se pudo crear el usuario', describirError(error));
    await cerrarPools().catch(() => undefined);
    process.exit(1);
  });
