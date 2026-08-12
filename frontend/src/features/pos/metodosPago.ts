/**
 * Metodos de pago del negocio. Coinciden con los IDs sembrados en database/seed.sql.
 * (Cuando exista el modulo /metodos-pago del backend, esto se reemplaza por un fetch.)
 */
export interface MetodoPago {
  id: number;
  nombre: string;
  moneda: 'USD' | 'VES';
  requiereReferencia: boolean;
  esCredito: boolean;
  /**
   * Si de este método se puede dar vuelto (espejo de `metodos_pago.es_permite_cambio`).
   * Solo el efectivo: de una transferencia no sale plata de la gaveta.
   */
  permiteCambio: boolean;
}

export const METODOS_PAGO: MetodoPago[] = [
  { id: 1, nombre: 'Efectivo Bs', moneda: 'VES', requiereReferencia: false, esCredito: false, permiteCambio: true },
  { id: 2, nombre: 'Efectivo USD', moneda: 'USD', requiereReferencia: false, esCredito: false, permiteCambio: true },
  { id: 3, nombre: 'Pago Móvil', moneda: 'VES', requiereReferencia: true, esCredito: false, permiteCambio: false },
  { id: 4, nombre: 'Transferencia', moneda: 'VES', requiereReferencia: true, esCredito: false, permiteCambio: false },
  { id: 5, nombre: 'Punto de venta', moneda: 'VES', requiereReferencia: true, esCredito: false, permiteCambio: false },
  { id: 6, nombre: 'Zelle', moneda: 'USD', requiereReferencia: true, esCredito: false, permiteCambio: false },
  { id: 7, nombre: 'Binance / USDT', moneda: 'USD', requiereReferencia: true, esCredito: false, permiteCambio: false },
  { id: 8, nombre: 'Crédito (fiado)', moneda: 'USD', requiereReferencia: false, esCredito: true, permiteCambio: false },
];
