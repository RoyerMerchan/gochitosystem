/**
 * Correlacion con banco.
 *
 * El usuario carga a mano lo que el banco le reporta cada dia (Bs y USD) y aqui se
 * contrasta contra lo que el sistema dice que DEBIO entrar ese dia: los cobros por
 * metodos que no son efectivo ni credito (pago movil, transferencia, punto de venta,
 * Zelle, Binance), de ventas y de abonos.
 *
 * MODULO AISLADO: solo lee `banco_saldos` (que nadie mas toca) y hace consultas de
 * SOLO LECTURA sobre pagos/abonos. No escribe en caja, ventas, cartera ni resumenes,
 * asi que ninguna estadistica del resto del sistema cambia por lo que se cargue aqui.
 */
import { query, queryOne, ejecutar, insertar } from '../../database/pool';
import type { Id, DecimalSql, UsuarioAutenticado } from '../../tipos/comunes';

/**
 * Un metodo va al banco si no mueve efectivo de la caja y no es un "no cobro"
 * (el credito/fiado). Se deriva de metodos_pago, no de una lista fija, para que
 * un metodo nuevo entre solo.
 */
const CONDICION_METODO_BANCARIO = `mp.afecta_caja_efectivo = FALSE AND mp.es_no_es_cobro = FALSE`;

export interface DiaBanco {
  fecha: string;
  /** Saldo declarado; null si ese dia no se registro nada. */
  saldo_bs: DecimalSql | null;
  saldo_usd: DecimalSql | null;
  observaciones: string | null;
  /** Cobrado ese dia por metodos bancarios. */
  entrada_bs: DecimalSql;
  entrada_usd: DecimalSql;
  /** Saldo declarado menos el del dia registrado anterior. Null si no hay anterior. */
  variacion_bs: DecimalSql | null;
  variacion_usd: DecimalSql | null;
}

export interface ResumenBanco {
  ultima_fecha: string | null;
  ultimo_saldo_bs: DecimalSql | null;
  ultimo_saldo_usd: DecimalSql | null;
  entradas_bs: DecimalSql;
  entradas_usd: DecimalSql;
  dias_registrados: number;
}

export interface MetodoBancario {
  nombre: string;
  moneda: string;
}

/**
 * Dias del rango con su saldo declarado (si lo hay) y las entradas bancarias.
 *
 * Se genera la serie completa de fechas para que los dias SIN registrar salten a
 * la vista: son justo los que descuadran el arqueo contra el banco.
 */
export async function listarDias(
  sucursalId: number,
  desde: string,
  hasta: string,
): Promise<DiaBanco[]> {
  return query<DiaBanco>(
    `WITH dias AS (
       SELECT gs::date AS fecha
         FROM generate_series(?::date, ?::date, INTERVAL '1 day') gs
     ),
     movimientos AS (
       SELECT p.fecha::date AS fecha,
              CASE WHEN p.moneda = 'VES' THEN p.monto_moneda ELSE 0 END AS bs,
              CASE WHEN p.moneda = 'USD' THEN p.monto_moneda ELSE 0 END AS usd
         FROM pagos p
         JOIN metodos_pago mp ON mp.id = p.metodo_pago_id
         JOIN ventas v ON v.id = p.venta_id
        WHERE p.sucursal_id = ? AND v.estado <> 'ANULADA' AND ${CONDICION_METODO_BANCARIO}
       UNION ALL
       SELECT a.fecha::date,
              CASE WHEN a.moneda = 'VES' THEN a.monto_moneda ELSE 0 END,
              CASE WHEN a.moneda = 'USD' THEN a.monto_moneda ELSE 0 END
         FROM abonos a
         JOIN metodos_pago mp ON mp.id = a.metodo_pago_id
        WHERE a.sucursal_id = ? AND a.estado = 'APLICADO' AND ${CONDICION_METODO_BANCARIO}
     ),
     entradas AS (
       SELECT fecha, SUM(bs) AS bs, SUM(usd) AS usd FROM movimientos GROUP BY fecha
     ),
     saldos AS (
       -- El LAG corre sobre TODOS los dias registrados, no solo los del rango, para
       -- que el primer dia del filtro se compare contra el ultimo registro real.
       SELECT fecha, saldo_bs, saldo_usd, observaciones,
              LAG(saldo_bs)  OVER (ORDER BY fecha) AS prev_bs,
              LAG(saldo_usd) OVER (ORDER BY fecha) AS prev_usd
         FROM banco_saldos WHERE sucursal_id = ?
     )
     SELECT TO_CHAR(d.fecha, 'YYYY-MM-DD') AS fecha,
            s.saldo_bs, s.saldo_usd, s.observaciones,
            COALESCE(e.bs, 0) AS entrada_bs,
            COALESCE(e.usd, 0) AS entrada_usd,
            (s.saldo_bs  - s.prev_bs)  AS variacion_bs,
            (s.saldo_usd - s.prev_usd) AS variacion_usd
       FROM dias d
       LEFT JOIN saldos   s ON s.fecha = d.fecha
       LEFT JOIN entradas e ON e.fecha = d.fecha
      ORDER BY d.fecha DESC`,
    [desde, hasta, sucursalId, sucursalId, sucursalId],
  );
}

