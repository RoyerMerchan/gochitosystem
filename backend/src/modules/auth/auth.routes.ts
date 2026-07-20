/**
 * Rutas de autenticacion: /api/v1/auth
 *
 * login, refresh y logout son publicas (no exigen token).
 * me y cambiar-password exigen access token valido.
 */
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { env } from '../../config/env';
import { validar } from '../../middlewares/validar';
import { autenticar } from '../../middlewares/autenticacion';
import {
  esquemaLogin,
  esquemaRefresh,
  esquemaCambiarPassword,
} from './auth.schemas';
import * as ctrl from './auth.controller';

const router = Router();

/** El login se protege con un rate limit mas estricto contra fuerza bruta. */
const limiteLogin = rateLimit({
  windowMs: env.seguridad.rateLimitVentanaMs,
  max: env.seguridad.rateLimitLoginMax,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    ok: false,
    error: { codigo: 'RATE_LIMIT', mensaje: 'Demasiados intentos, espere un momento' },
  },
});

router.post('/login', limiteLogin, validar({ body: esquemaLogin }), ctrl.postLogin);
router.post('/refresh', validar({ body: esquemaRefresh }), ctrl.postRefresh);
router.post('/logout', validar({ body: esquemaRefresh }), ctrl.postLogout);
router.get('/me', autenticar, ctrl.getMe);
router.post(
  '/cambiar-password',
  autenticar,
  validar({ body: esquemaCambiarPassword }),
  ctrl.postCambiarPassword,
);

export default router;
