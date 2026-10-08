import type { Producto } from '@/lib/tipos';

export type CampoPeso = 'bs' | 'usd' | 'kg';

/** Precio final por kg. No redondear a centavos antes de convertir el monto. */
export function precioPorKg(producto: Producto): number | null {
  const unidad = producto.unidad_codigo.toUpperCase();
  if (!['KG', 'GR', 'G'].includes(unidad)) return null;
  const precio = Number(producto.precio_venta);
  const impuesto = Number(producto.impuesto_tasa);
  const factorImpuesto = Number(producto.es_precio_incluye_impuesto) === 0 ? 1 + impuesto / 100 : 1;
  const resultado = precio * factorImpuesto * (unidad === 'KG' ? 1 : 1000);
  return Number.isFinite(resultado) && resultado > 0 ? resultado : null;
}

/** Conversión de consulta: conserva la precisión hasta presentar los resultados. */
export function calcularPeso(campo: CampoPeso, valor: number, precioKg: number, tasa: number) {
  if (![valor, precioKg, tasa].every(Number.isFinite) || valor < 0 || precioKg <= 0 || tasa <= 0) return null;
  const usd = campo === 'bs' ? valor / tasa : campo === 'kg' ? valor * precioKg : valor;
  const resultado = { usd, bs: campo === 'bs' ? valor : usd * tasa, kg: campo === 'kg' ? valor : usd / precioKg };
  return Object.values(resultado).every(Number.isFinite) ? resultado : null;
}
