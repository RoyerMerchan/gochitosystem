import { describe, expect, it } from 'vitest';
import { precioEnUsd, totalPrecioBs } from './precioProducto';
import { aUnitario, aCantidad, aTasa } from './dinero';
import { aTasaCambio } from './moneda';

describe('Precios fijos en bolívares', () => {
  it('conserva USD y recalcula el equivalente de Bs cuando cambia la tasa', () => {
    expect(precioEnUsd('2.5000', 'USD', null)).toBe('2.5000');
    expect(precioEnUsd('100', 'VES', '200')).toBe('0.5000');
    expect(precioEnUsd('100', 'VES', '250')).toBe('0.4000');
  });

  it('no inventa equivalentes sin una tasa positiva', () => {
    expect(() => precioEnUsd('100', 'VES', null)).toThrow();
    expect(() => precioEnUsd('100', 'VES', '0')).toThrow();
  });

  it('cobra Bs 100 exactos incluso si USD redondeado daría Bs 101,01', () => {
    const total = (tasa: string) => totalPrecioBs(aUnitario('100'), aCantidad('1'), 0n,
      aTasaCambio(tasa), 0n, true);
    expect(precioEnUsd('100', 'VES', '777')).toBe('0.1287');
    expect(total('777')).toBe(10000n);
    expect(total('800')).toBe(10000n);
  });

  it('calcula cantidades fraccionadas, impuestos y descuentos sobre el precio nativo', () => {
    expect(totalPrecioBs(aUnitario('100'), aCantidad('0.375'), 0n,
      aTasaCambio('777'), aTasa('16'), false)).toBe(4350n);
    expect(totalPrecioBs(aUnitario('100'), aCantidad('2'), aUnitario('0.01'),
      aTasaCambio('777'), 0n, true)).toBe(18446n);
  });
});