/** Totales propios del apartado. No alimentan ningun reporte ni el dashboard. */
export async function resumen(
  sucursalId: number,
  desde: string,
  hasta: string,
): Promise<ResumenBanco> {
  const ultimo = await queryOne<{ fecha: string; saldo_bs: DecimalSql; saldo_usd: DecimalSql }>(
    `SELECT TO_CHAR(fecha, 'YYYY-MM-DD') AS fecha, saldo_bs, saldo_usd
       FROM banco_saldos WHERE sucursal_id = ? ORDER BY fecha DESC LIMIT 1`,
    [sucursalId],
  );

  const entradas = await queryOne<{ bs: DecimalSql; usd: DecimalSql }>(
    `SELECT COALESCE(SUM(bs), 0) AS bs, COALESCE(SUM(usd), 0) AS usd FROM (
       SELECT CASE WHEN p.moneda = 'VES' THEN p.monto_moneda ELSE 0 END AS bs,
              CASE WHEN p.moneda = 'USD' THEN p.monto_moneda ELSE 0 END AS usd
         FROM pagos p
         JOIN metodos_pago mp ON mp.id = p.metodo_pago_id
         JOIN ventas v ON v.id = p.venta_id
        WHERE p.sucursal_id = ? AND v.estado <> 'ANULADA'
          AND p.fecha::date BETWEEN ?::date AND ?::date AND ${CONDICION_METODO_BANCARIO}
       UNION ALL
       SELECT CASE WHEN a.moneda = 'VES' THEN a.monto_moneda ELSE 0 END,
              CASE WHEN a.moneda = 'USD' THEN a.monto_moneda ELSE 0 END
         FROM abonos a
         JOIN metodos_pago mp ON mp.id = a.metodo_pago_id
        WHERE a.sucursal_id = ? AND a.estado = 'APLICADO'
          AND a.fecha::date BETWEEN ?::date AND ?::date AND ${CONDICION_METODO_BANCARIO}
     ) t`,
    [sucursalId, desde, hasta, sucursalId, desde, hasta],
  );

  const registrados = await queryOne<{ n: number }>(
    `SELECT COUNT(*) AS n FROM banco_saldos
      WHERE sucursal_id = ? AND fecha BETWEEN ?::date AND ?::date`,
    [sucursalId, desde, hasta],
  );

  return {
    ultima_fecha: ultimo?.fecha ?? null,
    ultimo_saldo_bs: ultimo?.saldo_bs ?? null,
    ultimo_saldo_usd: ultimo?.saldo_usd ?? null,
    entradas_bs: entradas?.bs ?? '0',
    entradas_usd: entradas?.usd ?? '0',
    dias_registrados: Number(registrados?.n ?? 0),
  };
}

/** Metodos que este calculo considera "van al banco", para mostrarlos en pantalla. */
export async function metodosBancarios(): Promise<MetodoBancario[]> {
  return query<MetodoBancario>(
    `SELECT nombre, moneda FROM metodos_pago mp
      WHERE mp.eliminado_en IS NULL AND mp.esta_activo AND ${CONDICION_METODO_BANCARIO}
      ORDER BY orden, nombre`,
  );
}

export interface SaldoEntrada {
  saldoBs: string;
  saldoUsd: string;
  observaciones?: string | null;
}

/** Registra (o corrige) el saldo de un dia. Un dia = un registro por sucursal. */
export async function guardarDia(
  sucursalId: number,
  fecha: string,
  e: SaldoEntrada,
  usuario: UsuarioAutenticado,
): Promise<{ id: Id; fecha: string }> {
  const existente = await queryOne<{ id: number }>(
    `SELECT id FROM banco_saldos WHERE sucursal_id = ? AND fecha = ?::date`,
    [sucursalId, fecha],
  );

  if (existente) {
    await ejecutar(
      `UPDATE banco_saldos SET saldo_bs = ?, saldo_usd = ?, observaciones = ?, usuario_id = ?
        WHERE id = ?`,
      [e.saldoBs, e.saldoUsd, e.observaciones ?? null, usuario.id, existente.id],
    );
    return { id: existente.id, fecha };
  }

  const id = await insertar(
    `INSERT INTO banco_saldos (sucursal_id, fecha, saldo_bs, saldo_usd, observaciones, usuario_id)
     VALUES (?, ?::date, ?, ?, ?, ?)`,
    [sucursalId, fecha, e.saldoBs, e.saldoUsd, e.observaciones ?? null, usuario.id],
  );
  return { id, fecha };
}

/** Borra el registro de un dia. No hay nada que revertir: la tabla es autonoma. */
export async function borrarDia(sucursalId: number, fecha: string): Promise<boolean> {
  const r = await ejecutar(
    `DELETE FROM banco_saldos WHERE sucursal_id = ? AND fecha = ?::date`,
    [sucursalId, fecha],
  );
  return r.rowCount > 0;
}
