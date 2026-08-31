/**
 * Productos. Precios y costos EN USD; en las respuestas se agrega el equivalente
 * en Bs a la tasa vigente para que el POS lo muestre sin recalcular en el cliente.
 */
import { NoEncontrado, Conflicto } from '../../errores/AppError';
import { query, queryOne, ejecutar, insertar, withTransaction } from '../../database/pool';
import { existeColumna, existeTabla } from '../../database/esquema';
import { usdABs, bsASql } from '../../utils/moneda';
import { aCentavos } from '../../utils/dinero';
import type { Id, DecimalSql } from '../../tipos/comunes';

export interface ProductoListado {
  id: Id;
  sku: string;
  nombre: string;
  categoria_id: Id;
  categoria_nombre: string;
  unidad_codigo: string;
  impuesto_id: Id;
  impuesto_tasa: DecimalSql;
  precio_venta: DecimalSql;
  precio_venta_bs?: DecimalSql;
  precio_venta_mayorista: DecimalSql | null;
  costo_promedio: DecimalSql;
  /** Lo ultimo que se pago por el, sin promediar. Referencia al reponer. */
  ultimo_costo: DecimalSql;
  /** FALSE = el costo es la semilla del alta, todavia no lo fijo una entrada. */
  costo_confirmado: boolean;
  es_precio_incluye_impuesto: boolean;
  es_pesable: boolean;
  es_favorito_pos: boolean;
  imagen_ruta: string | null;
  cantidad: DecimalSql;
  stock_minimo: DecimalSql;
  esta_activo: boolean;
}

interface FiltrosProductos {
  busqueda?: string;
  categoriaId?: number;
  soloActivos?: boolean;
  stockBajo?: boolean;
  favoritos?: boolean;
  desplazamiento: number;
  limite: number;
  sucursalId: number;
}

/** Agrega el precio en Bs a cada fila usando la tasa dada (string decimal). */
function conEquivalenteBs<T extends { precio_venta: DecimalSql }>(
  filas: T[],
  tasa: string | null,
): T[] {
  if (!tasa) return filas;
  const tasaEsc = BigInt(Math.round(Number(tasa) * 1_000_000));
  return filas.map((f) => ({
    ...f,
    precio_venta_bs: bsASql(usdABs(aCentavos(f.precio_venta), tasaEsc)),
  }));
}

/**
 * SELECT base de productos. Es una funcion y no una constante porque
 * `producto_stock.costo_confirmado` llego con la migracion 0009: en produccion la
 * base es externa y el migrador se traga los fallos, asi que nombrar la columna a
 * ciegas tumbaria la busqueda del POS entera por un dato secundario. Ver
 * database/esquema.ts. Sin la columna, todos los costos se reportan como
 * confirmados, que es como se comportaba el sistema antes.
 */
async function selectBase(): Promise<string> {
  const hayConfirmado = await existeColumna('producto_stock', 'costo_confirmado');
  return SELECT_BASE.replace(
    '@COSTO_CONFIRMADO@',
    hayConfirmado ? 'COALESCE(ps.costo_confirmado, FALSE)' : 'TRUE',
  );
}

const SELECT_BASE = `
  SELECT p.id, p.sku, p.nombre, p.categoria_id, c.nombre AS categoria_nombre,
         um.codigo AS unidad_codigo, p.impuesto_id, i.tasa AS impuesto_tasa,
         p.precio_venta, p.precio_venta_mayorista, p.es_precio_incluye_impuesto,
         p.es_pesable, p.es_favorito_pos, p.imagen_ruta, p.ultimo_costo,
         -- El costo que vale es el de la sucursal; el de productos es la copia global.
         COALESCE(ps.costo_promedio, p.costo_promedio) AS costo_promedio,
         @COSTO_CONFIRMADO@ AS costo_confirmado,
         COALESCE(ps.cantidad, 0) AS cantidad, COALESCE(ps.stock_minimo, 0) AS stock_minimo,
         p.esta_activo
    FROM productos p
    JOIN categorias c ON c.id = p.categoria_id
    JOIN unidades_medida um ON um.id = p.unidad_medida_id
    JOIN impuestos i ON i.id = p.impuesto_id
    LEFT JOIN producto_stock ps ON ps.producto_id = p.id AND ps.sucursal_id = ?`;

