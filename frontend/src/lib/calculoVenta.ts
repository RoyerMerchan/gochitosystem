/**
 * Aritmetica de renglones del POS. Es el ESPEJO EXACTO de `calcularRenglones` en
 * backend/src/modules/pos/pos.service.ts: mismos redondeos y en el mismo orden.
 *
 * POR QUE IMPORTA: el backend redondea CADA renglon a centavos y despues suma; la
 * pantalla sumaba en crudo y redondeaba al final. Con cantidades fraccionadas los dos
 * totales no coinciden:
 *
 *   0,304 x $ 9,00  = 2,736 -> $ 2,74
 *   0,500 x $ 2,05  = 1,025 -> $ 1,03
 *   1,000 x $ 2,30  = 2,300 -> $ 2,30
 *   por renglon: $ 6,07      en crudo: 6,061 -> $ 6,06
 *
 * El cajero cobraba los Bs de $ 6,06 y el backend esperaba $ 6,07: ese centavo se
 * interpretaba como venta impaga y abria un credito de $ 0,01 (o reventaba con
 * "el cliente no tiene credito habilitado" si el cliente no maneja credito).
 * Los renglones en pantalla tampoco sumaban el total mostrado.
 */
import { redondearCentavos } from './formato';

export interface RenglonCalculable {
  precioUnitario: number;
  descuentoUnitario: number;
  cantidad: number;
  /** Tasa de impuesto en puntos porcentuales (16 = 16 %). */
  impuestoTasa: number;
  /**
   * `false` = el precio NO trae el impuesto y hay que agregarlo encima.
   * `undefined` cuenta como incluido: los carritos ya persistidos en localStorage
   * no tienen el campo y el comportamiento historico era no agregar nada.
   */
  esPrecioIncluyeImpuesto?: boolean;
}

export interface DesgloseLinea {
  /** Base gravable, sin impuesto. */
  base: number;
  impuesto: number;
  /** Siempre base + impuesto. Es el `total_linea` que guarda el backend. */
  total: number;
}

/** Desglose de un renglon con el mismo orden de redondeos que el backend. */
export function desgloseLinea(r: RenglonCalculable): DesgloseLinea {
  // Bruto y descuento se redondean por separado, igual que multiplicarPorCantidad().
  const bruto = redondearCentavos(r.precioUnitario * r.cantidad);
  const descuento = redondearCentavos(r.descuentoUnitario * r.cantidad);
  const neto = Math.max(0, redondearCentavos(bruto - descuento));
  const tasa = r.impuestoTasa || 0;

  if (r.esPrecioIncluyeImpuesto === false) {
    const impuesto = redondearCentavos((neto * tasa) / 100);
    return { base: neto, impuesto, total: redondearCentavos(neto + impuesto) };
  }

  // Precio con impuesto incluido: se desagrega y el impuesto sale por diferencia
  // para que base + impuesto sea exactamente el neto (sin descuadres de un centavo).
  const base = tasa > 0 ? redondearCentavos((neto * 100) / (100 + tasa)) : neto;
  return { base, impuesto: redondearCentavos(neto - base), total: neto };
}

/** Total del renglon en USD, ya redondeado a centavos. */
export function totalLineaUsd(r: RenglonCalculable): number {
  return desgloseLinea(r).total;
}

/** Total del documento: suma de renglones YA redondeados, igual que el backend. */
export function totalDocumentoUsd(renglones: readonly RenglonCalculable[]): number {
  return redondearCentavos(renglones.reduce((acc, r) => acc + totalLineaUsd(r), 0));
}

/** Impuesto total del documento (suma de los impuestos por renglon). */
export function impuestoDocumentoUsd(renglones: readonly RenglonCalculable[]): number {
  return redondearCentavos(renglones.reduce((acc, r) => acc + desgloseLinea(r).impuesto, 0));
}
