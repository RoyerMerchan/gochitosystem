/**
 * Logica de autenticacion: login, refresh rotativo, logout y cambio de password.
 *
 * Refresh tokens (ADR de seguridad):
 *   - Se guarda solo el SHA-256 del token en `sesiones.token_hash`, nunca el token.
 *   - Cada refresh ROTA: revoca el token usado y emite uno nuevo en la misma familia.
 *   - Si llega un refresh ya revocado (reuso), se revoca toda la familia: es senal
 *     de robo del token.
 */
import crypto from 'node:crypto';
import bcrypt from 'bcrypt';
import jwt, { type SignOptions } from 'jsonwebtoken';
import { env } from '../../config/env';
import { MOTIVO_REVOCACION } from '../../config/constantes';
import { NoAutenticado, ReglaNegocio } from '../../errores/AppError';
import {
  query,
  queryOne,
  ejecutar,
  insertar,
  withTransaction,
  type Ejecutor,
} from '../../database/pool';
import type { Id, PayloadJwt, UsuarioAutenticado } from '../../tipos/comunes';
import type { EntradaLogin } from './auth.schemas';

/** Minutos que se bloquea la cuenta tras superar el limite de intentos. */
const MAX_INTENTOS = 5;
const MINUTOS_BLOQUEO = 15;

interface FilaUsuarioAuth {
  id: number;
  usuario: string;
  nombre_completo: string;
  password_hash: string;
  rol_id: number;
  rol_codigo: string;
  sucursal_predeterminada_id: number | null;
  intentos_fallidos: number;
  bloqueado_hasta: string | null;
  debe_cambiar_password: number;
  esta_activo: number;
  eliminado_en: string | null;
}

export interface TokensSesion {
  readonly accessToken: string;
  readonly refreshToken: string;
  readonly expiraEn: string;
}

export interface ResultadoLogin extends TokensSesion {
  readonly usuario: UsuarioAutenticado;
}

/** SHA-256 en hex de un texto (para guardar el refresh token sin exponerlo). */
function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/** Genera un refresh token opaco de alta entropia. */
function generarRefreshToken(): string {
  return crypto.randomBytes(48).toString('base64url');
}

/** Firma el access token JWT. */
function firmarAccessToken(usuario: UsuarioAutenticado, sid: string): string {
  const payload: PayloadJwt = {
    sub: String(usuario.id),
    usuario: usuario.usuario,
    sucursalId: usuario.sucursalId,
    sid,
  };
  const opciones: SignOptions = {
    expiresIn: env.seguridad.jwtExpiraEn as SignOptions['expiresIn'],
  };
  return jwt.sign(payload, env.seguridad.jwtSecreto, opciones);
}

/** Mapea la fila de BD al usuario del dominio. */
function aUsuarioDominio(fila: FilaUsuarioAuth): UsuarioAutenticado {
  return {
    id: fila.id,
    usuario: fila.usuario,
    nombreCompleto: fila.nombre_completo,
    rolId: fila.rol_id,
    rolCodigo: fila.rol_codigo,
    sucursalId: fila.sucursal_predeterminada_id ?? 1,
    debeCambiarPassword: fila.debe_cambiar_password === 1,
  };
}

