/**
 * Constantes del dominio.
 *
 * IMPORTANTE: cada objeto de este archivo replica LITERALMENTE un ENUM declarado en
 * docs/contrato-canonico.json. Si se agrega un valor aqui sin la migracion
 * correspondiente, el INSERT falla con sql_mode STRICT. Nunca inventar valores.
 */

/** Estados de una venta (tabla `ventas`). */
export const ESTADO_VENTA = {
  ABIERTA: 'ABIERTA',
  CERRADA: 'CERRADA',
  ANULADA: 'ANULADA',
} as const;
export type EstadoVenta = (typeof ESTADO_VENTA)[keyof typeof ESTADO_VENTA];

/** Estados de una compra (tabla `compras`). */
export const ESTADO_COMPRA = {
  BORRADOR: 'BORRADOR',
  RECIBIDA: 'RECIBIDA',
  ANULADA: 'ANULADA',
} as const;
export type EstadoCompra = (typeof ESTADO_COMPRA)[keyof typeof ESTADO_COMPRA];

/** Condicion de pago de una compra (tabla `compras`). */
export const CONDICION_PAGO = {
  CONTADO: 'CONTADO',
  CREDITO: 'CREDITO',
} as const;
export type CondicionPago = (typeof CONDICION_PAGO)[keyof typeof CONDICION_PAGO];

/** Estados de un credito de cartera (tabla `creditos`). */
export const ESTADO_CREDITO = {
  PENDIENTE: 'PENDIENTE',
  PARCIAL: 'PARCIAL',
  PAGADO: 'PAGADO',
  VENCIDO: 'VENCIDO',
  ANULADO: 'ANULADO',
} as const;
export type EstadoCredito = (typeof ESTADO_CREDITO)[keyof typeof ESTADO_CREDITO];

/** Origen de un credito (tabla `creditos`). */
export const ORIGEN_CREDITO = {
  VENTA: 'VENTA',
  SALDO_INICIAL: 'SALDO_INICIAL',
  NOTA_DEBITO: 'NOTA_DEBITO',
  AJUSTE: 'AJUSTE',
} as const;
export type OrigenCredito = (typeof ORIGEN_CREDITO)[keyof typeof ORIGEN_CREDITO];

/** Estados de un abono (tabla `abonos`). */
export const ESTADO_ABONO = {
  APLICADO: 'APLICADO',
  ANULADO: 'ANULADO',
} as const;
export type EstadoAbono = (typeof ESTADO_ABONO)[keyof typeof ESTADO_ABONO];

/** Estados de un turno de caja (tabla `turnos_caja`). */
export const ESTADO_TURNO = {
  ABIERTO: 'ABIERTO',
  CERRADO: 'CERRADO',
  CUADRADO: 'CUADRADO',
} as const;
export type EstadoTurno = (typeof ESTADO_TURNO)[keyof typeof ESTADO_TURNO];

/**
 * Tipos de movimiento de inventario (tabla `inventario_movimientos`).
 * El libro es APPEND-ONLY: un error se corrige con un movimiento compensatorio.
 */
export const TIPO_MOVIMIENTO_INVENTARIO = {
  INICIAL: 'INICIAL',
  ENTRADA_COMPRA: 'ENTRADA_COMPRA',
  SALIDA_VENTA: 'SALIDA_VENTA',
  DEVOLUCION_CLIENTE: 'DEVOLUCION_CLIENTE',
  DEVOLUCION_PROVEEDOR: 'DEVOLUCION_PROVEEDOR',
  AJUSTE_POSITIVO: 'AJUSTE_POSITIVO',
  AJUSTE_NEGATIVO: 'AJUSTE_NEGATIVO',
  MERMA: 'MERMA',
  TRASLADO_ENTRADA: 'TRASLADO_ENTRADA',
  TRASLADO_SALIDA: 'TRASLADO_SALIDA',
  ANULACION_VENTA: 'ANULACION_VENTA',
  ANULACION_COMPRA: 'ANULACION_COMPRA',
} as const;
export type TipoMovimientoInventario =
  (typeof TIPO_MOVIMIENTO_INVENTARIO)[keyof typeof TIPO_MOVIMIENTO_INVENTARIO];

/**
 * Signo contable de cada tipo de movimiento sobre la existencia.
 * producto_stock.cantidad debe reconciliar con SUM(signo * cantidad).
 */
export const SIGNO_MOVIMIENTO_INVENTARIO: Readonly<
  Record<TipoMovimientoInventario, 1 | -1>
