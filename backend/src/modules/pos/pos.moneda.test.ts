import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../database/pool', () => ({
  query: vi.fn(), queryOne: vi.fn(), ejecutar: vi.fn(), insertar: vi.fn(),
  withTransaction: (fn: (cx: object) => unknown) => fn({}),
}));
vi.mock('../../database/esquema', () => ({ existeColumna: vi.fn(async () => true) }));
vi.mock('../tasas/tasas.service', () => ({ exigirTasaDeHoy: async () => ({ id: 1, tasa: '777.000000' }) }));
vi.mock('../../utils/consecutivos', () => ({ siguienteConsecutivo: async () => ({ numero: 1, prefijo: 'V-' }) }));
vi.mock('../caja/caja.service', () => ({
  turnoActivoDeUsuario: async () => ({ id: 1 }), registrarMovimiento: vi.fn(), registrarMovimientos: vi.fn(),
}));

import { query, queryOne, insertar } from '../../database/pool';
import { registrarVenta } from './pos.service';
import type { VentaEntrada } from './pos.types';

const usuario = { id: 1, sucursalId: 1, usuario: 'test', nombreCompleto: 'Test', rolId: 1,
  rolCodigo: 'ADMIN', debeCambiarPassword: false };
const producto = (id: number, precio: string, moneda: 'USD' | 'VES') => ({
  id, nombre: `Producto ${id}`, categoria_id: 1, unidad_medida_id: 1, impuesto_id: 1,
  impuesto_tasa: '0', precio_venta: precio, moneda_precio: moneda,
  es_precio_incluye_impuesto: true, es_maneja_inventario: false, esta_activo: true,
  cantidad: '100', costo_promedio: '0.01',
});

describe('Venta con precios nativos en Bs', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(insertar).mockResolvedValue(1);
    vi.mocked(query).mockImplementation(async (sql) => {
      if (sql.includes('FROM productos p')) return [producto(1, '100', 'VES'), producto(2, '2', 'USD')] as never;
      if (sql.includes('FROM metodos_pago')) return [
        { id: 1, moneda: 'VES', requiere_referencia: false, afecta_caja_efectivo: true, es_no_es_cobro: false, esta_activo: true },
        { id: 2, moneda: 'VES', requiere_referencia: false, afecta_caja_efectivo: false, es_no_es_cobro: true, esta_activo: true },
      ] as never;
      throw new Error(`Consulta inesperada: ${sql}`);
    });
    vi.mocked(queryOne).mockImplementation(async (sql) => {
      if (sql.includes('cupo_credito')) return { es_permite_credito: true, esta_bloqueado: false, cupo_credito: '1000' } as never;
      if (sql.includes('deuda_usd')) return { deuda_usd: '0' } as never;
      if (sql.includes('dias_plazo')) return { dias_plazo: 30, mora_defecto: '0', mora_cada_dias: 3 } as never;
      throw new Error(`Consulta inesperada: ${sql}`);
    });
  });

  it('cobra Bs 100 exactos tomando el precio de la base y congela el total', async () => {
    const venta = await registrarVenta({ renglones: [{ productoId: 1, cantidad: '1' }],
      pagos: [{ metodoPagoId: 1, montoMoneda: '100' }] }, usuario, null);
    expect(venta.total_bs).toBe('100.00');
    expect(venta.total_credito_usd).toBe('0.00');
    expect(venta.vuelto_usd).toBe('0.00');
  });

  it('suma USD y Bs y permite cobrar el precio al mayor nativo', async () => {
    const venta = await registrarVenta({ renglones: [
      { productoId: 1, cantidad: '2', precioUnitarioBs: '80' },
      { productoId: 2, cantidad: '1' },
    ], pagos: [{ metodoPagoId: 1, montoMoneda: '1714' }] }, usuario, null);
    expect(venta.total_bs).toBe('1714.00');
    expect(venta.total_credito_usd).toBe('0.00');
  });

  it('reconcilia el redondeo de varias líneas a crédito sin pagos negativos', async () => {
    const entrada: VentaEntrada = { clienteId: 2,
      renglones: Array.from({ length: 10 }, () => ({ productoId: 1, cantidad: '1', precioUnitarioBs: '96' })),
      pagos: [{ metodoPagoId: 2, montoMoneda: '960' }],
    };
    const venta = await registrarVenta(entrada, usuario, null);
    expect(venta.total_bs).toBe('960.00');
    expect(venta.total_pagado_usd).toBe('0.00');
    expect(venta.total_credito_usd).toBe('1.24');
  });

  it('mantiene el comportamiento de productos en dólares', async () => {
    const venta = await registrarVenta({ renglones: [{ productoId: 2, cantidad: '1' }],
      pagos: [{ metodoPagoId: 1, montoMoneda: '1554' }] }, usuario, null);
    expect(venta.total_usd).toBe('2.00');
    expect(venta.total_bs).toBe('1554.00');
  });
});