export async function listar(
  filtros: FiltrosProductos,
  tasa: string | null,
): Promise<{ datos: ProductoListado[]; total: number }> {
  const cond: string[] = ['p.eliminado_en IS NULL'];
  const params: (string | number)[] = [filtros.sucursalId];

  if (filtros.soloActivos) cond.push('p.esta_activo = TRUE');
  if (filtros.categoriaId) {
    cond.push('p.categoria_id = ?');
    params.push(filtros.categoriaId);
  }
  if (filtros.favoritos) cond.push('p.es_favorito_pos = TRUE');
  if (filtros.busqueda) {
    cond.push('(p.nombre ILIKE ? OR p.sku ILIKE ?)');
    const like = `%${filtros.busqueda}%`;
    params.push(like, like);
  }
  if (filtros.stockBajo) cond.push('COALESCE(ps.cantidad,0) <= COALESCE(ps.stock_minimo,0)');

  const where = `WHERE ${cond.join(' AND ')}`;
  const datos = await query<ProductoListado>(
    `${await selectBase()} ${where} ORDER BY p.nombre LIMIT ? OFFSET ?`,
    [...params, filtros.limite, filtros.desplazamiento],
  );

  const totalRow = await queryOne<{ n: number }>(
    `SELECT COUNT(*) AS n FROM productos p
       LEFT JOIN producto_stock ps ON ps.producto_id = p.id AND ps.sucursal_id = ?
      ${where}`,
    [filtros.sucursalId, ...params.slice(1)],
  );

  return { datos: conEquivalenteBs(datos, tasa), total: totalRow?.n ?? 0 };
}

/**
 * Busqueda rapida para el POS: intenta codigo de barras exacto, luego SKU exacto,
 * luego coincidencia por nombre/sku. Devuelve como maximo `limite` resultados.
 */
export async function buscarPos(
  termino: string,
  sucursalId: number,
  tasa: string | null,
  limite = 12,
): Promise<ProductoListado[]> {
  const term = termino.trim();
  if (!term) return [];

  // 1) Codigo de barras exacto -> resultado unico y directo (el caso del scanner).
  const porCodigo = await query<ProductoListado>(
    `${await selectBase()}
      JOIN producto_codigos pc ON pc.producto_id = p.id AND pc.eliminado_en IS NULL
     WHERE pc.codigo = ? AND p.eliminado_en IS NULL AND p.esta_activo = TRUE
     LIMIT 1`,
    [sucursalId, term],
  );
  if (porCodigo.length > 0) return conEquivalenteBs(porCodigo, tasa);

  // 2) SKU exacto (insensible a mayus/minus).
  const porSku = await query<ProductoListado>(
    `${await selectBase()} WHERE p.sku ILIKE ? AND p.eliminado_en IS NULL AND p.esta_activo = TRUE LIMIT 1`,
    [sucursalId, term],
  );
  if (porSku.length > 0) return conEquivalenteBs(porSku, tasa);

  // 3) Coincidencia parcial por nombre o SKU (insensible a mayus/minus).
  const like = `%${term}%`;
  const porNombre = await query<ProductoListado>(
    `${await selectBase()}
     WHERE (p.nombre ILIKE ? OR p.sku ILIKE ?) AND p.eliminado_en IS NULL AND p.esta_activo = TRUE
     ORDER BY p.es_favorito_pos DESC, p.nombre
     LIMIT ?`,
    [sucursalId, like, like, limite],
  );
  return conEquivalenteBs(porNombre, tasa);
}

/**
 * Los productos de una lista de ids, con existencia y precio VIGENTES.
 *
 * La usa el POS al retomar una venta en espera: el carrito guardado trae una foto
 * de precios y stock del momento en que se aparco, y entre medio pudo subir el
 * precio o venderse la ultima unidad. Devuelve solo los que siguen vivos y activos;
 * el que falte se avisa en pantalla en vez de arrastrarse en silencio.
 */
