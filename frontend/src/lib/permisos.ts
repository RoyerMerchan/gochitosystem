/**
 * Catalogo de permisos del cliente.
 *
 * Convencion del contrato canonico (tabla `permisos`): codigo = "<modulo>.<accion>",
 * VARCHAR(60) UNIQUE. El backend es la autoridad: estas constantes solo evitan
 * literales sueltos y errores de tipeo en las pantallas. Si el seed de `permisos`
 * agrega codigos nuevos, se agregan aqui; nunca al reves.
 *
 * El JWT de acceso NO lleva permisos embebidos (dura 15 min y se emite sin ellos):
 * el set efectivo del usuario para la sucursal del contexto llega en el login y se
 * guarda en authStore.
 */

export const PERMISOS = {
  // Seguridad y administracion
  usuariosVer: 'usuarios.ver',
  usuariosCrear: 'usuarios.crear',
  usuariosEditar: 'usuarios.editar',
  usuariosEliminar: 'usuarios.eliminar',
  usuariosResetearClave: 'usuarios.resetear_clave',
  usuariosRevocarSesiones: 'usuarios.revocar_sesiones',

  rolesVer: 'roles.ver',
  rolesCrear: 'roles.crear',
  rolesEditar: 'roles.editar',
  rolesEliminar: 'roles.eliminar',
  rolesAsignarPermisos: 'roles.asignar_permisos',

  sucursalesVer: 'sucursales.ver',
  sucursalesCrear: 'sucursales.crear',
  sucursalesEditar: 'sucursales.editar',

  configuracionVer: 'configuracion.ver',
  configuracionEditar: 'configuracion.editar',

  // Catalogos
  categoriasVer: 'categorias.ver',
  categoriasGestionar: 'categorias.gestionar',
  unidadesMedidaVer: 'unidades_medida.ver',
  unidadesMedidaGestionar: 'unidades_medida.gestionar',
  impuestosVer: 'impuestos.ver',
  impuestosGestionar: 'impuestos.gestionar',
  metodosPagoVer: 'metodos_pago.ver',
  metodosPagoGestionar: 'metodos_pago.gestionar',

  // Productos
  productosVer: 'productos.ver',
  productosCrear: 'productos.crear',
  productosEditar: 'productos.editar',
  productosEliminar: 'productos.eliminar',
  /** Permiso sensible: expone el costo del producto. */
  productosVerCosto: 'productos.ver_costo',
  productosEditarCosto: 'productos.editar_costo',
  productosEditarPrecio: 'productos.editar_precio',

  // Terceros
  proveedoresVer: 'proveedores.ver',
  proveedoresGestionar: 'proveedores.gestionar',
  clientesVer: 'clientes.ver',
  clientesCrear: 'clientes.crear',
  clientesEditar: 'clientes.editar',
  clientesEditarCupo: 'clientes.editar_cupo',

  // Operacion
  posVender: 'pos.vender',
  posAplicarDescuento: 'pos.aplicar_descuento',
  posVenderACredito: 'pos.vender_a_credito',

  ventasVer: 'ventas.ver',
  ventasVerTodas: 'ventas.ver_todas',
  ventasAnular: 'ventas.anular',
  ventasReimprimir: 'ventas.reimprimir',

  comprasVer: 'compras.ver',
  comprasCrear: 'compras.crear',
  comprasAnular: 'compras.anular',

  devolucionesVer: 'devoluciones.ver',
  devolucionesCrear: 'devoluciones.crear',

  // Cartera
  creditosVer: 'creditos.ver',
  creditosGestionar: 'creditos.gestionar',
  abonosVer: 'abonos.ver',
  abonosRegistrar: 'abonos.registrar',
  abonosAnular: 'abonos.anular',

  // Inventario
  inventarioVer: 'inventario.ver',
  inventarioAjustar: 'inventario.ajustar',
  inventarioVerKardex: 'inventario.ver_kardex',

  // Caja
  turnosCajaVer: 'turnos_caja.ver',
  turnosCajaAbrir: 'turnos_caja.abrir',
  turnosCajaCerrar: 'turnos_caja.cerrar',
  turnosCajaVerTodos: 'turnos_caja.ver_todos',
  cajaMovimientos: 'caja.registrar_movimiento',

  // Analitica
  dashboardVer: 'dashboard.ver',
  reportesVentasVer: 'reportes.ventas.ver',
  reportesClientesVer: 'reportes.clientes.ver',
  reportesInventarioVer: 'reportes.inventario.ver',
  /** Permiso sensible: margenes y utilidad del negocio. */
  reportesUtilidadVer: 'reportes.utilidad.ver',
  reportesExportar: 'reportes.exportar',

  auditoriaVer: 'auditoria.ver',
} as const;

export type CodigoPermiso = (typeof PERMISOS)[keyof typeof PERMISOS];

/** Cualquier string es aceptado: el backend puede tener codigos aun no listados. */
export type Permiso = CodigoPermiso | (string & {});

/**
 * Comodin de superusuario. Si el set de permisos lo contiene, todo esta permitido.
 * Debe coincidir con el codigo que emita el backend para el rol administrador.
 */
export const PERMISO_TOTAL = '*';

/** Verifica un permiso puntual contra un set. */
export function tienePermiso(permisos: ReadonlySet<string>, permiso: Permiso): boolean {
  return permisos.has(PERMISO_TOTAL) || permisos.has(permiso);
}

/** Verdadero si el usuario tiene AL MENOS uno de los permisos. */
export function tieneAlgunPermiso(
  permisos: ReadonlySet<string>,
  requeridos: readonly Permiso[],
): boolean {
  if (requeridos.length === 0) return true;
  if (permisos.has(PERMISO_TOTAL)) return true;
  return requeridos.some((p) => permisos.has(p));
}

/** Verdadero si el usuario tiene TODOS los permisos. */
export function tieneTodosLosPermisos(
  permisos: ReadonlySet<string>,
  requeridos: readonly Permiso[],
): boolean {
  if (requeridos.length === 0) return true;
  if (permisos.has(PERMISO_TOTAL)) return true;
  return requeridos.every((p) => permisos.has(p));
}

/** Agrupa los codigos por modulo, util para la matriz de rol_permisos. */
export function agruparPorModulo(codigos: readonly string[]): Record<string, string[]> {
  const grupos: Record<string, string[]> = {};
  for (const codigo of codigos) {
    const modulo = codigo.split('.')[0] ?? 'otros';
    (grupos[modulo] ??= []).push(codigo);
  }
  return grupos;
}
