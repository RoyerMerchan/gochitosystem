/**
 * Datos del negocio que salen impresos: ticket de venta y estado de cuenta.
 * Viven en un solo lugar para que los dos documentos digan lo mismo.
 */
export interface DatosNegocio {
  nombre: string;
  direccion?: string | null;
  telefono?: string | null;
  rif?: string | null;
  pie?: string | null;
}

export const NEGOCIO: DatosNegocio = {
  nombre: 'MINI MARKET LOS GOCHITOS',
  direccion: 'Residencia Kimura, Torre 10 Apto. PBD',
  telefono: '0412-6837180',
  pie: 'Gracias por su compra',
};
