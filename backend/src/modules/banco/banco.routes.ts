/** Rutas de correlacion con banco: /api/v1/banco */
import { Router } from 'express';
import { z } from 'zod';
import { validar, datosBody, datosQuery, datosParams } from '../../middlewares/validar';
import { autenticar, usuarioActual } from '../../middlewares/autenticacion';
import { requierePermiso } from '../../middlewares/autorizacion';
import { enviarOk, enviarSinContenido } from '../../utils/respuesta';
import { NoEncontrado } from '../../errores/AppError';
import * as banco from './banco.service';

/** Monto de dinero con signo: el banco puede quedar en negativo. */
const monto = z.union([z.string(), z.number()]).transform(String)
  .refine((v) => v === '' || /^-?\d+(\.\d+)?$/.test(v), 'Debe ser un monto valido (ej. 1250.50)')
  .transform((v) => (v === '' ? '0' : v));

const fechaIso = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'La fecha debe ser AAAA-MM-DD');

const esquemaRango = z.object({ desde: fechaIso, hasta: fechaIso });
const esquemaParamsFecha = z.object({ fecha: fechaIso });
const esquemaSaldo = z.object({
  saldoBs: monto,
  saldoUsd: monto,
  observaciones: z.string().trim().max(255).nullable().optional(),
});

const router = Router();
router.use(autenticar);

/**
 * `caja.ver` / `caja.movimiento` valen como respaldo: si la migracion 0002 (que
 * crea los permisos banco.*) todavia no se aplico, quien cuadra la caja igual entra.
 */
const PUEDE_VER = ['banco.ver', 'caja.ver'] as const;
const PUEDE_REGISTRAR = ['banco.registrar', 'caja.movimiento'] as const;

/** Dias del rango + totales propios del apartado. */
router.get('/', requierePermiso(...PUEDE_VER), validar({ query: esquemaRango }),
  async (req, res, next) => {
    try {
      const { desde, hasta } = datosQuery<z.infer<typeof esquemaRango>>(req);
      const { sucursalId } = usuarioActual(req);
      const [dias, resumen, metodos] = await Promise.all([
        banco.listarDias(sucursalId, desde, hasta),
        banco.resumen(sucursalId, desde, hasta),
        banco.metodosBancarios(),
      ]);
      enviarOk(res, { dias, resumen, metodos });
    } catch (e) { next(e); }
  });

/** Registra o corrige el saldo de un dia. */
router.put('/:fecha', requierePermiso(...PUEDE_REGISTRAR),
  validar({ params: esquemaParamsFecha, body: esquemaSaldo }), async (req, res, next) => {
    try {
      const { fecha } = datosParams<{ fecha: string }>(req);
      const usuario = usuarioActual(req);
      const entrada = datosBody<z.infer<typeof esquemaSaldo>>(req);
      enviarOk(res, await banco.guardarDia(usuario.sucursalId, fecha, entrada, usuario));
    } catch (e) { next(e); }
  });

router.delete('/:fecha', requierePermiso(...PUEDE_REGISTRAR),
  validar({ params: esquemaParamsFecha }), async (req, res, next) => {
    try {
      const { fecha } = datosParams<{ fecha: string }>(req);
      const borrado = await banco.borrarDia(usuarioActual(req).sucursalId, fecha);
      if (!borrado) throw new NoEncontrado('NO_ENCONTRADO');
      enviarSinContenido(res);
    } catch (e) { next(e); }
  });

export default router;
