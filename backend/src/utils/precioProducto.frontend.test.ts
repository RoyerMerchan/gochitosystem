import { describe, expect, it } from 'vitest';
import { totalDocumentoBs, totalLineaBs } from '../../../frontend/src/lib/calculoVenta';

const fijo = { precioUnitario: 0.1287, precioUnitarioBs: 100, cantidad: 1,
  descuentoUnitario: 0, impuestoTasa: 0, esPrecioIncluyeImpuesto: true };

describe('Cobro de precios fijos en Bs en pantalla', () => {
  it('conserva Bs 100 al variar la tasa', () => {
    expect(totalLineaBs(fijo, 777)).toBe(100);
    expect(totalLineaBs(fijo, 800)).toBe(100);
  });
  it('suma precios fijos y productos en dólares sin reconvertir los fijos', () => {
    expect(totalDocumentoBs([fijo, { ...fijo, precioUnitarioBs: undefined, precioUnitario: 2 }], 777)).toBe(1654);
    expect(totalDocumentoBs(Array(10).fill(fijo), 777)).toBe(1000);
  });
  it('coincide con el backend para peso, impuestos y descuentos', () => {
    expect(totalLineaBs({ ...fijo, cantidad: 0.375, impuestoTasa: 16, esPrecioIncluyeImpuesto: false }, 777)).toBe(43.5);
    expect(totalLineaBs({ ...fijo, cantidad: 2, descuentoUnitario: 0.01 }, 777)).toBe(184.46);
  });
  it('conserva el cálculo anterior cuando todos los precios son USD', () => {
    expect(totalDocumentoBs([{ ...fijo, precioUnitarioBs: undefined, precioUnitario: 2.5, cantidad: 2 }], 777)).toBe(3885);
  });
});
