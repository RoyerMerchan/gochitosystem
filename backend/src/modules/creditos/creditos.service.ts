/**
 * Creditos y abonos. La deuda vive en USD. Un abono se recibe en la moneda que
 * pague el cliente, con la tasa del DIA DEL ABONO, se convierte a USD y se aplica
 * a las facturas pendientes en orden FIFO (las mas antiguas primero).
 */
import { Conflicto, NoEncontrado, ReglaNegocio } from '../../errores/AppError';
import {
  query, queryOne, ejecutar, insertar, withTransaction, type Ejecutor,
} from '../../database/pool';
import { aCentavos, centavosASql, dividirRedondeando } from '../../utils/dinero';
import { aTasaCambio, montoMonedaAUsdPiso, aMontoMoneda, montoMonedaASql } from '../../utils/moneda';
import { siguienteConsecutivo } from '../../utils/consecutivos';
import { ESTADO_CREDITO, TIPO_DOCUMENTO } from '../../config/constantes';
import { registrarMovimiento, turnoActivoDeUsuario } from '../caja/caja.service';
import type { Id, UsuarioAutenticado } from '../../tipos/comunes';

/** Cartera: clientes con deuda y su antiguedad de saldos. */
export async function listarCartera(): Promise<unknown[]> {
  return query(
    `SELECT c.id AS cliente_id, c.nombre, c.documento, c.saldo_actual AS saldo_usd,
            c.cupo_credito,
            COALESCE(SUM(CASE WHEN (CURRENT_DATE - cr.fecha_vencimiento) <= 0 THEN cr.saldo_usd ELSE 0 END),0) AS por_vencer,
            COALESCE(SUM(CASE WHEN (CURRENT_DATE - cr.fecha_vencimiento) BETWEEN 1 AND 30 THEN cr.saldo_usd ELSE 0 END),0) AS d1_30,
            COALESCE(SUM(CASE WHEN (CURRENT_DATE - cr.fecha_vencimiento) BETWEEN 31 AND 60 THEN cr.saldo_usd ELSE 0 END),0) AS d31_60,
            COALESCE(SUM(CASE WHEN (CURRENT_DATE - cr.fecha_vencimiento) BETWEEN 61 AND 90 THEN cr.saldo_usd ELSE 0 END),0) AS d61_90,
            COALESCE(SUM(CASE WHEN (CURRENT_DATE - cr.fecha_vencimiento) > 90 THEN cr.saldo_usd ELSE 0 END),0) AS d90_mas
       FROM clientes c
       JOIN creditos cr ON cr.cliente_id = c.id AND cr.estado IN ('PENDIENTE','PARCIAL','VENCIDO')
      WHERE c.eliminado_en IS NULL
      GROUP BY c.id, c.nombre, c.documento, c.saldo_actual, c.cupo_credito
      HAVING c.saldo_actual > 0
      ORDER BY c.saldo_actual DESC`,
  );
}

/** Estado de cuenta de un cliente: creditos pendientes + historial de abonos. */
export async function estadoCuenta(clienteId: Id): Promise<unknown> {
  const cliente = await queryOne(
    `SELECT id, nombre, documento, saldo_actual, cupo_credito FROM clientes WHERE id = ? AND eliminado_en IS NULL`,
    [clienteId],
  );
  if (!cliente) throw new NoEncontrado('CLIENTE_NO_ENCONTRADO');

  const creditos = await query(
    `SELECT cr.id, cr.venta_id, v.prefijo || v.numero AS documento, cr.fecha_emision, cr.fecha_vencimiento,
            cr.monto_original_usd, cr.saldo_usd, cr.estado, (CURRENT_DATE - cr.fecha_vencimiento) AS dias_mora
       FROM creditos cr LEFT JOIN ventas v ON v.id = cr.venta_id
      WHERE cr.cliente_id = ? AND cr.estado <> 'ANULADO'
      ORDER BY cr.fecha_emision`,
    [clienteId],
  );

  const abonos = await query(
    `SELECT a.id, a.prefijo || a.numero AS numero, a.fecha, a.moneda, a.monto_moneda,
            a.tasa_aplicada, a.monto_usd, a.estado
       FROM abonos a WHERE a.cliente_id = ? ORDER BY a.fecha DESC LIMIT 50`,
    [clienteId],
  );

  return { cliente, creditos, abonos };
}

export interface AbonoEntrada {
  clienteId: Id;
  metodoPagoId: Id;
  moneda: 'USD' | 'VES';
  montoMoneda: string;
  /**
   * Facturas a las que se aplica el abono (las que el cliente marco como "pago esto").
   * Vacio o ausente = toda la deuda, FIFO.
   */
  creditoIds?: Id[];
  referencia?: string;
  observaciones?: string;
}