> = {
  INICIAL: 1,
  ENTRADA_COMPRA: 1,
  SALIDA_VENTA: -1,
  DEVOLUCION_CLIENTE: 1,
  DEVOLUCION_PROVEEDOR: -1,
  AJUSTE_POSITIVO: 1,
  AJUSTE_NEGATIVO: -1,
  MERMA: -1,
  TRASLADO_ENTRADA: 1,
  TRASLADO_SALIDA: -1,
  ANULACION_VENTA: 1,
  ANULACION_COMPRA: -1,
} as const;

/** Tipo de documento origen de un movimiento de inventario. */
export const DOCUMENTO_TIPO_MOVIMIENTO = {
  VENTA: 'VENTA',
  COMPRA: 'COMPRA',
  AJUSTE: 'AJUSTE',
  DEVOLUCION: 'DEVOLUCION',
  TRASLADO: 'TRASLADO',
  INICIAL: 'INICIAL',
} as const;
export type DocumentoTipoMovimiento =
  (typeof DOCUMENTO_TIPO_MOVIMIENTO)[keyof typeof DOCUMENTO_TIPO_MOVIMIENTO];

/**
 * Tipos de documento con consecutivo propio (tabla `consecutivos`).
 * El numero se entrega con SELECT ... FOR UPDATE, nunca con AUTO_INCREMENT.
 */
export const TIPO_DOCUMENTO = {
  VENTA: 'VENTA',
  COMPRA: 'COMPRA',
  ABONO: 'ABONO',
  DEVOLUCION_VENTA: 'DEVOLUCION_VENTA',
  DEVOLUCION_COMPRA: 'DEVOLUCION_COMPRA',
  AJUSTE: 'AJUSTE',
  TRASLADO: 'TRASLADO',
} as const;
export type TipoDocumento = (typeof TIPO_DOCUMENTO)[keyof typeof TIPO_DOCUMENTO];

/** Tipo de documento de identidad de un cliente (tabla `clientes`). */
export const TIPO_DOCUMENTO_IDENTIDAD = {
  CC: 'CC',
  CE: 'CE',
  NIT: 'NIT',
  PASAPORTE: 'PASAPORTE',
  SIN_IDENTIFICAR: 'SIN_IDENTIFICAR',
} as const;
export type TipoDocumentoIdentidad =
  (typeof TIPO_DOCUMENTO_IDENTIDAD)[keyof typeof TIPO_DOCUMENTO_IDENTIDAD];

/** Tipos de metodo de pago (tabla `metodos_pago`). */
export const TIPO_METODO_PAGO = {
  EFECTIVO: 'EFECTIVO',
  TARJETA_DEBITO: 'TARJETA_DEBITO',
  TARJETA_CREDITO: 'TARJETA_CREDITO',
  TRANSFERENCIA: 'TRANSFERENCIA',
  PAGO_MOVIL: 'PAGO_MOVIL',
  CRIPTO: 'CRIPTO',
  CREDITO: 'CREDITO',
  BONO: 'BONO',
  OTRO: 'OTRO',
} as const;
export type TipoMetodoPago = (typeof TIPO_METODO_PAGO)[keyof typeof TIPO_METODO_PAGO];

/**
 * Monedas del sistema bimonetario.
 * USD es la moneda BASE (precios, costos, utilidad, cartera).
 * VES es la moneda de cobro mayoritaria (bolivares).
 */
export const MONEDA = {
  USD: 'USD',
  VES: 'VES',
} as const;
export type Moneda = (typeof MONEDA)[keyof typeof MONEDA];

/** Fuente de una tasa de cambio (tabla `tasas_cambio`). */
export const FUENTE_TASA = {
  MANUAL: 'MANUAL',
  BCV: 'BCV',
  PARALELO: 'PARALELO',
  OTRO: 'OTRO',
} as const;
export type FuenteTasa = (typeof FUENTE_TASA)[keyof typeof FUENTE_TASA];

/**
 * Tipos de impuesto (tabla `impuestos`).
 * EXENTO = gravado a tasa 0%. EXCLUIDO = fuera del impuesto. No son lo mismo.
 */
export const TIPO_IMPUESTO = {
  GRAVADO: 'GRAVADO',
  EXENTO: 'EXENTO',
  EXCLUIDO: 'EXCLUIDO',
  NO_APLICA: 'NO_APLICA',
} as const;
export type TipoImpuesto = (typeof TIPO_IMPUESTO)[keyof typeof TIPO_IMPUESTO];

