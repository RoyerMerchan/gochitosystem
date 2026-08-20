/**
 * Conversion bimonetaria USD <-> Bolivares (VES).
 *
 * REGLA INNEGOCIABLE (snapshot de tasa): toda conversion de un documento usa la
 * tasa CONGELADA de ese documento (ventas.tasa_cambio, abonos.tasa_aplicada),
 * nunca la tasa de hoy. Los montos historicos en Bs jamas se recalculan.
 *
 * Toda la aritmetica es en bigint (ver utils/dinero.ts). Nunca punto flotante.
 *
 * Escalas:
 *   - USD:        centavos (escala 2)   -> ESCALA.TOTAL
 *   - Saldo USD:  diezmilesimas (esc.4) -> ESCALA.SALDO_USD  (libro de creditos)
 *   - Bs:         centimos (escala 2)   -> ESCALA.BS
 *   - Tasa:       millonesimas (esc. 6) -> ESCALA.TASA_CAMBIO  (Bs por 1 USD)
 *   - MontoMoneda escala 4              -> ESCALA.MONTO_MONEDA
 */
import { ESCALA, MONEDA, type Moneda } from '../config/constantes';
import { aEntero, aDecimalSql, dividirRedondeando, dividirTruncando } from './dinero';
import type { DecimalSql } from '../tipos/comunes';

/** Tasa de cambio a bigint escalado (Bs por 1 USD). */
export const aTasaCambio = (v: DecimalSql | number | bigint): bigint =>
  aEntero(v, ESCALA.TASA_CAMBIO);
export const tasaCambioASql = (v: bigint): DecimalSql =>
  aDecimalSql(v, ESCALA.TASA_CAMBIO);

/** Bolivares a bigint escalado (escala 2). */
export const aBs = (v: DecimalSql | number | bigint): bigint => aEntero(v, ESCALA.BS);
export const bsASql = (v: bigint): DecimalSql => aDecimalSql(v, ESCALA.BS);

/** Monto en la moneda del pago, escala 4. */
export const aMontoMoneda = (v: DecimalSql | number | bigint): bigint =>
  aEntero(v, ESCALA.MONTO_MONEDA);
export const montoMonedaASql = (v: bigint): DecimalSql =>
  aDecimalSql(v, ESCALA.MONTO_MONEDA);

/**
 * Convierte USD (centavos, escala 2) a Bs (escala 2) con la tasa dada.
 *
 *   bs = usd * tasa
 *   (escala 2) * (escala 6) = escala 8  -> se reescala a 2 con redondeo half-up
 */
export function usdABs(usdCentavos: bigint, tasaEscalada: bigint): bigint {
  const producto = usdCentavos * tasaEscalada; // escala 2 + 6 = 8
  return dividirRedondeando(producto, 10n ** BigInt(ESCALA.TASA_CAMBIO));
}

/**
 * Convierte Bs (escala 2) a USD (centavos, escala 2) con la tasa dada.
 *
 *   usd = bs / tasa
 * Se sube la escala del numerador para no perder precision antes de dividir.
 */
export function bsAUsd(bsEscalado: bigint, tasaEscalada: bigint): bigint {
  if (tasaEscalada <= 0n) {
    throw new Error('La tasa de cambio debe ser mayor que cero');
  }
  // bs(2) * 10^6 -> escala 8; dividir por tasa(6) deja escala 2.
  const numerador = bsEscalado * 10n ** BigInt(ESCALA.TASA_CAMBIO);
  return dividirRedondeando(numerador, tasaEscalada);
}

/**
 * Convierte un monto en su moneda (escala 4) a su equivalente en USD (centavos).
 * - Si la moneda es USD: solo reescala de 4 a 2.
 * - Si la moneda es VES: divide por la tasa.
 */
export function montoMonedaAUsd(
  montoEscala4: bigint,
  moneda: Moneda,
  tasaEscalada: bigint,
): bigint {
  if (moneda === MONEDA.USD) {
    // escala 4 -> escala 2
    return dividirRedondeando(montoEscala4, 100n);
  }
  // VES: monto(4) -> Bs(2) y luego a USD
  const bs = dividirRedondeando(montoEscala4, 100n);
  return bsAUsd(bs, tasaEscalada);
}

/**
 * Igual que `montoMonedaAUsd` pero truncando (piso) en vez de redondear.
 *
 * Para COBROS: 3.132,00 Bs a la tasa 743 son 4,2153... USD. Con half-up se acreditarian
 * 4,22 USD —un centavo que el cliente no pago— y un cliente con 4,21 de saldo recibiria
 * "el abono supera el saldo pendiente". Con piso se acreditan 4,21.
 */
export function montoMonedaAUsdPiso(
  montoEscala4: bigint,
  moneda: Moneda,
  tasaEscalada: bigint,
): bigint {
  if (moneda === MONEDA.USD) return dividirTruncando(montoEscala4, 100n);
  if (tasaEscalada <= 0n) throw new Error('La tasa de cambio debe ser mayor que cero');
  const bs = dividirTruncando(montoEscala4, 100n); // escala 4 -> 2
  return dividirTruncando(bs * 10n ** BigInt(ESCALA.TASA_CAMBIO), tasaEscalada);
}