/**
 * Tolerancia de cierre: 1 centavo de USD.
 *
 * Pagando en Bs la division por la tasa casi nunca cae exacta sobre el saldo en USD
 * (3.132,00 Bs / 743 = 4,2153...). Sin tolerancia el cliente que quiere quedar en cero
 * o recibe "el abono supera el saldo" por un centavo, o queda con una deuda fantasma de
 * 0,01 imposible de pagar. Si el abono cae a un centavo del saldo objetivo se toma como
 * pago exacto de ese saldo.
 */
const TOLERANCIA_CIERRE = 1n;

/** Registra un abono y lo aplica FIFO a los creditos pendientes del cliente. */
export async function registrarAbono(
  entrada: AbonoEntrada,
  usuario: UsuarioAutenticado,
  idempotencyKey: string | null,
): Promise<{ id: Id; numero: string; monto_usd: string; aplicado_usd: string; saldo_restante: string }> {
  return withTransaction(async (cx) => {
    // Tasa del dia del abono.
    const tasaFila = await queryOne<{ tasa: string }>(
      `SELECT tasa FROM tasas_cambio WHERE fecha = CURRENT_DATE AND eliminado_en IS NULL LIMIT 1`, [], cx,
    );
    if (!tasaFila) throw new ReglaNegocio('SIN_TASA_DEL_DIA');
    const tasaEsc = aTasaCambio(tasaFila.tasa);

    // Metodo de pago (para referencia y caja).
    const metodo = await queryOne<{ moneda: string; requiere_referencia: boolean; afecta_caja_efectivo: boolean }>(
      `SELECT moneda, requiere_referencia, afecta_caja_efectivo FROM metodos_pago WHERE id = ? AND eliminado_en IS NULL`,
      [entrada.metodoPagoId], cx,
    );
    if (!metodo) throw new NoEncontrado('NO_ENCONTRADO');
    if (metodo.requiere_referencia && !entrada.referencia?.trim()) throw new ReglaNegocio('REFERENCIA_REQUERIDA');

    const montoMonedaEsc = aMontoMoneda(entrada.montoMoneda);
    // Piso, no half-up: jamas se acreditan mas dolares de los que cubren los Bs recibidos.
    let montoUsd = montoMonedaAUsdPiso(montoMonedaEsc, entrada.moneda, tasaEsc);
    if (montoUsd <= 0n) throw new ReglaNegocio('MONTO_INVALIDO');

    // Cliente y su saldo (bloqueado).
    const cliente = await queryOne<{ saldo_actual: string; dias_plazo: number }>(
      `SELECT saldo_actual, dias_plazo FROM clientes WHERE id = ? AND eliminado_en IS NULL FOR UPDATE`,
      [entrada.clienteId], cx,
    );
    if (!cliente) throw new NoEncontrado('CLIENTE_NO_ENCONTRADO');

    // Facturas objetivo: las marcadas por el usuario, o toda la deuda en FIFO.
    const seleccion = [...new Set((entrada.creditoIds ?? []).map(Number).filter((n) => n > 0))];
    const creditos = await creditosObjetivo(cx, entrada.clienteId, seleccion);
    if (creditos.length === 0) throw new ReglaNegocio('CREDITO_YA_PAGADO');

    const saldoObjetivo = creditos.reduce((acc, cr) => acc + aCentavos(cr.saldo_usd), 0n);
    if (montoUsd > saldoObjetivo) {
      if (montoUsd - saldoObjetivo > TOLERANCIA_CIERRE) throw new ReglaNegocio('ABONO_MAYOR_A_SALDO');
      montoUsd = saldoObjetivo; // diferencia de redondeo de la tasa: se toma como pago exacto
    } else if (saldoObjetivo - montoUsd <= TOLERANCIA_CIERRE) {
      montoUsd = saldoObjetivo; // cierra la factura en vez de dejar 0,01 de deuda fantasma
    }

    // Turno de caja (para el movimiento de efectivo).
    const turno = await turnoActivoDeUsuario(usuario.id, usuario.sucursalId);
    if (!turno && metodo.afecta_caja_efectivo) throw new Conflicto('CAJA_NO_ABIERTA');

    const anio = new Date().getFullYear();
    const { numero, prefijo } = await siguienteConsecutivo(cx, usuario.sucursalId, TIPO_DOCUMENTO.ABONO, anio);

    const abonoId = await insertar(
      `INSERT INTO abonos
        (sucursal_id, cliente_id, turno_caja_id, metodo_pago_id, usuario_id, prefijo, numero, anio,
         moneda, monto_moneda, tasa_aplicada, monto_usd, monto_aplicado_usd, referencia, observaciones,
         estado, clave_idempotencia)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'APLICADO', ?)`,
      [
        usuario.sucursalId, entrada.clienteId, turno?.id ?? 1, entrada.metodoPagoId, usuario.id,
        prefijo, numero, anio, entrada.moneda, montoMonedaASql(montoMonedaEsc), tasaFila.tasa,
        centavosASql(montoUsd), centavosASql(montoUsd), entrada.referencia ?? null,
        entrada.observaciones ?? null, idempotencyKey,
      ],
      cx,
    );

    // Aplicacion FIFO sobre las facturas objetivo (mas antiguas primero).
    let restante = montoUsd;
    for (const cr of creditos) {
      if (restante <= 0n) break;
      const saldoCred = aCentavos(cr.saldo_usd);
      const aplicar = restante >= saldoCred ? saldoCred : restante;
      const saldoNuevo = saldoCred - aplicar;

      await insertar(
        `INSERT INTO abono_aplicaciones (abono_id, credito_id, monto_aplicado_usd)
         VALUES (?, ?, ?)`,
        [abonoId, cr.id, centavosASql(aplicar)], cx,
      );

      const nuevoEstado = saldoNuevo <= 0n ? ESTADO_CREDITO.PAGADO : ESTADO_CREDITO.PARCIAL;
      await ejecutar(
        `UPDATE creditos SET saldo_usd = ?, estado = ?, pagado_en = ? WHERE id = ?`,
        [centavosASql(saldoNuevo), nuevoEstado, saldoNuevo <= 0n ? new Date().toISOString().slice(0, 19).replace('T', ' ') : null, cr.id],
        cx,
      );
      restante -= aplicar;
    }

    // Baja el saldo del cliente por lo efectivamente aplicado.
    const aplicado = montoUsd - restante;
    await ejecutar(
      `UPDATE clientes SET saldo_actual = GREATEST(0, saldo_actual - ?) WHERE id = ?`,
      [centavosASql(aplicado), entrada.clienteId], cx,
    );
    // Si sobro (pago de mas), queda como saldo a favor.
    if (restante > 0n) {
      await ejecutar(`UPDATE abonos SET saldo_a_favor_usd = ?, monto_aplicado_usd = ? WHERE id = ?`,
        [centavosASql(restante), centavosASql(aplicado), abonoId], cx);
    }

    // Movimiento de caja si el abono fue en efectivo.
    if (turno && metodo.afecta_caja_efectivo) {
      await registrarMovimiento(
        cx, turno.id, usuario.sucursalId, 'ABONO', 1, entrada.moneda,
        montoMonedaASql(montoMonedaEsc), tasaFila.tasa, centavosASql(montoUsd),
        `Abono ${prefijo}${numero}`, usuario.id, entrada.metodoPagoId, 'ABONO', abonoId,
      );
      if (entrada.moneda === 'USD') {
        await ejecutar(`UPDATE turnos_caja SET total_abonos_efectivo_usd = total_abonos_efectivo_usd + ?, esperado_usd = esperado_usd + ? WHERE id = ?`,
          [centavosASql(montoUsd), centavosASql(montoUsd), turno.id], cx);
      } else {
        const bs = dividirRedondeando(montoMonedaEsc, 100n);
        await ejecutar(`UPDATE turnos_caja SET total_abonos_efectivo_bs = total_abonos_efectivo_bs + ?, esperado_bs = esperado_bs + ? WHERE id = ?`,
          [centavosASql(bs), centavosASql(bs), turno.id], cx);
      }
    }

    const saldoRestante = await queryOne<{ saldo_actual: string }>(`SELECT saldo_actual FROM clientes WHERE id = ?`, [entrada.clienteId], cx);
    return {
      id: abonoId, numero: `${prefijo}${numero}`,
      monto_usd: centavosASql(montoUsd), aplicado_usd: centavosASql(aplicado),
      saldo_restante: saldoRestante?.saldo_actual ?? '0',
    };
  });
}

/**
 * Creditos vivos a los que se aplicara el abono, bloqueados y en orden FIFO.
 * Con `ids` se restringe a las facturas que el usuario marco; sin ids, toda la deuda.
 */
async function creditosObjetivo(
  cx: Ejecutor, clienteId: Id, ids: number[],
): Promise<Array<{ id: number; saldo_usd: string }>> {
  const base = `SELECT id, saldo_usd FROM creditos
                 WHERE cliente_id = ? AND estado IN ('PENDIENTE','PARCIAL','VENCIDO')`;
  const orden = 'ORDER BY fecha_emision, id FOR UPDATE';

  if (ids.length === 0) {
    return query(`${base} ${orden}`, [clienteId], cx);
  }
  const marcas = ids.map(() => '?').join(',');
  const filas = await query<{ id: number; saldo_usd: string }>(
    `${base} AND id IN (${marcas}) ${orden}`, [clienteId, ...ids], cx,
  );
  // Una factura marcada que ya no esta pendiente (o no es de este cliente) es un
  // dato viejo en pantalla: mejor fallar que cobrar sobre otra cosa.
  if (filas.length !== ids.length) throw new NoEncontrado('CREDITO_NO_ENCONTRADO');
  return filas;
}

