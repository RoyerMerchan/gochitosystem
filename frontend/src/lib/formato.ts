/**
 * Formateo bimonetario USD / Bolivares y fechas (Venezuela, America/Caracas).
 * Los DECIMAL llegan como string desde el backend; aqui se formatean para mostrar.
 */
import dayjs from 'dayjs';
import 'dayjs/locale/es';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
import customParseFormat from 'dayjs/plugin/customParseFormat';
import relativeTime from 'dayjs/plugin/relativeTime';

dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.extend(customParseFormat);
dayjs.extend(relativeTime);
dayjs.locale('es');

export const ZONA_HORARIA = 'America/Caracas';
export const LOCALE = 'es-VE';

export const FORMATO_FECHA = 'DD/MM/YYYY';
export const FORMATO_FECHA_HORA = 'DD/MM/YYYY hh:mm A';
export const FORMATO_ISO = 'YYYY-MM-DD';

type EntradaFecha = string | number | Date | dayjs.Dayjs | null | undefined;

/* ------------------------------------------------------------------ */
/* Dinero                                                              */
/* ------------------------------------------------------------------ */

/** Convierte a numero un valor que puede venir como string decimal del backend. */
export function aNumero(valor: unknown): number {
  if (typeof valor === 'number') return Number.isFinite(valor) ? valor : 0;
  if (typeof valor === 'string') {
    const n = Number(valor);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

const fmtUSD = new Intl.NumberFormat(LOCALE, {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const fmtBs = new Intl.NumberFormat(LOCALE, {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** Dolares: $ 1.234,56 */
export function formatearUSD(valor: unknown, conSimbolo = true): string {
  const s = fmtUSD.format(aNumero(valor));
  return conSimbolo ? `$ ${s}` : s;
}

/** Bolivares: Bs 45.678,90 */
export function formatearBs(valor: unknown, conSimbolo = true): string {
  const s = fmtBs.format(aNumero(valor));
  return conSimbolo ? `Bs ${s}` : s;
}

/** Convierte un monto en USD a Bs con la tasa dada (string o number). */
export function usdABs(usd: unknown, tasa: unknown): number {
  return aNumero(usd) * aNumero(tasa);
}

/** Dolares compactos para tarjetas: $ 1,3 K */
export function formatearUSDCompacto(valor: unknown): string {
  const n = aNumero(valor);
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `$ ${formatearNumero(n / 1_000_000, 1)} M`;
  if (abs >= 1_000) return `$ ${formatearNumero(n / 1_000, 1)} K`;
  return formatearUSD(n);
}

/* ------------------------------------------------------------------ */
/* Numeros y cantidades                                                */
/* ------------------------------------------------------------------ */

export function formatearNumero(valor: unknown, decimales = 0): string {
  return new Intl.NumberFormat(LOCALE, {
    minimumFractionDigits: decimales,
    maximumFractionDigits: decimales,
  }).format(aNumero(valor));
}

/** Cantidades de inventario DECIMAL(14,3), sin ceros sobrantes. */
export function formatearCantidad(valor: unknown, decimalesMax = 3): string {
  return new Intl.NumberFormat(LOCALE, {
    minimumFractionDigits: 0,
    maximumFractionDigits: decimalesMax,
  }).format(aNumero(valor));
}

export function formatearPorcentaje(valor: unknown, decimales = 1): string {
  return `${formatearNumero(valor, decimales)} %`;
}

export function calcularMargen(utilidad: unknown, venta: unknown): number {
  const v = aNumero(venta);
  if (v === 0) return 0;
  return (aNumero(utilidad) / v) * 100;
}

/** Monto sin simbolo, 2 decimales: 1.234,56 (para inputs de dinero). */
export function formatearMonedaSinSimbolo(valor: unknown): string {
  return fmtUSD.format(aNumero(valor));
}

/** Quita todo lo que no sea digito, coma, punto o signo. */
export function soloDigitos(texto: string): string {
  const negativo = texto.trim().startsWith('-');
  const limpio = texto.replace(/[^\d.,]/g, '');
  return negativo && limpio ? `-${limpio}` : limpio;
}

/** Parsea un texto formateado ("1.234,56") a numero. */
export function parsearMoneda(texto: string): number {
  const limpio = soloDigitos(texto).replace(/\./g, '').replace(',', '.');
  if (!limpio || limpio === '-') return 0;
  const n = Number(limpio);
  return Number.isFinite(n) ? n : 0;
}

/* ------------------------------------------------------------------ */
/* Fechas (America/Caracas)                                            */
/* ------------------------------------------------------------------ */

export function enCaracas(valor: EntradaFecha): dayjs.Dayjs {
  return dayjs(valor ?? undefined).tz(ZONA_HORARIA);
}

export function formatearFecha(valor: EntradaFecha): string {
  if (!valor) return '—';
  const d = enCaracas(valor);
  return d.isValid() ? d.format(FORMATO_FECHA) : '—';
}

export function formatearFechaHora(valor: EntradaFecha): string {
  if (!valor) return '—';
  const d = enCaracas(valor);
  return d.isValid() ? d.format(FORMATO_FECHA_HORA) : '—';
}

export function aFechaApi(valor: EntradaFecha): string {
  const d = enCaracas(valor);
  return d.isValid() ? d.format(FORMATO_ISO) : '';
}

export function formatearRelativo(valor: EntradaFecha): string {
  if (!valor) return '—';
  const d = enCaracas(valor);
  return d.isValid() ? d.fromNow() : '—';
}

export function hoyApi(): string {
  return dayjs().tz(ZONA_HORARIA).format(FORMATO_ISO);
}

/* ------------------------------------------------------------------ */
/* Texto                                                               */
/* ------------------------------------------------------------------ */

export function iniciales(nombre: string | null | undefined): string {
  if (!nombre) return '?';
  const partes = nombre.trim().split(/\s+/).filter(Boolean);
  const primera = partes[0]?.[0] ?? '';
  const segunda = partes.length > 1 ? (partes[partes.length - 1]?.[0] ?? '') : '';
  return (primera + segunda).toUpperCase() || '?';
}

export function truncar(texto: string, largo = 40): string {
  return texto.length <= largo ? texto : `${texto.slice(0, largo - 1)}…`;
}

export function normalizar(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
}

export { dayjs };