// -----------------------------------------------------------------------------
// Libro de creditos (USD escala 4)
// -----------------------------------------------------------------------------
//
// El saldo de un credito es un apunte contable, no un billete: se lleva en escala 4
// para que el residuo de dividir un abono en Bs por la tasa quepa dentro. A 777 Bs/$
// un centavo de dolar vale Bs 7,77 y ese residuo se perdia, siempre en contra del
// cliente. Ver ESCALA.SALDO_USD.
//
// Lo que SI es un billete —el vuelto, el arqueo— se queda en centavos: nadie entrega
// $ 9,0041 en efectivo. Por eso conviven estas funciones con las de escala 2.

/**
 * Convierte un monto en su moneda (escala 4) a saldo USD (escala 4), truncando.
 *
 * Mismo piso que `montoMonedaAUsdPiso` —jamas se acreditan dolares que el cliente no
 * entrego— pero con grano de $ 0,0001 en vez de $ 0,01: lo que se descarta vale
 * Bs 0,08 en lugar de Bs 7,77.
 */
export function montoMonedaASaldoUsdPiso(
  montoEscala4: bigint,
  moneda: Moneda,
  tasaEscalada: bigint,
): bigint {
  if (moneda === MONEDA.USD) return montoEscala4; // ya viene en escala 4
  if (tasaEscalada <= 0n) throw new Error('La tasa de cambio debe ser mayor que cero');
  // monto(4) * 10^6 -> escala 10; dividir por tasa(6) deja escala 4.
  return dividirTruncando(montoEscala4 * 10n ** BigInt(ESCALA.TASA_CAMBIO), tasaEscalada);
}

/** Convierte Bs (escala 2) a saldo USD (escala 4) con la tasa dada. */
export function bsASaldoUsd(bsEscalado: bigint, tasaEscalada: bigint): bigint {
  if (tasaEscalada <= 0n) throw new Error('La tasa de cambio debe ser mayor que cero');
  // bs(2) * 10^8 -> escala 10; dividir por tasa(6) deja escala 4.
  return dividirRedondeando(bsEscalado * 10n ** 8n, tasaEscalada);
}

/** Convierte un saldo USD (escala 4) a Bs (escala 2) con la tasa dada. */
export function saldoUsdABs(saldoUsd4: bigint, tasaEscalada: bigint): bigint {
  // saldo(4) * tasa(6) = escala 10 -> se reescala a 2 con redondeo half-up.
  return dividirRedondeando(saldoUsd4 * tasaEscalada, 10n ** 8n);
}

/**
 * Convierte un monto en USD (centavos) al equivalente en la moneda pedida,
 * en la escala 4 que usan las columnas monto_moneda.
 */
export function usdAMontoMoneda(
  usdCentavos: bigint,
  moneda: Moneda,
  tasaEscalada: bigint,
): bigint {
  if (moneda === MONEDA.USD) {
    return usdCentavos * 100n; // escala 2 -> escala 4
  }
  const bs = usdABs(usdCentavos, tasaEscalada); // escala 2
  return bs * 100n; // escala 2 -> escala 4
}

/**
 * Redondea un monto en Bs al multiplo configurado (0 = sin redondeo).
 * Devuelve el monto redondeado y la diferencia aplicada (puede ser negativa).
 */
export function redondearBs(
  bsEscalado: bigint,
  multiploBs: number,
): { readonly monto: bigint; readonly redondeo: bigint } {
  if (multiploBs <= 0) return { monto: bsEscalado, redondeo: 0n };
  const multiplo = BigInt(Math.round(multiploBs * 100)); // a escala 2
  const redondeado = dividirRedondeando(bsEscalado, multiplo) * multiplo;
  return { monto: redondeado, redondeo: redondeado - bsEscalado };
}

/** Formatea USD (centavos) como "$ 1.234,56" para tickets y PDF del backend. */
export function formatearUSD(usdCentavos: bigint, conSimbolo = true): string {
  return formatearEscala2(usdCentavos, conSimbolo ? '$ ' : '');
}

/** Formatea Bs (escala 2) como "Bs 45.678,90". */
export function formatearBs(bsEscalado: bigint, conSimbolo = true): string {
  return formatearEscala2(bsEscalado, conSimbolo ? 'Bs ' : '');
}

/** Formato es-VE: punto de miles, coma decimal, 2 decimales. */
function formatearEscala2(valor: bigint, prefijo: string): string {
  const negativo = valor < 0n;
  const abs = negativo ? -valor : valor;
  const entera = abs / 100n;
  const dec = (abs % 100n).toString().padStart(2, '0');
  const conMiles = entera.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${negativo ? '-' : ''}${prefijo}${conMiles},${dec}`;
}
