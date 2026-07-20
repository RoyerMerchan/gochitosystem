/**
 * Aritmetica monetaria en enteros.
 *
 * REGLA: aqui NUNCA se usa punto flotante. En binario 0.1 + 0.2 !== 0.3 y un arqueo
 * de caja que no cuadra por un centavo es un bug que nadie encuentra (ADR-013).
 *
 * Representacion interna: `bigint` con la cantidad ya escalada.
 *   - Totales      DECIMAL(14,2) -> escala 2 (centavos)
 *   - Unitarios    DECIMAL(14,4) -> escala 4 (diezmilesimas)
 *   - Cantidades   DECIMAL(14,3) -> escala 3 (milesimas)
 *   - Tasas        DECIMAL(6,3)  -> escala 3 (milesimas de punto porcentual)
 *
 * mysql2 esta configurado para devolver DECIMAL como string, de modo que el valor
 * llega intacto desde MariaDB y se convierte a bigint sin pasar por `number`.
 */
import { ESCALA } from '../config/constantes';
import type { DecimalSql } from '../tipos/comunes';

/** 10^n como bigint. */
function potencia10(n: number): bigint {
  return 10n ** BigInt(n);
}

/**
 * Convierte un decimal (string de la base o number de un JSON) a entero escalado.
 * Trunca los decimales sobrantes con redondeo half-up.
 */
export function aEntero(valor: DecimalSql | number | bigint, escala: number): bigint {
  if (typeof valor === 'bigint') return valor;

  const texto = typeof valor === 'number' ? valor.toString() : valor.trim();
  if (!/^-?\d+(\.\d+)?$/.test(texto)) {
    throw new Error(`Valor decimal invalido: "${texto}"`);
  }

  const negativo = texto.startsWith('-');
  const sinSigno = negativo ? texto.slice(1) : texto;
  const [parteEntera = '0', parteDecimal = ''] = sinSigno.split('.');

  // Se toma un decimal extra para poder redondear half-up.
  const decimalesRellenos = parteDecimal.padEnd(escala + 1, '0');
  const conservados = decimalesRellenos.slice(0, escala);
  const siguienteDigito = Number(decimalesRellenos[escala] ?? '0');

  let resultado = BigInt(parteEntera + (conservados === '' ? '' : conservados));
  if (siguienteDigito >= 5) resultado += 1n;

  return negativo ? -resultado : resultado;
}

/** Convierte un entero escalado al string decimal que espera MariaDB. */
export function aDecimalSql(valor: bigint, escala: number): DecimalSql {
  const negativo = valor < 0n;
  const absoluto = negativo ? -valor : valor;
  const divisor = potencia10(escala);

  const entera = absoluto / divisor;
  const decimal = absoluto % divisor;
  const signo = negativo ? '-' : '';

  if (escala === 0) return `${signo}${entera}`;
  return `${signo}${entera}.${decimal.toString().padStart(escala, '0')}`;
}

// -----------------------------------------------------------------------------
// Atajos por familia de columna
// -----------------------------------------------------------------------------

/** DECIMAL(14,2) -> centavos. */
export const aCentavos = (v: DecimalSql | number | bigint): bigint =>
  aEntero(v, ESCALA.TOTAL);
/** centavos -> DECIMAL(14,2). */
export const centavosASql = (v: bigint): DecimalSql => aDecimalSql(v, ESCALA.TOTAL);

/** DECIMAL(14,4) -> diezmilesimas. */
export const aUnitario = (v: DecimalSql | number | bigint): bigint =>
  aEntero(v, ESCALA.UNITARIO);
/** diezmilesimas -> DECIMAL(14,4). */
export const unitarioASql = (v: bigint): DecimalSql => aDecimalSql(v, ESCALA.UNITARIO);

/** DECIMAL(14,3) -> milesimas. */
export const aCantidad = (v: DecimalSql | number | bigint): bigint =>
  aEntero(v, ESCALA.CANTIDAD);
/** milesimas -> DECIMAL(14,3). */
export const cantidadASql = (v: bigint): DecimalSql => aDecimalSql(v, ESCALA.CANTIDAD);

