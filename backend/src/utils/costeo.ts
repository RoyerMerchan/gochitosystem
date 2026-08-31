/**
 * Costo promedio ponderado movil (CPP), en un solo lugar.
 *
 * Lo usan las entradas de mercancia (compras) y los ajustes de inventario que
 * entran con costo. Antes la formula vivia suelta dentro de compras.service.ts,
 * y el ajuste no tenia ninguna: metia unidades valorizandolas al costo viejo.
 *
 * Toda la aritmetica es bigint escalado (ver utils/dinero):
 *   cantidad escala 3, costo unitario escala 4, valor de inventario escala 2.
 */
import { multiplicarPorCantidad, dividirRedondeando } from './dinero';

export interface EntradaCosteo {
  /** Existencia antes de la entrada (escala 3). */
  saldoAnterior: bigint;
  /** Costo promedio antes de la entrada (escala 4). */
  cppAnterior: bigint;
  /** Unidades que entran (escala 3, siempre positivo). */
  cantidad: bigint;
  /** Costo unitario de lo que entra (escala 4). */
  costoUnitario: bigint;
  /**
   * TRUE cuando el costo que hay guardado es la SEMILLA que alguien tecleo al
   * crear el producto, no un costo que se haya pagado (producto_stock
   * .costo_confirmado = FALSE). En ese caso la entrada lo PISA en vez de
   * promediarlo: promediar un estimado con plata real ensucia el CPP, y ese CPP
   * es el que se congela como costo en cada venta (ADR-001).
   */
  esSemilla: boolean;
}

/**
 * CPP despues de una entrada.
 *
 *   CPP = (saldoAnterior x cppAnterior + cantidad x costoUnitario) / saldoPosterior
 *
 * Se pisa con el costo de la entrada cuando lo anterior no vale como referencia:
 * el costo guardado es semilla, o no habia existencia contra la cual promediar.
 */
export function costoPromedioTrasEntrada(d: EntradaCosteo): bigint {
  const saldoPosterior = d.saldoAnterior + d.cantidad;
  if (d.esSemilla || d.saldoAnterior <= 0n || saldoPosterior <= 0n) return d.costoUnitario;

  const valorAnterior = multiplicarPorCantidad(d.cppAnterior, d.saldoAnterior); // escala 2
  const valorEntrada = multiplicarPorCantidad(d.costoUnitario, d.cantidad); // escala 2

  // cpp nuevo (escala 4) = valorTotal(escala 2) / saldoPosterior real
  //   saldoPosterior_real = saldoPosterior_esc3 / 10^3
  //   cpp4 = valorTotal_esc2 * 10^2 * 10^3 / saldoPosterior_esc3
  return dividirRedondeando((valorAnterior + valorEntrada) * 100_000n, saldoPosterior);
}

/** Valor de inventario que entra (escala 2), para el ledger. */
export function valorEntrada(costoUnitario: bigint, cantidad: bigint): bigint {
  return multiplicarPorCantidad(costoUnitario, cantidad);
}