/** Tipos de movimiento de caja (tabla `movimientos_caja`). */
export const TIPO_MOVIMIENTO_CAJA = {
  BASE: 'BASE',
  VENTA: 'VENTA',
  ABONO: 'ABONO',
  INGRESO: 'INGRESO',
  EGRESO: 'EGRESO',
  RETIRO: 'RETIRO',
  DEVOLUCION: 'DEVOLUCION',
  VUELTAS: 'VUELTAS',
  AJUSTE: 'AJUSTE',
} as const;
export type TipoMovimientoCaja =
  (typeof TIPO_MOVIMIENTO_CAJA)[keyof typeof TIPO_MOVIMIENTO_CAJA];

/** Documento origen de un movimiento de caja (tabla `movimientos_caja`). */
export const DOCUMENTO_TIPO_CAJA = {
  VENTA: 'VENTA',
  ABONO: 'ABONO',
  DEVOLUCION: 'DEVOLUCION',
  MANUAL: 'MANUAL',
} as const;
export type DocumentoTipoCaja =
  (typeof DOCUMENTO_TIPO_CAJA)[keyof typeof DOCUMENTO_TIPO_CAJA];

/** Tipos de devolucion (tabla `devoluciones`). */
export const TIPO_DEVOLUCION = {
  VENTA: 'VENTA',
  COMPRA: 'COMPRA',
} as const;
export type TipoDevolucion = (typeof TIPO_DEVOLUCION)[keyof typeof TIPO_DEVOLUCION];

/** Forma de reintegro de una devolucion (tabla `devoluciones`). */
export const FORMA_REINTEGRO = {
  EFECTIVO: 'EFECTIVO',
  NOTA_CREDITO: 'NOTA_CREDITO',
  ABONO_CREDITO: 'ABONO_CREDITO',
  CAMBIO_PRODUCTO: 'CAMBIO_PRODUCTO',
} as const;
export type FormaReintegro = (typeof FORMA_REINTEGRO)[keyof typeof FORMA_REINTEGRO];

/** Estados de una devolucion (tabla `devoluciones`). */
export const ESTADO_DEVOLUCION = {
  APLICADA: 'APLICADA',
  ANULADA: 'ANULADA',
} as const;
export type EstadoDevolucion =
  (typeof ESTADO_DEVOLUCION)[keyof typeof ESTADO_DEVOLUCION];

/** Tipos de ajuste de inventario (tabla `ajustes_inventario`). */
export const TIPO_AJUSTE = {
  AJUSTE_MANUAL: 'AJUSTE_MANUAL',
  CONTEO_FISICO: 'CONTEO_FISICO',
  MERMA: 'MERMA',
  TRASLADO: 'TRASLADO',
} as const;
export type TipoAjuste = (typeof TIPO_AJUSTE)[keyof typeof TIPO_AJUSTE];

/** Estados de un ajuste de inventario (tabla `ajustes_inventario`). */
export const ESTADO_AJUSTE = {
  BORRADOR: 'BORRADOR',
  APLICADO: 'APLICADO',
  ANULADO: 'ANULADO',
} as const;
export type EstadoAjuste = (typeof ESTADO_AJUSTE)[keyof typeof ESTADO_AJUSTE];

/** Estados de una solicitud idempotente (tabla `idempotencia_solicitudes`). */
export const ESTADO_IDEMPOTENCIA = {
  EN_PROCESO: 'EN_PROCESO',
  COMPLETADA: 'COMPLETADA',
  FALLIDA: 'FALLIDA',
} as const;
export type EstadoIdempotencia =
  (typeof ESTADO_IDEMPOTENCIA)[keyof typeof ESTADO_IDEMPOTENCIA];

/** Estados de un trabajo de exportacion (tabla `trabajos_exportacion`). */
export const ESTADO_EXPORTACION = {
  PENDIENTE: 'PENDIENTE',
  PROCESANDO: 'PROCESANDO',
  COMPLETADO: 'COMPLETADO',
  FALLIDO: 'FALLIDO',
} as const;
export type EstadoExportacion =
  (typeof ESTADO_EXPORTACION)[keyof typeof ESTADO_EXPORTACION];

/** Formatos de exportacion (tabla `trabajos_exportacion`). */
export const FORMATO_EXPORTACION = {
  PDF: 'PDF',
  EXCEL: 'EXCEL',
  CSV: 'CSV',
} as const;
export type FormatoExportacion =
  (typeof FORMATO_EXPORTACION)[keyof typeof FORMATO_EXPORTACION];