export async function listarPorIds(
  ids: readonly number[],
  sucursalId: number,
  tasa: string | null,
): Promise<ProductoListado[]> {
  if (ids.length === 0) return [];
  const marcas = ids.map(() => '?').join(',');
  const filas = await query<ProductoListado>(
    `${await selectBase()}
     WHERE p.id IN (${marcas}) AND p.eliminado_en IS NULL AND p.esta_activo = TRUE`,
    [sucursalId, ...ids],
  );
  return conEquivalenteBs(filas, tasa);
}

export async function obtenerPorId(
  id: Id,
  sucursalId: number,
  tasa: string | null,
): Promise<ProductoListado> {
  const filas = await query<ProductoListado>(
    `${await selectBase()} WHERE p.id = ? AND p.eliminado_en IS NULL LIMIT 1`,
    [sucursalId, id],
  );
  if (filas.length === 0) throw new NoEncontrado('PRODUCTO_NO_ENCONTRADO');
  return conEquivalenteBs(filas, tasa)[0]!;
}

export interface KardexLinea {
  fecha: string;
  tipo: string;
  documento: string | null;
  entrada: DecimalSql;
  salida: DecimalSql;
  saldo: DecimalSql;
  costo_unitario: DecimalSql;
}

export interface EntradaProducto {
  sku: string;
  nombre: string;
  descripcion?: string | null;
  categoriaId: Id;
  unidadMedidaId: Id;
  impuestoId: Id;
  precioVenta: string;
  precioMayorista?: string | null;
  costoInicial?: string;
  stockMinimo?: string;
  esPrecioIncluyeImpuesto?: boolean;
  esPesable?: boolean;
  esFavoritoPos?: boolean;
  codigoBarras?: string;
}

