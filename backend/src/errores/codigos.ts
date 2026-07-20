/**
 * Catalogo de codigos de error del dominio.
 *
 * Cada codigo es ESTABLE (UPPER_SNAKE) y viaja al frontend en
 * { ok:false, error:{ codigo, mensaje, detalles } }. El frontend decide que hacer
 * mirando el codigo, jamas el texto del mensaje: el mensaje puede reescribirse,
 * el codigo no. Agregar codigos es libre; renombrarlos rompe el contrato.
 *
 * Los estados HTTP siguen las convenciones del contrato canonico:
 *   400 validacion de forma | 401 sin token | 403 sin permiso | 404 no existe
 *   409 conflicto de negocio (STOCK_INSUFICIENTE, EN_PROCESO)
 *   422 regla de negocio / IDEMPOTENCY_KEY_REUSE | 429 rate limit | 500 interno
 */

export interface DefinicionError {
  readonly mensaje: string;
  readonly httpStatus: number;
}

export const CODIGOS_ERROR = {
  // ---------------------------------------------------------------------------
  // Autenticacion
  // ---------------------------------------------------------------------------
  CREDENCIALES_INVALIDAS: {
    mensaje: 'Usuario o contrasena incorrectos.',
    httpStatus: 401,
  },
  TOKEN_AUSENTE: {
    mensaje: 'No se envio el token de autenticacion.',
    httpStatus: 401,
  },
  TOKEN_INVALIDO: {
    mensaje: 'El token de autenticacion no es valido.',
    httpStatus: 401,
  },
  TOKEN_EXPIRADO: {
    mensaje: 'La sesion expiro. Inicie sesion nuevamente.',
    httpStatus: 401,
  },
  REFRESH_INVALIDO: {
    mensaje: 'El token de refresco no es valido o ya fue usado.',
    httpStatus: 401,
  },
  REFRESH_REUSO_DETECTADO: {
    mensaje:
      'Se detecto el reuso de un token de refresco. Se cerraron todas las sesiones por seguridad.',
    httpStatus: 401,
  },
  SESION_REVOCADA: {
    mensaje: 'La sesion fue cerrada. Inicie sesion nuevamente.',
    httpStatus: 401,
  },
  USUARIO_INACTIVO: {
    mensaje: 'El usuario esta inactivo.',
    httpStatus: 403,
  },
  USUARIO_BLOQUEADO: {
    mensaje: 'El usuario esta bloqueado por intentos fallidos. Intente mas tarde.',
    httpStatus: 403,
  },
  DEBE_CAMBIAR_PASSWORD: {
    mensaje: 'Debe cambiar la contrasena antes de continuar.',
    httpStatus: 403,
  },
  TOKEN_REUSADO: {
    mensaje:
      'Se detecto el reuso de un token de refresco. Se cerraron todas las sesiones por seguridad.',
    httpStatus: 401,
  },
  PASSWORD_ACTUAL_INCORRECTA: {
    mensaje: 'La contrasena actual es incorrecta.',
    httpStatus: 422,
  },

  // ---------------------------------------------------------------------------
  // Autorizacion
  // ---------------------------------------------------------------------------
  PERMISO_DENEGADO: {
    mensaje: 'No tiene permiso para realizar esta operacion.',
    httpStatus: 403,
  },
  SUCURSAL_NO_ASIGNADA: {
    mensaje: 'No tiene acceso a la sucursal solicitada.',
    httpStatus: 403,
  },
  OPERACION_NO_PERMITIDA: {
    mensaje: 'La operacion no esta permitida en el estado actual.',
    httpStatus: 403,
  },

  // ---------------------------------------------------------------------------
  // Validacion
  // ---------------------------------------------------------------------------
  DATOS_INVALIDOS: {
    mensaje: 'Los datos enviados no son validos.',
    httpStatus: 422,
  },
  PARAMETRO_INVALIDO: {
    mensaje: 'Un parametro de la solicitud no es valido.',
    httpStatus: 400,
  },
  CUERPO_REQUERIDO: {
    mensaje: 'La solicitud requiere un cuerpo JSON.',
    httpStatus: 400,
  },
  JSON_MAL_FORMADO: {
    mensaje: 'El cuerpo de la solicitud no es un JSON valido.',
    httpStatus: 400,
  },
  ARCHIVO_INVALIDO: {
    mensaje: 'El archivo enviado no es valido o el formato no esta permitido.',
    httpStatus: 422,
  },
  ARCHIVO_MUY_GRANDE: {
    mensaje: 'El archivo supera el tamano maximo permitido.',
    httpStatus: 413,
  },

  // ---------------------------------------------------------------------------
  // Recursos no encontrados
  // ---------------------------------------------------------------------------
  NO_ENCONTRADO: {
    mensaje: 'El recurso solicitado no existe.',
    httpStatus: 404,
  },
  RUTA_NO_ENCONTRADA: {
    mensaje: 'La ruta solicitada no existe.',
    httpStatus: 404,
  },
  PRODUCTO_NO_ENCONTRADO: {
    mensaje: 'El producto no existe o fue eliminado.',
    httpStatus: 404,
  },
  CLIENTE_NO_ENCONTRADO: {
    mensaje: 'El cliente no existe o fue eliminado.',
    httpStatus: 404,
  },
  PROVEEDOR_NO_ENCONTRADO: {
    mensaje: 'El proveedor no existe o fue eliminado.',
    httpStatus: 404,
  },
  VENTA_NO_ENCONTRADA: {
    mensaje: 'La venta no existe.',
    httpStatus: 404,
  },
  COMPRA_NO_ENCONTRADA: {
    mensaje: 'La compra no existe.',
    httpStatus: 404,
  },
  CREDITO_NO_ENCONTRADO: {
    mensaje: 'El credito no existe.',
    httpStatus: 404,
  },
  USUARIO_NO_ENCONTRADO: {
    mensaje: 'El usuario no existe.',
    httpStatus: 404,
  },
  TURNO_NO_ENCONTRADO: {
    mensaje: 'El turno de caja no existe.',
    httpStatus: 404,
  },
  SUCURSAL_NO_ENCONTRADA: {
    mensaje: 'La sucursal no existe.',
    httpStatus: 404,
  },
  EXPORTACION_NO_ENCONTRADA: {
    mensaje: 'El trabajo de exportacion no existe o ya expiro.',
    httpStatus: 404,
  },

  // ---------------------------------------------------------------------------
  // Conflictos y duplicados
  // ---------------------------------------------------------------------------
  REGISTRO_DUPLICADO: {
    mensaje: 'Ya existe un registro con esos datos.',
    httpStatus: 409,
  },
  CODIGO_BARRAS_DUPLICADO: {
    mensaje: 'El codigo de barras ya esta asignado a otro producto.',
    httpStatus: 409,
  },
  SKU_DUPLICADO: {
    mensaje: 'Ya existe un producto activo con ese SKU.',
    httpStatus: 409,
  },
  DOCUMENTO_DUPLICADO: {
    mensaje: 'Ya existe un registro activo con ese numero de documento.',
    httpStatus: 409,
  },
  USUARIO_DUPLICADO: {
    mensaje: 'Ya existe un usuario activo con ese nombre de usuario.',
    httpStatus: 409,
  },
  EMAIL_DUPLICADO: {
    mensaje: 'Ya existe un usuario activo con ese correo electronico.',
    httpStatus: 409,
  },
  CONSECUTIVO_DUPLICADO: {
    mensaje: 'El consecutivo del documento ya fue utilizado. Reintente la operacion.',
    httpStatus: 409,
  },
  REFERENCIA_EN_USO: {
    mensaje:
      'No se puede eliminar: el registro esta referenciado por otros documentos del sistema.',
    httpStatus: 409,
  },
  REFERENCIA_INEXISTENTE: {
    mensaje: 'Uno de los registros relacionados no existe.',
    httpStatus: 422,
  },

  // ---------------------------------------------------------------------------
  // Inventario
  // ---------------------------------------------------------------------------
  STOCK_INSUFICIENTE: {
    mensaje: 'No hay existencias suficientes del producto.',
    httpStatus: 409,
  },
  PRODUCTO_SIN_COSTO: {
    mensaje:
      'El producto no tiene costo registrado. Registre una compra o un inventario inicial antes de venderlo.',
    httpStatus: 422,
  },
  PRODUCTO_INACTIVO: {
    mensaje: 'El producto esta inactivo y no puede usarse en documentos nuevos.',
    httpStatus: 422,
  },
  PRODUCTO_SIN_PRECIO: {
    mensaje: 'El producto no tiene precio de venta vigente.',
    httpStatus: 422,
  },
  CANTIDAD_INVALIDA: {
    mensaje: 'La cantidad debe ser mayor que cero.',
    httpStatus: 422,
  },
  UNIDAD_NO_PERMITE_FRACCION: {
    mensaje: 'La unidad de medida del producto no permite cantidades fraccionadas.',
    httpStatus: 422,
  },
  MOVIMIENTO_INMUTABLE: {
    mensaje:
      'Los movimientos de inventario no se modifican ni se borran. Registre un movimiento compensatorio.',
    httpStatus: 409,
  },
  AJUSTE_YA_APLICADO: {
    mensaje: 'El ajuste de inventario ya fue aplicado.',
    httpStatus: 409,
  },
  STOCK_NEGATIVO_NO_PERMITIDO: {
    mensaje: 'La operacion dejaria la existencia en negativo.',
    httpStatus: 409,
  },

  // ---------------------------------------------------------------------------
  // Ventas y documentos
  // ---------------------------------------------------------------------------
  VENTA_YA_ANULADA: {
    mensaje: 'La venta ya fue anulada.',
    httpStatus: 409,
  },
  VENTA_YA_CERRADA: {
    mensaje: 'La venta ya esta cerrada y no puede modificarse.',
    httpStatus: 409,
  },
  VENTA_SIN_RENGLONES: {
    mensaje: 'La venta debe tener al menos un producto.',
    httpStatus: 422,
  },
  DOCUMENTO_INMUTABLE: {
    mensaje:
      'El documento esta cerrado y no puede editarse. Debe anularse para revertirlo.',
    httpStatus: 409,
  },
  PAGOS_NO_CUADRAN: {
    mensaje: 'La suma de los pagos no coincide con el total de la venta.',
    httpStatus: 422,
  },
  PAGO_SIN_REFERENCIA: {
    mensaje: 'El metodo de pago seleccionado exige un numero de referencia.',
    httpStatus: 422,
  },
  DESCUENTO_INVALIDO: {
    mensaje: 'El descuento no puede ser negativo ni superar la base del documento.',
    httpStatus: 422,
  },
  COMPRA_YA_RECIBIDA: {
    mensaje: 'La compra ya fue recibida y afecto el inventario.',
    httpStatus: 409,
  },
  COMPRA_YA_ANULADA: {
    mensaje: 'La compra ya fue anulada.',
    httpStatus: 409,
  },
  DEVOLUCION_EXCEDE_VENDIDO: {
    mensaje: 'La cantidad a devolver supera la cantidad vendida pendiente de devolucion.',
    httpStatus: 422,
  },
  DEVOLUCION_SOBRE_VENTA_ANULADA: {
    mensaje: 'No se puede devolver un renglon de una venta anulada.',
    httpStatus: 409,
  },

  // ---------------------------------------------------------------------------
  // Creditos y cartera
  // ---------------------------------------------------------------------------
  CUPO_CREDITO_EXCEDIDO: {
    mensaje: 'La venta supera el cupo de credito disponible del cliente.',
    httpStatus: 409,
  },
  CLIENTE_BLOQUEADO: {
    mensaje: 'El cliente esta bloqueado para operaciones a credito.',
    httpStatus: 409,
  },
  CLIENTE_SIN_CREDITO: {
    mensaje: 'El cliente no tiene credito habilitado.',
    httpStatus: 422,
  },
  CLIENTE_GENERICO_SIN_CREDITO: {
    mensaje:
      'No se puede vender a credito al cliente generico. Seleccione un cliente identificado.',
    httpStatus: 422,
  },
  ABONO_MAYOR_A_SALDO: {
    mensaje: 'El abono supera el saldo pendiente del cliente.',
    httpStatus: 422,
  },
  ABONO_YA_ANULADO: {
    mensaje: 'El abono ya fue anulado.',
    httpStatus: 409,
  },
  CREDITO_YA_PAGADO: {
    mensaje: 'El credito ya esta pagado en su totalidad.',
    httpStatus: 409,
  },
  CREDITO_ANULADO: {
    mensaje: 'El credito esta anulado y no admite abonos.',
    httpStatus: 409,
  },
  MONTO_INVALIDO: {
    mensaje: 'El monto debe ser mayor que cero.',
    httpStatus: 422,
  },

  // ---------------------------------------------------------------------------
  // Modelo bimonetario USD / Bs
  // ---------------------------------------------------------------------------
  SIN_TASA_DEL_DIA: {
    mensaje:
      'No hay una tasa de cambio registrada para hoy. Registre la tasa del dia antes de facturar.',
    httpStatus: 409,
  },
  TASA_YA_REGISTRADA: {
    mensaje: 'Ya existe una tasa de cambio registrada para esa fecha.',
    httpStatus: 409,
  },
  TASA_INVALIDA: {
    mensaje: 'La tasa de cambio debe ser mayor que cero.',
    httpStatus: 422,
  },
  MONEDA_NO_COINCIDE: {
    mensaje: 'La moneda del pago no coincide con la del metodo de pago seleccionado.',
    httpStatus: 422,
  },
  MONEDA_INVALIDA: {
    mensaje: 'La moneda indicada no es valida.',
    httpStatus: 422,
  },
  REFERENCIA_REQUERIDA: {
    mensaje: 'El metodo de pago exige un numero de referencia.',
    httpStatus: 422,
  },
  PAGO_INSUFICIENTE: {
    mensaje: 'El monto pagado no cubre el total de la venta.',
    httpStatus: 422,
  },

  // ---------------------------------------------------------------------------
  // Caja y turnos
  // ---------------------------------------------------------------------------
  CAJA_NO_ABIERTA: {
    mensaje: 'No hay un turno de caja abierto. Abra la caja para poder facturar.',
    httpStatus: 409,
  },
  TURNO_YA_ABIERTO: {
    mensaje: 'La caja ya tiene un turno abierto.',
    httpStatus: 409,
  },
  TURNO_CERRADO: {
    mensaje: 'El turno de caja esta cerrado y no admite movimientos.',
    httpStatus: 409,
  },
  TURNO_YA_CERRADO: {
    mensaje: 'El turno de caja ya fue cerrado.',
    httpStatus: 409,
  },
  TURNO_DE_OTRO_USUARIO: {
    mensaje: 'El turno de caja pertenece a otro usuario.',
    httpStatus: 403,
  },
  RETIRO_EXCEDE_EFECTIVO: {
    mensaje: 'El retiro supera el efectivo disponible en la caja.',
    httpStatus: 422,
  },

  // ---------------------------------------------------------------------------
  // Idempotencia
  // ---------------------------------------------------------------------------
  IDEMPOTENCY_KEY_REQUERIDA: {
    mensaje: 'La operacion exige la cabecera Idempotency-Key.',
    httpStatus: 400,
  },
  IDEMPOTENCY_KEY_INVALIDA: {
    mensaje: 'La cabecera Idempotency-Key debe ser un UUID valido.',
    httpStatus: 400,
  },
  IDEMPOTENCY_KEY_REUSE: {
    mensaje:
      'La misma Idempotency-Key se reutilizo con un cuerpo distinto. Genere una clave nueva.',
    httpStatus: 422,
  },
  SOLICITUD_EN_PROCESO: {
    mensaje: 'La solicitud ya se esta procesando. Espere el resultado.',
    httpStatus: 409,
  },

  // ---------------------------------------------------------------------------
  // Configuracion y catalogos
  // ---------------------------------------------------------------------------
  CATEGORIA_CON_HIJOS: {
    mensaje: 'No se puede eliminar una categoria que tiene subcategorias.',
    httpStatus: 409,
  },
  CATEGORIA_CICLICA: {
    mensaje: 'Una categoria no puede ser descendiente de si misma.',
    httpStatus: 422,
  },
  ROL_DE_SISTEMA: {
    mensaje: 'Los roles del sistema no se pueden modificar ni eliminar.',
    httpStatus: 409,
  },
  CONFIGURACION_INVALIDA: {
    mensaje: 'La configuracion del sistema es invalida.',
    httpStatus: 500,
  },

  // ---------------------------------------------------------------------------
  // Exportaciones
  // ---------------------------------------------------------------------------
  EXPORTACION_NO_LISTA: {
    mensaje: 'El archivo aun se esta generando. Consulte nuevamente en unos segundos.',
    httpStatus: 409,
  },
  EXPORTACION_FALLIDA: {
    mensaje: 'La generacion del archivo fallo.',
    httpStatus: 500,
  },

  // ---------------------------------------------------------------------------
  // Infraestructura y concurrencia
  // ---------------------------------------------------------------------------
  CONFLICTO_CONCURRENCIA: {
    mensaje:
      'Otra operacion modifico los mismos datos al mismo tiempo. Reintente la operacion.',
    httpStatus: 409,
  },
  TIEMPO_BLOQUEO_AGOTADO: {
    mensaje: 'La operacion tardo demasiado esperando otro proceso. Reintente.',
    httpStatus: 409,
  },
  DEMASIADAS_SOLICITUDES: {
    mensaje: 'Demasiadas solicitudes. Intente de nuevo en unos minutos.',
    httpStatus: 429,
  },
  ERROR_BASE_DATOS: {
    mensaje: 'Ocurrio un error al acceder a la base de datos.',
    httpStatus: 500,
  },
  SERVICIO_NO_DISPONIBLE: {
    mensaje: 'El servicio no esta disponible en este momento.',
    httpStatus: 503,
  },
  REGLA_NEGOCIO: {
    mensaje: 'La operacion viola una regla de negocio.',
    httpStatus: 422,
  },
  ERROR_INTERNO: {
    mensaje: 'Ocurrio un error inesperado.',
    httpStatus: 500,
  },
} as const satisfies Record<string, DefinicionError>;

/** Union de todos los codigos de error validos del dominio. */
export type CodigoError = keyof typeof CODIGOS_ERROR;

/** Devuelve la definicion de un codigo, con ERROR_INTERNO como red de seguridad. */
export function obtenerDefinicion(codigo: CodigoError): DefinicionError {
  return CODIGOS_ERROR[codigo] ?? CODIGOS_ERROR.ERROR_INTERNO;
}