/** Crea una sesion (refresh token) y devuelve el token en claro una sola vez. */
async function crearSesion(
  usuarioId: Id,
  familiaId: string,
  ejecutor: Ejecutor,
  ip?: string,
  userAgent?: string,
): Promise<{ refreshToken: string; sesionId: number }> {
  const refreshToken = generarRefreshToken();
  const expira = new Date(Date.now() + diasAMs(env.seguridad.jwtRefreshExpiraEn));

  const sesionId = await insertar(
    `INSERT INTO sesiones (usuario_id, token_hash, familia_id, ip, user_agent, expira_en)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      usuarioId,
      hashToken(refreshToken),
      familiaId,
      ip ? ipABuffer(ip) : null,
      userAgent ?? null,
      formatearFecha(expira),
    ],
    ejecutor,
  );

  return { refreshToken, sesionId };
}

/** Convierte "7d" / "15m" a milisegundos (solo d, h, m). */
function diasAMs(valor: string): number {
  const m = /^(\d+)([dhm])$/.exec(valor.trim());
  if (!m) return 7 * 24 * 60 * 60 * 1000;
  const n = Number(m[1]);
  const unidad = m[2];
  if (unidad === 'd') return n * 24 * 60 * 60 * 1000;
  if (unidad === 'h') return n * 60 * 60 * 1000;
  return n * 60 * 1000;
}

function formatearFecha(fecha: Date): string {
  return fecha.toISOString().slice(0, 23).replace('T', ' ');
}

/** IPv4/IPv6 a Buffer para la columna VARBINARY(16). Best-effort. */
function ipABuffer(ip: string): Buffer | null {
  try {
    if (ip.includes('.')) {
      const partes = ip.split('.').map((p) => Number.parseInt(p, 10));
      if (partes.length === 4 && partes.every((n) => n >= 0 && n <= 255)) {
        return Buffer.from(partes);
      }
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Autentica por usuario o email + contrasena.
 * Maneja el contador de intentos fallidos y el bloqueo temporal.
 */
export async function login(
  entrada: EntradaLogin,
  contexto: { ip?: string; userAgent?: string } = {},
): Promise<ResultadoLogin> {
  const fila = await queryOne<FilaUsuarioAuth>(
    `SELECT u.id, u.usuario, u.nombre_completo, u.password_hash, u.rol_id,
            r.codigo AS rol_codigo, u.sucursal_predeterminada_id,
            u.intentos_fallidos, u.bloqueado_hasta, u.debe_cambiar_password,
            u.esta_activo, u.eliminado_en
       FROM usuarios u
       JOIN roles r ON r.id = u.rol_id
      WHERE (u.usuario = ? OR u.email = ?) AND u.eliminado_en IS NULL
      LIMIT 1`,
    [entrada.identificador, entrada.identificador],
  );

  // Mismo error para "no existe" y "clave incorrecta": no se filtra que usuarios existen.
  if (!fila) {
    throw new NoAutenticado('CREDENCIALES_INVALIDAS');
  }

  if (fila.bloqueado_hasta && new Date(fila.bloqueado_hasta) > new Date()) {
    throw new ReglaNegocio('USUARIO_BLOQUEADO');
  }
  if (fila.esta_activo !== 1) {
    throw new ReglaNegocio('USUARIO_INACTIVO');
  }

  const coincide = await bcrypt.compare(entrada.password, fila.password_hash);
  if (!coincide) {
    await registrarIntentoFallido(fila.id, fila.intentos_fallidos);
    throw new NoAutenticado('CREDENCIALES_INVALIDAS');
  }

  // Login correcto: se resetea el contador y se emiten los tokens en una transaccion.
  const familiaId = crypto.randomUUID();
  return withTransaction(async (cx) => {
    await ejecutar(
      `UPDATE usuarios
          SET intentos_fallidos = 0, bloqueado_hasta = NULL, ultimo_acceso_en = NOW(3)
        WHERE id = ?`,
      [fila.id],
      cx,
    );

    const { refreshToken, sesionId } = await crearSesion(
      fila.id,
      familiaId,
      cx,
      contexto.ip,
      contexto.userAgent,
    );

    const usuario = aUsuarioDominio(fila);
    const accessToken = firmarAccessToken(usuario, String(sesionId));

    return {
      usuario,
      accessToken,
      refreshToken,
      expiraEn: env.seguridad.jwtExpiraEn,
    };
  });
}

/** Suma un intento fallido y bloquea al superar el limite. */
async function registrarIntentoFallido(usuarioId: Id, intentosActuales: number): Promise<void> {
  const nuevos = intentosActuales + 1;
  if (nuevos >= MAX_INTENTOS) {
    const hasta = formatearFecha(new Date(Date.now() + MINUTOS_BLOQUEO * 60 * 1000));
    await ejecutar(
      `UPDATE usuarios SET intentos_fallidos = ?, bloqueado_hasta = ? WHERE id = ?`,
      [nuevos, hasta, usuarioId],
    );
  } else {
    await ejecutar(`UPDATE usuarios SET intentos_fallidos = ? WHERE id = ?`, [nuevos, usuarioId]);
  }
}

/**
 * Rota el refresh token: valida el actual, lo revoca y emite uno nuevo.
 * Detecta reuso de un token ya revocado y en ese caso mata la familia entera.
 */
export async function refrescar(
  refreshToken: string,
  contexto: { ip?: string; userAgent?: string } = {},
): Promise<ResultadoLogin> {
  const tokenHash = hashToken(refreshToken);

  const sesion = await queryOne<{
    id: number;
    usuario_id: number;
    familia_id: string;
    expira_en: string;
    revocada_en: string | null;
  }>(
    `SELECT id, usuario_id, familia_id, expira_en, revocada_en
       FROM sesiones WHERE token_hash = ? LIMIT 1`,
    [tokenHash],
  );

  if (!sesion) {
    throw new NoAutenticado('TOKEN_INVALIDO');
  }

  // Reuso de un token ya revocado: se revoca toda la familia por seguridad.
  if (sesion.revocada_en !== null) {
    await ejecutar(
      `UPDATE sesiones SET revocada_en = NOW(3), motivo_revocacion = ?
        WHERE familia_id = ? AND revocada_en IS NULL`,
      [MOTIVO_REVOCACION.REUSO_DETECTADO, sesion.familia_id],
    );
    throw new NoAutenticado('TOKEN_REUSADO');
  }

  if (new Date(sesion.expira_en) < new Date()) {
    throw new NoAutenticado('TOKEN_EXPIRADO');
  }

  const fila = await queryOne<FilaUsuarioAuth>(
    `SELECT u.id, u.usuario, u.nombre_completo, u.password_hash, u.rol_id,
            r.codigo AS rol_codigo, u.sucursal_predeterminada_id,
            u.intentos_fallidos, u.bloqueado_hasta, u.debe_cambiar_password,
            u.esta_activo, u.eliminado_en
       FROM usuarios u JOIN roles r ON r.id = u.rol_id
      WHERE u.id = ? AND u.eliminado_en IS NULL LIMIT 1`,
    [sesion.usuario_id],
  );
  if (!fila || fila.esta_activo !== 1) {
    throw new NoAutenticado('TOKEN_INVALIDO');
  }

  return withTransaction(async (cx) => {
    const { refreshToken: nuevoRefresh, sesionId } = await crearSesion(
      sesion.usuario_id,
      sesion.familia_id,
      cx,
      contexto.ip,
      contexto.userAgent,
    );

    await ejecutar(
      `UPDATE sesiones SET revocada_en = NOW(3), motivo_revocacion = ?, reemplazada_por_id = ?
        WHERE id = ?`,
      [MOTIVO_REVOCACION.ROTACION, sesionId, sesion.id],
      cx,
    );

    const usuario = aUsuarioDominio(fila);
    const accessToken = firmarAccessToken(usuario, String(sesionId));
    return { usuario, accessToken, refreshToken: nuevoRefresh, expiraEn: env.seguridad.jwtExpiraEn };
  });
}

/** Revoca el refresh token indicado (logout de la sesion actual). */
export async function logout(refreshToken: string): Promise<void> {
  await ejecutar(
    `UPDATE sesiones SET revocada_en = NOW(3), motivo_revocacion = ?
      WHERE token_hash = ? AND revocada_en IS NULL`,
    [MOTIVO_REVOCACION.LOGOUT, hashToken(refreshToken)],
  );
}

/** Cambia la contrasena del usuario y revoca todas sus sesiones. */
export async function cambiarPassword(
  usuarioId: Id,
  passwordActual: string,
  passwordNueva: string,
): Promise<void> {
  const fila = await queryOne<{ password_hash: string }>(
    `SELECT password_hash FROM usuarios WHERE id = ? AND eliminado_en IS NULL LIMIT 1`,
    [usuarioId],
  );
  if (!fila) throw new NoAutenticado('TOKEN_INVALIDO');

  const coincide = await bcrypt.compare(passwordActual, fila.password_hash);
  if (!coincide) throw new ReglaNegocio('PASSWORD_ACTUAL_INCORRECTA');

  const nuevoHash = await bcrypt.hash(passwordNueva, env.seguridad.bcryptRondas);

  await withTransaction(async (cx) => {
    await ejecutar(
      `UPDATE usuarios SET password_hash = ?, debe_cambiar_password = 0 WHERE id = ?`,
      [nuevoHash, usuarioId],
      cx,
    );
    await ejecutar(
      `UPDATE sesiones SET revocada_en = NOW(3), motivo_revocacion = ?
        WHERE usuario_id = ? AND revocada_en IS NULL`,
      [MOTIVO_REVOCACION.ADMIN, usuarioId],
      cx,
    );
  });
}

/** Devuelve el perfil y los permisos del usuario autenticado. */
export async function perfil(usuario: UsuarioAutenticado): Promise<{
  usuario: UsuarioAutenticado;
  permisos: string[];
}> {
  const filas = await query<{ codigo: string }>(
    `SELECT p.codigo FROM rol_permisos rp
       JOIN permisos p ON p.id = rp.permiso_id WHERE rp.rol_id = ?`,
    [usuario.rolId],
  );
  return { usuario, permisos: filas.map((f) => f.codigo) };
}
