/**
 * Productos. Precios y costos EN USD; en las respuestas se agrega el equivalente
 * en Bs a la tasa vigente para que el POS lo muestre sin recalcular en el cliente.
 */
import { NoEncontrado, Conflicto } from '../../errores/AppError';
import { query, queryOne, ejecutar, insertar, withTransaction } from '../../database/pool';
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

const SELECT_BASE = `
  SELECT p.id, p.sku, p.nombre, p.categoria_id, c.nombre AS categoria_nombre,
         um.codigo AS unidad_codigo, p.impuesto_id, i.tasa AS impuesto_tasa,
         p.precio_venta, p.precio_venta_mayorista, p.costo_promedio, p.es_precio_incluye_impuesto,
         p.es_pesable, p.es_favorito_pos, p.imagen_ruta,
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
    cond.push('(p.nombre LIKE ? OR p.sku LIKE ?)');
    const like = `%${filtros.busqueda}%`;
    params.push(like, like);
  }
  if (filtros.stockBajo) cond.push('COALESCE(ps.cantidad,0) <= COALESCE(ps.stock_minimo,0)');

  const where = `WHERE ${cond.join(' AND ')}`;
  const datos = await query<ProductoListado>(
    `${SELECT_BASE} ${where} ORDER BY p.nombre LIMIT ? OFFSET ?`,
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
    `${SELECT_BASE}
      JOIN producto_codigos pc ON pc.producto_id = p.id AND pc.eliminado_en IS NULL
     WHERE pc.codigo = ? AND p.eliminado_en IS NULL AND p.esta_activo = TRUE
     LIMIT 1`,
    [sucursalId, term],
  );
  if (porCodigo.length > 0) return conEquivalenteBs(porCodigo, tasa);

  // 2) SKU exacto (insensible a mayus/minus).
  const porSku = await query<ProductoListado>(
    `${SELECT_BASE} WHERE p.sku ILIKE ? AND p.eliminado_en IS NULL AND p.esta_activo = TRUE LIMIT 1`,
    [sucursalId, term],
  );
  if (porSku.length > 0) return conEquivalenteBs(porSku, tasa);

  // 3) Coincidencia parcial por nombre o SKU (insensible a mayus/minus).
  const like = `%${term}%`;
  const porNombre = await query<ProductoListado>(
    `${SELECT_BASE}
     WHERE (p.nombre ILIKE ? OR p.sku ILIKE ?) AND p.eliminado_en IS NULL AND p.esta_activo = TRUE
     ORDER BY p.es_favorito_pos DESC, p.nombre
     LIMIT ?`,
    [sucursalId, like, like, limite],
  );
  return conEquivalenteBs(porNombre, tasa);
}

export async function obtenerPorId(
  id: Id,
  sucursalId: number,
  tasa: string | null,
): Promise<ProductoListado> {
  const filas = await query<ProductoListado>(
    `${SELECT_BASE} WHERE p.id = ? AND p.eliminado_en IS NULL LIMIT 1`,
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
      `${SELECT_BASE} WHERE p.id = ? LIMIT 1`, [sucursalId, id], cx,
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
