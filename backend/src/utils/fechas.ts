/**
 * Fechas del dominio, siempre en America/Bogota (UTC-5, sin horario de verano).
 *
 * MariaDB guarda DATETIME(3) sin zona: se escribe y se lee la hora local de Bogota.
 * Por eso las conversiones a string usan SIEMPRE el formato de MariaDB.
 */
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
import customParseFormat from 'dayjs/plugin/customParseFormat';
import isSameOrBefore from 'dayjs/plugin/isSameOrBefore';
import isSameOrAfter from 'dayjs/plugin/isSameOrAfter';
import 'dayjs/locale/es';

dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.extend(customParseFormat);
dayjs.extend(isSameOrBefore);
dayjs.extend(isSameOrAfter);
dayjs.locale('es');

export const ZONA_BOGOTA = 'America/Bogota';

/** Formato que entiende MariaDB para DATETIME(3). */
export const FORMATO_SQL_DATETIME = 'YYYY-MM-DD HH:mm:ss.SSS';
/** Formato que entiende MariaDB para DATE. */
export const FORMATO_SQL_DATE = 'YYYY-MM-DD';
/** Formato de presentacion en la interfaz. */
export const FORMATO_UI = 'DD/MM/YYYY';
export const FORMATO_UI_HORA = 'DD/MM/YYYY HH:mm';

export type EntradaFecha = string | number | Date | dayjs.Dayjs;

/** Convierte cualquier entrada a un dayjs en la zona de Bogota. */
export function enBogota(valor?: EntradaFecha): dayjs.Dayjs {
  return valor === undefined ? dayjs().tz(ZONA_BOGOTA) : dayjs(valor).tz(ZONA_BOGOTA);
}

/** Instante actual en Bogota. */
export const ahora = (): dayjs.Dayjs => enBogota();

/** Ahora en formato DATETIME(3) para MariaDB. */
export const ahoraSql = (): string => enBogota().format(FORMATO_SQL_DATETIME);

/** Convierte a DATETIME(3) de MariaDB. */
export const aSqlDateTime = (valor: EntradaFecha): string =>
  enBogota(valor).format(FORMATO_SQL_DATETIME);

/** Convierte a DATE de MariaDB. */
export const aSqlDate = (valor: EntradaFecha): string =>
  enBogota(valor).format(FORMATO_SQL_DATE);

/** Formatea para la interfaz: dd/MM/yyyy. */
export const aFormatoUi = (valor: EntradaFecha): string =>
  enBogota(valor).format(FORMATO_UI);

/** Formatea para la interfaz con hora: dd/MM/yyyy HH:mm. */
export const aFormatoUiConHora = (valor: EntradaFecha): string =>
  enBogota(valor).format(FORMATO_UI_HORA);

/** Inicio del dia (00:00:00.000) en Bogota. */
export const inicioDelDia = (valor?: EntradaFecha): dayjs.Dayjs =>
  enBogota(valor).startOf('day');

/** Fin del dia (23:59:59.999) en Bogota. */
export const finDelDia = (valor?: EntradaFecha): dayjs.Dayjs =>
  enBogota(valor).endOf('day');

/**
 * Normaliza un rango [desde, hasta] a limites SQL inclusivos del dia completo.
 * Si no se envia rango, devuelve el dia de hoy.
 */
export function rangoSql(
  desde?: string,
  hasta?: string,
): { desde: string; hasta: string } {
  const inicio = inicioDelDia(desde ?? undefined);
  const fin = finDelDia(hasta ?? desde ?? undefined);
  return {
    desde: inicio.format(FORMATO_SQL_DATETIME),
    hasta: fin.format(FORMATO_SQL_DATETIME),
  };
}

/** Anio calendario en Bogota; se usa para la clave de los consecutivos. */
export const anioActual = (valor?: EntradaFecha): number => enBogota(valor).year();

/** Suma dias y devuelve el DATETIME(3) resultante (plazos de credito, expiraciones). */
export const sumarDiasSql = (dias: number, desde?: EntradaFecha): string =>
  enBogota(desde).add(dias, 'day').format(FORMATO_SQL_DATETIME);

/** Suma horas y devuelve el DATETIME(3) resultante (vigencia de idempotencia). */
export const sumarHorasSql = (horas: number, desde?: EntradaFecha): string =>
  enBogota(desde).add(horas, 'hour').format(FORMATO_SQL_DATETIME);

/** Dias vencidos de una fecha de vencimiento respecto a hoy; 0 si aun no vence. */
export function diasVencidos(fechaVencimiento: EntradaFecha): number {
  const diferencia = inicioDelDia().diff(inicioDelDia(fechaVencimiento), 'day');
  return diferencia > 0 ? diferencia : 0;
}

/** Valida que un string sea una fecha real en formato YYYY-MM-DD. */
export function esFechaSqlValida(valor: string): boolean {
  return dayjs(valor, FORMATO_SQL_DATE, true).isValid();
}

export { dayjs };
