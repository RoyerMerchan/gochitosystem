/**
 * Usuarios y roles.
 *   default      -> /api/v1/usuarios  (CRUD de usuarios, para que el dueño cree cajeros)
 *   routerRoles  -> /api/v1/roles     (listar roles para el selector)
 *
 * Cada venta queda asociada a su usuario (ventas.usuario_id); crear usuarios aquí
 * permite que cada cajero entre con su sesión y sus ventas queden a su nombre.
 */
import { Router } from 'express';
import { z } from 'zod';
import bcrypt from 'bcrypt';
import { validar, datosBody, datosParams, esquemaParamsId } from '../../middlewares/validar';
import { autenticar } from '../../middlewares/autenticacion';
import { requierePermiso } from '../../middlewares/autorizacion';
import { enviarOk, enviarCreado } from '../../utils/respuesta';
import { Conflicto, NoEncontrado } from '../../errores/AppError';
import { env } from '../../config/env';
import { query, queryOne, ejecutar, insertar } from '../../database/pool';

const router = Router();
router.use(autenticar);

interface UsuarioFila {
  id: number; usuario: string; email: string | null; nombre_completo: string;
  rol_id: number; rol_nombre: string; esta_activo: boolean; ultimo_acceso_en: string | null;
}

const SELECT = `SELECT u.id, u.usuario, u.email, u.nombre_completo, u.rol_id, r.nombre AS rol_nombre,
       u.esta_activo, u.ultimo_acceso_en FROM usuarios u JOIN roles r ON r.id = u.rol_id`;

const esquemaCrear = z.object({
  usuario: z.string().trim().min(3, 'Mínimo 3 caracteres').max(60).regex(/^[a-zA-Z0-9_.]+$/, 'Solo letras, números, punto y guion bajo'),
  nombreCompleto: z.string().trim().min(1, 'El nombre es obligatorio').max(140),
  email: z.string().trim().email('Correo inválido').max(160).optional().or(z.literal('')),
  password: z.string().min(8, 'La contraseña debe tener al menos 8 caracteres').max(200),
  rolId: z.coerce.number().int().positive(),
});

const esquemaEditar = z.object({
  nombreCompleto: z.string().trim().min(1).max(140),
  email: z.string().trim().email('Correo inválido').max(160).optional().or(z.literal('')),
  rolId: z.coerce.number().int().positive(),
});

router.get('/', requierePermiso('usuarios.ver'), async (_req, res, next) => {
  try {
    enviarOk(res, await query<UsuarioFila>(`${SELECT} WHERE u.eliminado_en IS NULL ORDER BY u.nombre_completo`));
  } catch (e) { next(e); }
});

router.post('/', requierePermiso('usuarios.crear'), validar({ body: esquemaCrear }), async (req, res, next) => {
  try {
    const e = datosBody<z.infer<typeof esquemaCrear>>(req);
    const hash = await bcrypt.hash(e.password, env.seguridad.bcryptRondas);
    let id: number;
    try {
      id = await insertar(
        `INSERT INTO usuarios (usuario, email, nombre_completo, password_hash, rol_id, sucursal_predeterminada_id)
         VALUES (?, ?, ?, ?, ?, 1)`,
        [e.usuario, e.email || null, e.nombreCompleto, hash, e.rolId],
      );
    } catch (err) {
      if ((err as { code?: string }).code === '23505') throw new Conflicto('USUARIO_DUPLICADO');
      throw err;
    }
    await ejecutar(`INSERT INTO usuario_sucursales (usuario_id, sucursal_id, rol_id) VALUES (?, 1, ?) ON CONFLICT DO NOTHING`, [id, e.rolId]);
    enviarCreado(res, await queryOne<UsuarioFila>(`${SELECT} WHERE u.id = ?`, [id]));
  } catch (e) { next(e); }
});

router.put('/:id', requierePermiso('usuarios.editar'), validar({ params: esquemaParamsId, body: esquemaEditar }), async (req, res, next) => {
  try {
    const id = datosParams<{ id: number }>(req).id;
    const e = datosBody<z.infer<typeof esquemaEditar>>(req);
    const existe = await queryOne<{ id: number }>(`SELECT id FROM usuarios WHERE id = ? AND eliminado_en IS NULL`, [id]);
    if (!existe) throw new NoEncontrado('USUARIO_NO_ENCONTRADO');
    await ejecutar(
      `UPDATE usuarios SET nombre_completo=?, email=?, rol_id=? WHERE id=?`,
      [e.nombreCompleto, e.email || null, e.rolId, id],
    );
    enviarOk(res, await queryOne<UsuarioFila>(`${SELECT} WHERE u.id = ?`, [id]));
  } catch (e) { next(e); }
});

/** Restablece la contraseña de un usuario (el admin le pone una nueva). */
router.post('/:id/password', requierePermiso('usuarios.editar'),
  validar({ params: esquemaParamsId, body: z.object({ password: z.string().min(8, 'Mínimo 8 caracteres').max(200) }) }), async (req, res, next) => {
    try {
      const id = datosParams<{ id: number }>(req).id;
      const { password } = datosBody<{ password: string }>(req);
      const hash = await bcrypt.hash(password, env.seguridad.bcryptRondas);
      const r = await ejecutar(`UPDATE usuarios SET password_hash = ?, debe_cambiar_password = FALSE WHERE id = ? AND eliminado_en IS NULL`, [hash, id]);
      if (r.rowCount === 0) throw new NoEncontrado('USUARIO_NO_ENCONTRADO');
      // Revoca las sesiones del usuario para forzar reingreso.
      await ejecutar(`UPDATE sesiones SET revocada_en = NOW(), motivo_revocacion = 'ADMIN' WHERE usuario_id = ? AND revocada_en IS NULL`, [id]);
      enviarOk(res, { mensaje: 'Contraseña restablecida' });
    } catch (e) { next(e); }
  });

// -----------------------------------------------------------------------------
export const routerRoles = Router();
routerRoles.use(autenticar);

routerRoles.get('/', async (_req, res, next) => {
  try {
    enviarOk(res, await query(`SELECT id, codigo, nombre, descripcion FROM roles WHERE eliminado_en IS NULL AND esta_activo = TRUE ORDER BY id`));
  } catch (e) { next(e); }
});

export default router;
