import { aUnitario, unitarioASql, dividirRedondeando, multiplicarPorCantidad, agregarImpuesto } from './dinero';
import { aTasaCambio, usdABs } from './moneda';

/** Convierte precios unitarios conservando cuatro decimales. */
export function precioEnUsd(precio: string, moneda: 'USD' | 'VES', tasa: string | null): string {
  if (moneda === 'USD') return precio;
  if (!tasa || aTasaCambio(tasa) <= 0n) throw new Error('Se requiere una tasa para convertir el precio en Bs');
  return unitarioASql(dividirRedondeando(aUnitario(precio) * 1_000_000n, aTasaCambio(tasa)));
}

/** Total nativo en Bs; evita redondear a centavos USD antes de cobrar. */
export function totalPrecioBs(precioBs: bigint, cantidad: bigint, descuentoUsd: bigint,
  tasa: bigint, impuesto: bigint, incluye: boolean): bigint {
  const bruto = multiplicarPorCantidad(precioBs, cantidad);
  const descuento = usdABs(multiplicarPorCantidad(descuentoUsd, cantidad), tasa);
  const neto = bruto > descuento ? bruto - descuento : 0n;
  return incluye ? neto : neto + agregarImpuesto(neto, impuesto).impuesto;
}
