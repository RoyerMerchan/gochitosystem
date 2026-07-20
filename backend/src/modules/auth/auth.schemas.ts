/** Esquemas de validacion del modulo de autenticacion. */
import { z } from 'zod';

export const esquemaLogin = z.object({
  identificador: z
    .string({ required_error: 'El usuario o email es obligatorio' })
    .trim()
    .min(1, 'El usuario o email es obligatorio')
    .max(160),
  password: z
    .string({ required_error: 'La contrasena es obligatoria' })
    .min(1, 'La contrasena es obligatoria')
    .max(200),
});
export type EntradaLogin = z.infer<typeof esquemaLogin>;

export const esquemaRefresh = z.object({
  refreshToken: z
    .string({ required_error: 'El refresh token es obligatorio' })
    .trim()
    .min(20, 'Refresh token invalido'),
});
export type EntradaRefresh = z.infer<typeof esquemaRefresh>;

export const esquemaCambiarPassword = z.object({
  passwordActual: z.string().min(1, 'La contrasena actual es obligatoria'),
  passwordNueva: z
    .string()
    .min(8, 'La nueva contrasena debe tener al menos 8 caracteres')
    .max(200)
    .regex(/[A-Za-z]/, 'Debe contener al menos una letra')
    .regex(/\d/, 'Debe contener al menos un numero'),
});
export type EntradaCambiarPassword = z.infer<typeof esquemaCambiarPassword>;
