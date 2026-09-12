/** Configuracion del negocio: /api/v1/configuracion (fila unica id=1). */
import { Router } from 'express';
import { z } from 'zod';
import { validar, datosBody } from '../../middlewares/validar';
import { autenticar, usuarioActual } from '../../middlewares/autenticacion';
import { requierePermiso } from '../../middlewares/autorizacion';
import { enviarOk } from '../../utils/respuesta';
import { queryOne, ejecutar } from '../../database/pool';
import { existeColumna } from '../../database/esquema';

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
  moraPctDefecto: z.coerce.number().min(0).max(100).optional(),
  // Cada cuantos dias de atraso se suma otro tramo de mora. 0 = una sola vez.
  moraCadaDias: z.coerce.number().int().min(0).max(365).optional(),
});

router.get('/', requierePermiso('configuracion.ver'), async (_req, res, next) => {
  try {
    const cfg = await queryOne(`SELECT * FROM configuracion WHERE id = 1`);
    enviarOk(res, cfg);
  } catch (e) { next(e); }
});

/*
  Condiciones que el POS propone al fiar. Va aparte de GET / porque esa ruta pide
  permiso de configuracion y el cajero no lo tiene: sin esto, la caja no podria
  proponer ni el plazo ni la mora por defecto.
*/
router.get('/credito', requierePermiso('pos.vender'), async (_req, res, next) => {
  try {
    const hayMora = await existeColumna('configuracion', 'mora_pct_defecto');
    const hayCadaDias = await existeColumna('configuracion', 'mora_cada_dias');
    const cfg = await queryOne<{
      dias_plazo_credito_defecto: number; mora_pct_defecto: string; mora_cada_dias: number;
    }>(
      `SELECT dias_plazo_credito_defecto,
              ${hayMora ? 'mora_pct_defecto' : '0'} AS mora_pct_defecto,
              ${hayCadaDias ? 'mora_cada_dias' : '3'} AS mora_cada_dias
         FROM configuracion WHERE id = 1`,
    );
    enviarOk(res, {
      dias_plazo_credito_defecto: cfg?.dias_plazo_credito_defecto ?? 30,
      mora_pct_defecto: cfg?.mora_pct_defecto ?? '0',
      mora_cada_dias: cfg?.mora_cada_dias ?? 3,
    });
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
    if (e.moraPctDefecto !== undefined && (await existeColumna('configuracion', 'mora_pct_defecto'))) {
      await ejecutar(`UPDATE configuracion SET mora_pct_defecto = ? WHERE id = 1`, [e.moraPctDefecto]);
    }
    if (e.moraCadaDias !== undefined && (await existeColumna('configuracion', 'mora_cada_dias'))) {
      await ejecutar(`UPDATE configuracion SET mora_cada_dias = ? WHERE id = 1`, [e.moraCadaDias]);
    }
    enviarOk(res, await queryOne(`SELECT * FROM configuracion WHERE id = 1`));
  } catch (e) { next(e); }
});

export default router;
