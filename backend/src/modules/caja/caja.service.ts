/**
 * Caja y turnos. Arqueo SEPARADO por moneda: el efectivo en USD y el efectivo
 * en Bs se cuentan y cuadran por separado, nunca se netea una moneda contra otra.
 */
import { Conflicto, NoEncontrado, ReglaNegocio } from '../../errores/AppError';
import { queryOne, ejecutar, insertar, withTransaction, type Ejecutor } from '../../database/pool';
import { ESTADO_TURNO } from '../../config/constantes';
import type { Id, DecimalSql } from '../../tipos/comunes';

export interface TurnoActivo {
  id: Id;
  caja_id: Id;
  caja_nombre: string;
  sucursal_id: Id;
  usuario_apertura_id: Id;
  abierto_en: string;
  base_inicial_usd: DecimalSql;
  base_inicial_bs: DecimalSql;
  estado: string;
}

/** Devuelve el turno ABIERTO de una caja, o null. Con FOR UPDATE si se pide. */
export async function turnoAbiertoDeCaja(
  cajaId: Id,
  ejecutor?: Ejecutor,
  paraActualizar = false,
): Promise<TurnoActivo | null> {
  return queryOne<TurnoActivo>(
    `SELECT t.id, t.caja_id, c.nombre AS caja_nombre, t.sucursal_id, t.usuario_apertura_id,
            t.abierto_en, t.base_inicial_usd, t.base_inicial_bs, t.estado
       FROM turnos_caja t JOIN cajas c ON c.id = t.caja_id
      WHERE t.caja_id = ? AND t.estado = 'ABIERTO'
      LIMIT 1 ${paraActualizar ? 'FOR UPDATE' : ''}`,
    [cajaId],
    ejecutor,
  );
}

/** Turno abierto del usuario en su sucursal (para el POS). */
export async function turnoActivoDeUsuario(
  usuarioId: Id,
  sucursalId: Id,
): Promise<TurnoActivo | null> {
  return queryOne<TurnoActivo>(
    `SELECT t.id, t.caja_id, c.nombre AS caja_nombre, t.sucursal_id, t.usuario_apertura_id,
            t.abierto_en, t.base_inicial_usd, t.base_inicial_bs, t.estado
       FROM turnos_caja t JOIN cajas c ON c.id = t.caja_id
      WHERE t.usuario_apertura_id = ? AND t.sucursal_id = ? AND t.estado = 'ABIERTO'
      ORDER BY t.id DESC LIMIT 1`,
    [usuarioId, sucursalId],
  );
}

/** Abre un turno. Falla si la caja ya tiene uno abierto. */
export async function abrirTurno(
  entrada: { cajaId: Id; baseInicialUsd: string; baseInicialBs: string },
  usuarioId: Id,
  sucursalId: Id,
): Promise<TurnoActivo> {
  return withTransaction(async (cx) => {
    const abierto = await turnoAbiertoDeCaja(entrada.cajaId, cx, true);
    if (abierto) throw new Conflicto('TURNO_YA_ABIERTO');

    const caja = await queryOne<{ id: number; sucursal_id: number }>(
      `SELECT id, sucursal_id FROM cajas WHERE id = ? AND eliminado_en IS NULL LIMIT 1`,
      [entrada.cajaId],
      cx,
    );
    if (!caja) throw new NoEncontrado('NO_ENCONTRADO');

    const id = await insertar(
      `INSERT INTO turnos_caja
        (caja_id, sucursal_id, usuario_apertura_id, abierto_en,
         base_inicial_usd, base_inicial_bs, esperado_usd, esperado_bs, estado)
       VALUES (?, ?, ?, NOW(), ?, ?, ?, ?, 'ABIERTO')`,
      [
        entrada.cajaId,
        caja.sucursal_id,
        usuarioId,
        entrada.baseInicialUsd,
        entrada.baseInicialBs,
        entrada.baseInicialUsd,
        entrada.baseInicialBs,
      ],
      cx,
    );

    // Movimiento de caja tipo BASE por cada moneda con base > 0.
    if (Number(entrada.baseInicialUsd) > 0) {
      await registrarMovimiento(cx, id, caja.sucursal_id, 'BASE', 1, 'USD',
        entrada.baseInicialUsd, '1', entrada.baseInicialUsd, 'Base inicial USD', usuarioId);
    }
    if (Number(entrada.baseInicialBs) > 0) {
      await registrarMovimiento(cx, id, caja.sucursal_id, 'BASE', 1, 'VES',
        entrada.baseInicialBs, '1', '0.00', 'Base inicial Bs', usuarioId);
    }

    const turno = await turnoAbiertoDeCaja(entrada.cajaId, cx);
    return turno!;
  });
}

