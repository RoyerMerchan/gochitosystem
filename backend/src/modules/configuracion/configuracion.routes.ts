/** Configuracion del negocio: /api/v1/configuracion (fila unica id=1). */
import { Router } from 'express';
import { z } from 'zod';
import { validar, datosBody } from '../../middlewares/validar';
import { autenticar, usuarioActual } from '../../middlewares/autenticacion';
import { requierePermiso } from '../../middlewares/autorizacion';
import { enviarOk } from '../../utils/respuesta';
import { queryOne, ejecutar } from '../../database/pool';

const router = Router();
router.use(autenticar);

const esquema = z.object({
  nombreNegocio: z.string().trim().min(1).max(120),
  razonSocial: z.string().trim().max(160).nullable().optional(),
  nit: z.string().trim().max(32).nullable().optional(),
  direccion: z.string().trim().max(200).nullable().optional(),
  telefono: z.string().trim().max(40).nullable().optional(),
  email: z.string().trim().max(160).nullable().optional(),
  monedaSecundariaSimbolo: z.string().trim().max(5).optional(),
  redondeoBsMultiplo: z.union([z.string(), z.number()]).transform(String).optional(),
  esBloqueaVentaSinTasa: z.coerce.boolean().optional(),
  ticketEncabezado: z.string().trim().max(255).nullable().optional(),
  ticketPie: z.string().trim().max(255).nullable().optional(),
  ticketMensajeLegal: z.string().trim().max(255).nullable().optional(),
  esTicketMuestraAmbasMonedas: z.coerce.boolean().optional(),
  esTicketMuestraTasa: z.coerce.boolean().optional(),
  ticketAnchoMm: z.coerce.number().int().optional(),
  diasPlazoCreditoDefecto: z.coerce.number().int().min(0).max(365).optional(),
});

router.get('/', requierePermiso('configuracion.ver'), async (_req, res, next) => {
  try {
    const cfg = await queryOne(`SELECT * FROM configuracion WHERE id = 1`);
    enviarOk(res, cfg);
  } catch (e) { next(e); }
});

router.put('/', requierePermiso('configuracion.editar'), validar({ body: esquema }), async (req, res, next) => {
  try {
    const e = datosBody<z.infer<typeof esquema>>(req);
    await ejecutar(
      `UPDATE configuracion SET
         nombre_negocio=?, razon_social=?, nit=?, direccion=?, telefono=?, email=?,
         moneda_secundaria_simbolo=COALESCE(?, moneda_secundaria_simbolo),
         redondeo_bs_multiplo=COALESCE(?, redondeo_bs_multiplo),
         es_bloquea_venta_sin_tasa=COALESCE(?, es_bloquea_venta_sin_tasa),
         ticket_encabezado=?, ticket_pie=?, ticket_mensaje_legal=?,
         es_ticket_muestra_ambas_monedas=COALESCE(?, es_ticket_muestra_ambas_monedas),
         es_ticket_muestra_tasa=COALESCE(?, es_ticket_muestra_tasa),
         ticket_ancho_mm=COALESCE(?, ticket_ancho_mm),
         dias_plazo_credito_defecto=COALESCE(?, dias_plazo_credito_defecto),
         actualizado_por=?
       WHERE id = 1`,
      [
        e.nombreNegocio, e.razonSocial ?? null, e.nit ?? null, e.direccion ?? null,
        e.telefono ?? null, e.email ?? null, e.monedaSecundariaSimbolo ?? null,
        e.redondeoBsMultiplo ?? null,
        e.esBloqueaVentaSinTasa === undefined ? null : e.esBloqueaVentaSinTasa ? 1 : 0,
        e.ticketEncabezado ?? null, e.ticketPie ?? null, e.ticketMensajeLegal ?? null,
        e.esTicketMuestraAmbasMonedas === undefined ? null : e.esTicketMuestraAmbasMonedas ? 1 : 0,
        e.esTicketMuestraTasa === undefined ? null : e.esTicketMuestraTasa ? 1 : 0,
        e.ticketAnchoMm ?? null, e.diasPlazoCreditoDefecto ?? null,
        usuarioActual(req).id,
      ],
    );
    enviarOk(res, await queryOne(`SELECT * FROM configuracion WHERE id = 1`));
  } catch (e) { next(e); }
});

export default router;