/** DECIMAL(6,3) -> milesimas de punto porcentual (19.000 % -> 19000n). */
export const aTasa = (v: DecimalSql | number | bigint): bigint => aEntero(v, ESCALA.TASA);
/** milesimas de punto porcentual -> DECIMAL(6,3). */
export const tasaASql = (v: bigint): DecimalSql => aDecimalSql(v, ESCALA.TASA);

// -----------------------------------------------------------------------------
// Operaciones basicas
// -----------------------------------------------------------------------------

/** Division entera con redondeo half-up, correcta para negativos. */
export function dividirRedondeando(numerador: bigint, denominador: bigint): bigint {
  if (denominador === 0n) throw new Error('Division por cero en calculo monetario');

  const negativo = numerador < 0n !== denominador < 0n;
  const n = numerador < 0n ? -numerador : numerador;
  const d = denominador < 0n ? -denominador : denominador;

  const cociente = n / d;
  const resto = n % d;
  // half-up: se sube si el resto es >= la mitad del divisor.
  const ajustado = resto * 2n >= d ? cociente + 1n : cociente;

  return negativo ? -ajustado : ajustado;
}

/** Multiplica un valor escalado por una cantidad escalada y devuelve escala `escalaSalida`. */
export function multiplicarPorCantidad(
  valorUnitario: bigint,
  cantidad: bigint,
  escalaSalida: number = ESCALA.TOTAL,
): bigint {
  // valorUnitario tiene escala UNITARIO(4) y cantidad escala CANTIDAD(3):
  // el producto queda en escala 7 y se reescala a la salida deseada.
  const producto = valorUnitario * cantidad;
  const escalaProducto = ESCALA.UNITARIO + ESCALA.CANTIDAD;
  return reescalar(producto, escalaProducto, escalaSalida);
}

/** Cambia la escala de un entero escalado, redondeando half-up si se reduce. */
export function reescalar(valor: bigint, escalaOrigen: number, escalaDestino: number): bigint {
  if (escalaOrigen === escalaDestino) return valor;
  if (escalaDestino > escalaOrigen) {
    return valor * potencia10(escalaDestino - escalaOrigen);
  }
  return dividirRedondeando(valor, potencia10(escalaOrigen - escalaDestino));
}

/** Aplica un porcentaje (en milesimas de punto) sobre una base escalada. */
export function aplicarPorcentaje(base: bigint, tasaMilesimas: bigint): bigint {
  // base * (tasa/1000) / 100 = base * tasa / 100000
  return dividirRedondeando(base * tasaMilesimas, 100_000n);
}

// -----------------------------------------------------------------------------
// Impuestos
// -----------------------------------------------------------------------------

export interface DesgloseImpuesto {
  /** Base gravable, sin impuesto. */
  readonly base: bigint;
  /** Monto del impuesto. */
  readonly impuesto: bigint;
  /** Total con impuesto. Siempre base + impuesto, sin descuadres de un centavo. */
  readonly total: bigint;
}

/**
 * Desagrega un precio que YA incluye impuesto (productos.es_precio_incluye_impuesto = 1).
 *   base = precio / (1 + tasa/100)
 * El impuesto se obtiene por diferencia para garantizar base + impuesto === precio.
 */
export function desagregarImpuesto(
  precioConImpuesto: bigint,
  tasaMilesimas: bigint,
): DesgloseImpuesto {
  if (tasaMilesimas === 0n) {
    return { base: precioConImpuesto, impuesto: 0n, total: precioConImpuesto };
  }
  const base = dividirRedondeando(
    precioConImpuesto * 100_000n,
    100_000n + tasaMilesimas,
  );
  return {
    base,
    impuesto: precioConImpuesto - base,
    total: precioConImpuesto,
  };
}

/** Agrega el impuesto a una base gravable (es_precio_incluye_impuesto = 0). */
export function agregarImpuesto(base: bigint, tasaMilesimas: bigint): DesgloseImpuesto {
  const impuesto = aplicarPorcentaje(base, tasaMilesimas);
  return { base, impuesto, total: base + impuesto };
}

// -----------------------------------------------------------------------------
// Utilidad (REGLA INNEGOCIABLE)
// -----------------------------------------------------------------------------

/**
 * Utilidad de un renglon, SIEMPRE sobre la base gravable y despues de descuentos.
 *
 *   utilidad_unitaria = (precio_venta_unitario - descuento_unitario) - precio_compra_unitario
 *
 * `precioCompraUnitario` DEBE ser el costo congelado en el INSERT del renglon,
 * nunca productos.costo_promedio leido despues. Ver ADR-001.
 */
