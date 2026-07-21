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
import { aTasaCambio, montoMonedaAUsd, aMontoMoneda, montoMonedaASql } from '../../utils/moneda';
import { ESTADO_CREDITO, ESTADO_ABONO, TIPO_DOCUMENTO } from '../../config/constantes';
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
    `SELECT cr.id, v.prefijo || v.numero AS documento, cr.fecha_emision, cr.fecha_vencimiento,
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
  referencia?: string;
  observaciones?: string;
}

/** Registra un abono y lo aplica FIFO a los creditos pendientes del cliente. */
export async function registrarAbono(
  entrada: AbonoEntrada,
  usuario: UsuarioAutenticado,
  idempotencyKey: string | null,
): Promise<{ id: Id; numero: string; monto_usd: string; saldo_restante: string }> {
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
    const montoUsd = montoMonedaAUsd(montoMonedaEsc, entrada.moneda, tasaEsc);
    if (montoUsd <= 0n) throw new ReglaNegocio('MONTO_INVALIDO');

    // Cliente y su saldo (bloqueado).
    const cliente = await queryOne<{ saldo_actual: string; dias_plazo: number }>(
      `SELECT saldo_actual, dias_plazo FROM clientes WHERE id = ? AND eliminado_en IS NULL FOR UPDATE`,
      [entrada.clienteId], cx,
    );
    if (!cliente) throw new NoEncontrado('CLIENTE_NO_ENCONTRADO');
    const saldoCliente = aCentavos(cliente.saldo_actual);
    if (montoUsd > saldoCliente) throw new ReglaNegocio('ABONO_MAYOR_A_SALDO');

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

    // Aplicacion FIFO a los creditos pendientes (mas antiguos primero).
    const creditos = await query<{ id: number; saldo_usd: string; monto_original_usd: string }>(
      `SELECT id, saldo_usd, monto_original_usd FROM creditos
        WHERE cliente_id = ? AND estado IN ('PENDIENTE','PARCIAL','VENCIDO')
        ORDER BY fecha_emision, id FOR UPDATE`,
      [entrada.clienteId], cx,
    );

    let restante = montoUsd;
    for (const cr of creditos) {
      if (restante <= 0n) break;
      const saldoCred = aCentavos(cr.saldo_usd);
      const aplicar = restante >= saldoCred ? saldoCred : restante;
      const saldoNuevo = saldoCred - aplicar;

      await insertar(
        `INSERT INTO abono_aplicaciones (abono_id, credito_id, monto_usd, saldo_anterior_usd, saldo_posterior_usd)
         VALUES (?, ?, ?, ?, ?)`,
        [abonoId, cr.id, centavosASql(aplicar), centavosASql(saldoCred), centavosASql(saldoNuevo)], cx,
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
    return { id: abonoId, numero: `${prefijo}${numero}`, monto_usd: centavosASql(montoUsd), saldo_restante: saldoRestante?.saldo_actual ?? '0' };
  });
}

async function siguienteConsecutivo(
  cx: Ejecutor, sucursalId: number, tipo: string, anio: number,
): Promise<{ numero: number; prefijo: string }> {
  const fila = await queryOne<{ id: number; ultimo_numero: number; prefijo: string }>(
    `SELECT id, ultimo_numero, prefijo FROM consecutivos WHERE sucursal_id = ? AND tipo_documento = ? AND anio = ? LIMIT 1 FOR UPDATE`,
    [sucursalId, tipo, anio], cx,
  );
  if (!fila) {
    await insertar(`INSERT INTO consecutivos (sucursal_id, tipo_documento, anio, prefijo, ultimo_numero) VALUES (?, ?, ?, 'A-', 1)`, [sucursalId, tipo, anio], cx);
    return { numero: 1, prefijo: 'A-' };
  }
  const nuevo = fila.ultimo_numero + 1;
  await ejecutar(`UPDATE consecutivos SET ultimo_numero = ? WHERE id = ?`, [nuevo, fila.id], cx);
  return { numero: nuevo, prefijo: fila.prefijo };
}