/** Crea un producto y su registro de stock (cantidad inicial 0). */
export async function crear(e: EntradaProducto, sucursalId: number, usuarioId: Id): Promise<ProductoListado> {
  return withTransaction(async (cx) => {
    let id: number;
    try {
      id = await insertar(
        `INSERT INTO productos
          (sku, nombre, descripcion, categoria_id, unidad_medida_id, impuesto_id, precio_venta,
           precio_venta_mayorista, costo_promedio, ultimo_costo, es_precio_incluye_impuesto,
           es_pesable, es_favorito_pos, creado_por)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          e.sku, e.nombre, e.descripcion ?? null, e.categoriaId, e.unidadMedidaId, e.impuestoId,
          e.precioVenta, e.precioMayorista || null, e.costoInicial ?? '0', e.costoInicial ?? '0',
          e.esPrecioIncluyeImpuesto ?? false, e.esPesable ?? false, e.esFavoritoPos ?? false, usuarioId,
        ],
        cx,
      );
    } catch (err) {
      if ((err as { code?: string }).code === '23505') throw new Conflicto('SKU_DUPLICADO');
      throw err;
    }

    /**
     * El costo inicial entra como SEMILLA (`costo_confirmado` queda en FALSE, su
     * valor por defecto): es un estimado de quien da de alta el producto, no
     * plata que se haya pagado. La primera entrada de mercancia —o un ajuste con
     * costo, o una correccion— lo pisa en vez de promediarlo. Ver migracion 0009.
     */
    await ejecutar(
      `INSERT INTO producto_stock (producto_id, sucursal_id, cantidad, stock_minimo, costo_promedio)
       VALUES (?, ?, 0, ?, ?)`,
      [id, sucursalId, e.stockMinimo ?? '0', e.costoInicial ?? '0'],
      cx,
    );

    if (e.codigoBarras?.trim()) {
      try {
        await insertar(
          `INSERT INTO producto_codigos (producto_id, codigo, tipo, es_principal) VALUES (?, ?, 'EAN13', TRUE)`,
          [id, e.codigoBarras.trim()],
          cx,
        );
      } catch (err) {
        if ((err as { code?: string }).code === '23505') throw new Conflicto('CODIGO_BARRAS_DUPLICADO');
        throw err;
      }
    }

    const filas = await query<ProductoListado>(
      `${await selectBase()} WHERE p.id = ? LIMIT 1`, [sucursalId, id], cx,
    );
    return filas[0]!;
  });
}

/** Actualiza los datos de un producto (nunca el costo, que lo mueven las compras). */
export async function actualizar(id: Id, e: EntradaProducto, sucursalId: number): Promise<ProductoListado> {
  const existe = await queryOne<{ id: number }>(`SELECT id FROM productos WHERE id = ? AND eliminado_en IS NULL`, [id]);
  if (!existe) throw new NoEncontrado('PRODUCTO_NO_ENCONTRADO');

  try {
    await ejecutar(
      `UPDATE productos SET sku=?, nombre=?, descripcion=?, categoria_id=?, unidad_medida_id=?,
              impuesto_id=?, precio_venta=?, precio_venta_mayorista=?, es_precio_incluye_impuesto=?,
              es_pesable=?, es_favorito_pos=?
        WHERE id=?`,
      [
        e.sku, e.nombre, e.descripcion ?? null, e.categoriaId, e.unidadMedidaId, e.impuestoId,
        e.precioVenta, e.precioMayorista || null, e.esPrecioIncluyeImpuesto ?? false, e.esPesable ?? false, e.esFavoritoPos ?? false, id,
      ],
    );
  } catch (err) {
    if ((err as { code?: string }).code === '23505') throw new Conflicto('SKU_DUPLICADO');
    throw err;
  }

  if (e.stockMinimo !== undefined) {
    await ejecutar(
      `UPDATE producto_stock SET stock_minimo = ? WHERE producto_id = ? AND sucursal_id = ?`,
      [e.stockMinimo, id, sucursalId],
    );
  }
  return obtenerPorId(id, sucursalId, null);
}

/** Borrado logico del producto. */
export async function eliminar(id: Id): Promise<void> {
  const p = await queryOne<{ id: number }>(`SELECT id FROM productos WHERE id = ? AND eliminado_en IS NULL`, [id]);
  if (!p) throw new NoEncontrado('PRODUCTO_NO_ENCONTRADO');
  await ejecutar(`UPDATE productos SET eliminado_en = NOW(), esta_activo = FALSE WHERE id = ?`, [id]);
}

/** Cambia el precio de venta y registra el cambio en el historial. */
export async function cambiarPrecio(id: Id, nuevoPrecio: string, usuarioId: Id, motivo?: string): Promise<void> {
  await withTransaction(async (cx) => {
    const p = await queryOne<{ precio_venta: string; costo_promedio: string }>(
      `SELECT precio_venta, costo_promedio FROM productos WHERE id = ? AND eliminado_en IS NULL FOR UPDATE`,
      [id], cx,
    );
    if (!p) throw new NoEncontrado('PRODUCTO_NO_ENCONTRADO');
    await ejecutar(`UPDATE productos SET precio_venta = ? WHERE id = ?`, [nuevoPrecio, id], cx);
    await insertar(
      `INSERT INTO producto_precios (producto_id, precio_venta_anterior, precio_venta_nuevo, costo_referencia, motivo, usuario_id)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [id, p.precio_venta, nuevoPrecio, p.costo_promedio, motivo ?? null, usuarioId],
      cx,
    );
  });
}

/**
 * Corrige a mano el costo de un producto (revalorizacion).
 *
 * El costo normalmente lo mueven las entradas de mercancia, no la ficha del
 * producto. Pero un costo mal tecleado al dar de alta no tenia como arreglarse:
 * `actualizar()` lo ignora a proposito, y la unica salida era inventar una
 * entrada, que ensucia el kardex y las cuentas por pagar.
 *
 * No es silencioso: cada correccion deja fila en `producto_costos` con el antes,
 * el despues, quien y por que. Y marca el costo como confirmado, para que la
 * proxima entrada lo promedie en vez de pisarlo.
 *
 * OJO: no reescribe la historia. Las ventas ya hechas conservan el costo que se
 * les congelo (ADR-001); esto solo cambia la valorizacion de aqui en adelante.
 */
export async function cambiarCosto(
  id: Id, sucursalId: number, costo: string, usuarioId: Id, motivo?: string,
): Promise<void> {
  await withTransaction(async (cx) => {
    const p = await queryOne<{ costo_promedio: string }>(
      `SELECT costo_promedio FROM productos WHERE id = ? AND eliminado_en IS NULL FOR UPDATE`,
      [id], cx,
    );
    if (!p) throw new NoEncontrado('PRODUCTO_NO_ENCONTRADO');

    // Migracion 0009; sin ella se corrige el costo igual, solo que sin la bandera.
    const hayConfirmado = await existeColumna('producto_stock', 'costo_confirmado', cx);
    const stock = await queryOne<{ cantidad: string; costo_promedio: string; costo_confirmado?: boolean }>(
      `SELECT cantidad, costo_promedio${hayConfirmado ? ', costo_confirmado' : ''} FROM producto_stock
        WHERE producto_id = ? AND sucursal_id = ? FOR UPDATE`,
      [id, sucursalId], cx,
    );
    const anterior = stock?.costo_promedio ?? p.costo_promedio;
    const eraSemilla = hayConfirmado && !stock?.costo_confirmado;

    if (stock) {
      await ejecutar(
        `UPDATE producto_stock SET costo_promedio = ?${hayConfirmado ? ', costo_confirmado = TRUE' : ''}
          WHERE producto_id = ? AND sucursal_id = ?`,
        [costo, id, sucursalId], cx,
      );
    } else {
      await ejecutar(
        `INSERT INTO producto_stock (producto_id, sucursal_id, cantidad, costo_promedio${hayConfirmado ? ', costo_confirmado' : ''})
         VALUES (?, ?, 0, ?${hayConfirmado ? ', TRUE' : ''})`,
        [id, sucursalId, costo], cx,
      );
    }

    /**
     * `ultimo_costo` guarda lo ultimo que se PAGO. Una correccion no es una
     * compra, asi que solo se toca cuando lo que habia era la semilla del alta.
     */
    if (eraSemilla) {
      await ejecutar(`UPDATE productos SET costo_promedio = ?, ultimo_costo = ? WHERE id = ?`, [costo, costo, id], cx);
    } else {
      await ejecutar(`UPDATE productos SET costo_promedio = ? WHERE id = ?`, [costo, id], cx);
    }

    // La tabla del historial tambien es de la 0009: si todavia no existe, el
    // costo se corrige igual y lo que se pierde es el rastro, no la operacion.
    if (await existeTabla('producto_costos', cx)) {
      await insertar(
        `INSERT INTO producto_costos
          (producto_id, sucursal_id, costo_anterior, costo_nuevo, era_semilla, cantidad_stock, motivo, usuario_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, sucursalId, anterior, costo, eraSemilla, stock?.cantidad ?? '0', motivo ?? null, usuarioId],
        cx,
      );
    }
  });
}

/** Historial de correcciones de costo de un producto. */
export async function historialCostos(id: Id, sucursalId: number): Promise<unknown[]> {
  if (!(await existeTabla('producto_costos'))) return [];
  return query(
    `SELECT pc.id, pc.costo_anterior, pc.costo_nuevo, pc.era_semilla, pc.cantidad_stock,
            pc.motivo, pc.creado_en, u.nombre_completo AS usuario
       FROM producto_costos pc JOIN usuarios u ON u.id = pc.usuario_id
      WHERE pc.producto_id = ? AND pc.sucursal_id = ?
      ORDER BY pc.creado_en DESC LIMIT 20`,
    [id, sucursalId],
  );
}

/** Kardex del producto: movimientos con saldo corrido (ya persistido en el ledger). */
export async function kardex(productoId: Id, sucursalId: number): Promise<KardexLinea[]> {
  return query<KardexLinea>(
    `SELECT TO_CHAR(creado_en, 'YYYY-MM-DD HH24:MI') AS fecha, tipo, nota AS documento,
            CASE WHEN signo = 1 THEN cantidad ELSE 0 END AS entrada,
            CASE WHEN signo = -1 THEN cantidad ELSE 0 END AS salida,
            saldo_posterior AS saldo, costo_unitario
       FROM inventario_movimientos
      WHERE producto_id = ? AND sucursal_id = ?
      ORDER BY id ASC`,
    [productoId, sucursalId],
  );
}