export function calcularUtilidadUnitaria(
  precioVentaUnitario: bigint,
  descuentoUnitario: bigint,
  precioCompraUnitario: bigint,
): bigint {
  return precioVentaUnitario - descuentoUnitario - precioCompraUnitario;
}

// -----------------------------------------------------------------------------
// Redondeo del total del documento
// -----------------------------------------------------------------------------

export interface ResultadoRedondeo {
  /** Total ya redondeado al multiplo configurado. */
  readonly total: bigint;
  /** Diferencia aplicada; puede ser negativa. Se guarda en ventas.redondeo. */
  readonly redondeo: bigint;
}

/**
 * Redondea el TOTAL del documento al multiplo configurado (tipicamente 50 pesos).
 * Nunca se redondean los renglones: solo el total (regla 14 del contrato).
 *
 * @param totalCentavos total en centavos
 * @param multiploPesos multiplo en PESOS enteros (parametros['redondeo.multiplo'])
 */
export function redondearTotal(
  totalCentavos: bigint,
  multiploPesos: number,
): ResultadoRedondeo {
  if (multiploPesos <= 1) return { total: totalCentavos, redondeo: 0n };

  const multiploCentavos = BigInt(multiploPesos) * 100n;
  const redondeado =
    dividirRedondeando(totalCentavos, multiploCentavos) * multiploCentavos;

  return { total: redondeado, redondeo: redondeado - totalCentavos };
}

// -----------------------------------------------------------------------------
// Prorrateo del descuento de documento
// -----------------------------------------------------------------------------

/**
 * Reparte un descuento de documento entre los renglones proporcionalmente a su base.
 *
 * El ultimo centavo del prorrateo se asigna al renglon de MAYOR base para que la
 * suma cuadre exacto con el descuento pedido (regla 15 del contrato).
 *
 * @returns un arreglo con el descuento asignado a cada renglon, en el mismo orden.
 */
export function prorratearDescuento(
  basesRenglones: readonly bigint[],
  descuentoTotal: bigint,
): bigint[] {
  if (basesRenglones.length === 0) return [];
  if (descuentoTotal === 0n) return basesRenglones.map(() => 0n);

  const sumaBases = basesRenglones.reduce((acc, b) => acc + b, 0n);
  if (sumaBases <= 0n) return basesRenglones.map(() => 0n);

  // Reparto por defecto (truncado) para no exceder nunca el descuento total.
  const cuotas = basesRenglones.map((base) => (descuentoTotal * base) / sumaBases);
  const asignado = cuotas.reduce((acc, c) => acc + c, 0n);
  const residuo = descuentoTotal - asignado;

  if (residuo !== 0n) {
    let indiceMayor = 0;
    for (let i = 1; i < basesRenglones.length; i += 1) {
      if ((basesRenglones[i] ?? 0n) > (basesRenglones[indiceMayor] ?? 0n)) indiceMayor = i;
    }
    cuotas[indiceMayor] = (cuotas[indiceMayor] ?? 0n) + residuo;
  }

  return cuotas;
}

// -----------------------------------------------------------------------------
// Presentacion
// -----------------------------------------------------------------------------

/**
 * Formatea centavos como pesos colombianos para tickets y reportes del backend.
 * La UI usa Intl en el frontend; esto es para PDF/Excel generados aqui.
 */
export function formatearCOP(centavos: bigint, conSimbolo = true): string {
  const negativo = centavos < 0n;
  const absoluto = negativo ? -centavos : centavos;
  // COP se muestra sin decimales: se redondea a pesos enteros.
  const pesos = dividirRedondeando(absoluto, 100n);

  const conSeparadores = pesos.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${negativo ? '-' : ''}${conSimbolo ? '$ ' : ''}${conSeparadores}`;
}

/** Suma una lista de valores escalados sin riesgo de perdida de precision. */
export function sumar(valores: readonly bigint[]): bigint {
  return valores.reduce((acc, v) => acc + v, 0n);
}

/** Valor absoluto de un bigint. */
export function absoluto(valor: bigint): bigint {
  return valor < 0n ? -valor : valor;
}
