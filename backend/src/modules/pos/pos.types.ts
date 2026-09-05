/** Tipos del modulo POS. */
import type { Id } from '../../tipos/comunes';

export interface RenglonVentaEntrada {
  readonly productoId: Id;
  readonly cantidad: string;
  /** Precio de venta unitario en USD. Si se omite, se toma el del producto. */
  readonly precioUnitario?: string;
  /** Descuento unitario en USD sobre este renglon. */
  readonly descuentoUnitario?: string;
}

export interface PagoEntrada {
  readonly metodoPagoId: Id;
  /** Monto entregado en la moneda del metodo. */
  readonly montoMoneda: string;
  /** Referencia (obligatoria si el metodo la exige). */
  readonly referencia?: string;
}

export interface VentaEntrada {
  readonly clienteId?: Id | null;
  readonly renglones: readonly RenglonVentaEntrada[];
  readonly pagos: readonly PagoEntrada[];
  readonly descuentoDocumento?: string;
  readonly observaciones?: string;
  /** Vueltas: en que moneda se entregan (por defecto la del sobrante). */
  readonly monedaVuelto?: 'USD' | 'VES';
  /** Dias de credito pactados para el fiado. Ausente = el plazo fichado del cliente. */
  readonly diasPlazo?: number;
  /** Recargo por atraso, en % del saldo que quede al vencer. Ausente = el de la configuracion. */
  readonly moraPct?: string;
}