/** Inserta un movimiento de caja. Helper compartido con el POS. */
export async function registrarMovimiento(
  cx: Ejecutor,
  turnoId: Id,
  sucursalId: Id,
  tipo: string,
  signo: 1 | -1,
  moneda: 'USD' | 'VES',
  montoMoneda: string,
  tasaAplicada: string,
  montoUsd: string,
  concepto: string,
  usuarioId: Id,
  metodoPagoId?: Id | null,
  documentoTipo: 'VENTA' | 'ABONO' | 'DEVOLUCION' | 'MANUAL' = 'MANUAL',
  documentoId?: Id | null,
): Promise<void> {
  await insertar(
    `INSERT INTO movimientos_caja
      (turno_caja_id, sucursal_id, tipo, signo, moneda, monto_moneda, tasa_aplicada,
       monto_usd, metodo_pago_id, concepto, documento_tipo, documento_id, usuario_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [turnoId, sucursalId, tipo, signo, moneda, montoMoneda, tasaAplicada, montoUsd,
     metodoPagoId ?? null, concepto, documentoTipo, documentoId ?? null, usuarioId],
    cx,
  );
}

/** Registra ingreso o egreso manual de efectivo. */
export async function movimientoManual(
  entrada: { turnoId: Id; tipo: 'INGRESO' | 'EGRESO'; moneda: 'USD' | 'VES'; monto: string; concepto: string },
  usuarioId: Id,
): Promise<void> {
  await withTransaction(async (cx) => {
    const turno = await queryOne<{ id: number; sucursal_id: number; estado: string }>(
      `SELECT id, sucursal_id, estado FROM turnos_caja WHERE id = ? LIMIT 1 FOR UPDATE`,
      [entrada.turnoId],
      cx,
    );
    if (!turno) throw new NoEncontrado('TURNO_NO_ENCONTRADO');
    if (turno.estado !== ESTADO_TURNO.ABIERTO) throw new Conflicto('TURNO_CERRADO');

    const signo: 1 | -1 = entrada.tipo === 'INGRESO' ? 1 : -1;
    await registrarMovimiento(cx, turno.id, turno.sucursal_id, entrada.tipo, signo,
      entrada.moneda, entrada.monto, '1', entrada.moneda === 'USD' ? entrada.monto : '0.00',
      entrada.concepto, usuarioId);

    const colUsd = entrada.tipo === 'INGRESO' ? 'total_ingresos_usd' : 'total_egresos_usd';
    const colBs = entrada.tipo === 'INGRESO' ? 'total_ingresos_bs' : 'total_egresos_bs';
    const col = entrada.moneda === 'USD' ? colUsd : colBs;
    const espCol = entrada.moneda === 'USD' ? 'esperado_usd' : 'esperado_bs';
    const op = entrada.tipo === 'INGRESO' ? '+' : '-';
    await ejecutar(
      `UPDATE turnos_caja SET ${col} = ${col} + ?, ${espCol} = ${espCol} ${op} ? WHERE id = ?`,
      [entrada.monto, entrada.monto, turno.id],
      cx,
    );
  });
}

/**
 * Cierra el turno con el conteo fisico de cada moneda y calcula la diferencia
 * de cada una por separado.
 */
export async function cerrarTurno(
  entrada: {
    turnoId: Id;
    contadoUsd: string;
    contadoBs: string;
    denominacionesUsd?: unknown;
    denominacionesBs?: unknown;
    observaciones?: string;
  },
  usuarioId: Id,
): Promise<Record<string, unknown>> {
  return withTransaction(async (cx) => {
    const turno = await queryOne<{
      id: number;
      estado: string;
      esperado_usd: string;
      esperado_bs: string;
    }>(
      `SELECT id, estado, esperado_usd, esperado_bs FROM turnos_caja WHERE id = ? LIMIT 1 FOR UPDATE`,
      [entrada.turnoId],
      cx,
    );
    if (!turno) throw new NoEncontrado('TURNO_NO_ENCONTRADO');
    if (turno.estado !== ESTADO_TURNO.ABIERTO) throw new Conflicto('TURNO_YA_CERRADO');

    const difUsd = (Number(entrada.contadoUsd) - Number(turno.esperado_usd)).toFixed(2);
    const difBs = (Number(entrada.contadoBs) - Number(turno.esperado_bs)).toFixed(2);
    const cuadrado = Number(difUsd) === 0 && Number(difBs) === 0;

    await ejecutar(
      `UPDATE turnos_caja
          SET estado = ?, cerrado_en = NOW(), usuario_cierre_id = ?,
              contado_usd = ?, contado_bs = ?, diferencia_usd = ?, diferencia_bs = ?,
              detalle_denominaciones_usd = ?, detalle_denominaciones_bs = ?, observaciones = ?
        WHERE id = ?`,
      [
        cuadrado ? ESTADO_TURNO.CUADRADO : ESTADO_TURNO.CERRADO,
        usuarioId,
        entrada.contadoUsd,
        entrada.contadoBs,
        difUsd,
        difBs,
        entrada.denominacionesUsd ? JSON.stringify(entrada.denominacionesUsd) : null,
        entrada.denominacionesBs ? JSON.stringify(entrada.denominacionesBs) : null,
        entrada.observaciones ?? null,
        turno.id,
      ],
      cx,
    );

    return {
      id: turno.id,
      esperado_usd: turno.esperado_usd,
      esperado_bs: turno.esperado_bs,
      contado_usd: entrada.contadoUsd,
      contado_bs: entrada.contadoBs,
      diferencia_usd: difUsd,
      diferencia_bs: difBs,
      estado: cuadrado ? ESTADO_TURNO.CUADRADO : ESTADO_TURNO.CERRADO,
    };
  });
}