/** Acciones auditables (tabla `auditoria`). */
export const ACCION_AUDITORIA = {
  CREAR: 'CREAR',
  ACTUALIZAR: 'ACTUALIZAR',
  ELIMINAR: 'ELIMINAR',
  ANULAR: 'ANULAR',
  LOGIN: 'LOGIN',
  LOGIN_FALLIDO: 'LOGIN_FALLIDO',
  LOGOUT: 'LOGOUT',
  EXPORTAR: 'EXPORTAR',
  AJUSTE_STOCK: 'AJUSTE_STOCK',
  CAMBIO_PRECIO: 'CAMBIO_PRECIO',
  CAMBIO_COSTO: 'CAMBIO_COSTO',
  CAMBIO_TASA: 'CAMBIO_TASA',
  CORRECCION_TASA: 'CORRECCION_TASA',
  CAMBIO_PERMISOS: 'CAMBIO_PERMISOS',
  CAMBIO_CONFIG: 'CAMBIO_CONFIG',
  RECONCILIACION: 'RECONCILIACION',
} as const;
export type AccionAuditoria =
  (typeof ACCION_AUDITORIA)[keyof typeof ACCION_AUDITORIA];

/** Motivo de revocacion de una sesion (tabla `sesiones`). */
export const MOTIVO_REVOCACION = {
  LOGOUT: 'LOGOUT',
  ROTACION: 'ROTACION',
  REUSO_DETECTADO: 'REUSO_DETECTADO',
  ADMIN: 'ADMIN',
  EXPIRACION: 'EXPIRACION',
} as const;
export type MotivoRevocacion =
  (typeof MOTIVO_REVOCACION)[keyof typeof MOTIVO_REVOCACION];

/** Tipos de valor de un parametro EAV (tabla `parametros`). */
export const TIPO_PARAMETRO = {
  STRING: 'STRING',
  INT: 'INT',
  DECIMAL: 'DECIMAL',
  BOOL: 'BOOL',
  JSON: 'JSON',
} as const;
export type TipoParametro = (typeof TIPO_PARAMETRO)[keyof typeof TIPO_PARAMETRO];

/** Regimen tributario del negocio (tabla `configuracion`). */
export const REGIMEN = {
  SIMPLIFICADO: 'SIMPLIFICADO',
  COMUN: 'COMUN',
  SIMPLE: 'SIMPLE',
  NO_APLICA: 'NO_APLICA',
} as const;
export type Regimen = (typeof REGIMEN)[keyof typeof REGIMEN];

/** Codigos de rol sembrados por la migracion inicial (tabla `roles`). */
export const ROL = {
  ADMIN: 'ADMIN',
  SUPERVISOR: 'SUPERVISOR',
  CAJERO: 'CAJERO',
  BODEGUERO: 'BODEGUERO',
} as const;
export type CodigoRol = (typeof ROL)[keyof typeof ROL];

/** Limites y valores por defecto de la paginacion de la API. */
export const PAGINACION = {
  PAGINA_POR_DEFECTO: 1,
  LIMITE_POR_DEFECTO: 25,
  LIMITE_MAXIMO: 200,
} as const;

/** Parametros de concurrencia definidos en el ADR-015. */
export const CONCURRENCIA = {
  /** Reintentos automaticos ante deadlock (1213) o lock timeout (1205). */
  MAX_REINTENTOS: 2,
  /** Espera base entre reintentos, en milisegundos (con jitter). */
  ESPERA_REINTENTO_MS: 40,
  /** Nivel de aislamiento de las transacciones de negocio. */
  NIVEL_AISLAMIENTO: 'READ COMMITTED',
} as const;

/** Vigencia de una clave de idempotencia: 48 horas (contrato, columna expira_en). */
export const IDEMPOTENCIA_HORAS_VIGENCIA = 48;

/** Precision decimal de cada familia de columnas, segun el ADR-013. */
export const ESCALA = {
  /** Totales de documento en USD: DECIMAL(14,2). */
  TOTAL: 2,
  /** Precios y costos unitarios en USD: DECIMAL(14,4). */
  UNITARIO: 4,
  /** Cantidades: DECIMAL(14,3). */
  CANTIDAD: 3,
  /** Tasas de impuesto: DECIMAL(6,3). */
  TASA: 3,
  /** Montos en bolivares: DECIMAL(18,2). */
  BS: 2,
  /** Tasa de cambio USD->Bs: DECIMAL(18,6). */
  TASA_CAMBIO: 6,
  /** Montos de pago en su moneda: DECIMAL(18,4). */
  MONTO_MONEDA: 4,
} as const;
