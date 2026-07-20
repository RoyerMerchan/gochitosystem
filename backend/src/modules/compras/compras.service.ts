/**
 * Compras a proveedores. Al RECIBIR una compra, en una transaccion:
 *   - se ingresa el stock,
 *   - se RECALCULA el costo promedio ponderado movil (CPP) de cada producto,
 *   - se registra el movimiento ENTRADA_COMPRA en el ledger.
 *
 * El CPP resultante es el que despues se congela como snapshot de costo en cada
 * venta, por eso debe quedar exacto. Toda la aritmetica es en bigint.
 */
import { Conflicto, NoEncontrado, ReglaNegocio } from '../../errores/AppError';
import {
  query, queryOne, ejecutar, insertar, withTransaction, type Ejecutor,
} from '../../database/pool';
import {
  aCantidad, aUnitario, cantidadASql, unitarioASql, centavosASql,
  multiplicarPorCantidad, dividirRedondeando, sumar, aTasa,
} from '../../utils/dinero';
import { aTasaCambio, usdABs, bsASql } from '../../utils/moneda';
import {
  TIPO_MOVIMIENTO_INVENTARIO, DOCUMENTO_TIPO_MOVIMIENTO, SIGNO_MOVIMIENTO_INVENTARIO,
  ESTADO_COMPRA, CONDICION_PAGO, TIPO_DOCUMENTO,
} from '../../config/constantes';
import type { Id, UsuarioAutenticado } from '../../tipos/comunes';

export interface RenglonCompraEntrada {
  productoId: Id;
  cantidad: string;
  costoUnitario: string; // USD
  descuentoUnitario?: string;
}

export interface CompraEntrada {
  /** Opcional: el negocio ingresa mercancia a mano. Sin proveedor usa el generico (1). */
  proveedorId?: Id;
  numeroFacturaProveedor?: string;
  fechaDocumento?: string;
  condicionPago?: 'CONTADO' | 'CREDITO';
  monedaPago?: 'USD' | 'VES';
  observaciones?: string;
  renglones: RenglonCompraEntrada[];
}

/** Registra y RECIBE la compra en una sola operacion (afecta stock y CPP). */
export async function registrar(
  entrada: CompraEntrada,
  usuario: UsuarioAutenticado,
  idempotencyKey: string | null,
): Promise<{ id: Id; numero: string; total_usd: string }> {
  if (entrada.renglones.length === 0) throw new ReglaNegocio('VENTA_SIN_RENGLONES');
  const proveedorId = entrada.proveedorId ?? 1; // 1 = INGRESO DIRECTO (generico)

  return withTransaction(async (cx) => {
    // Tasa vigente para registrar el equivalente en Bs (informativo).
    const tasaFila = await queryOne<{ tasa: string }>(
      `SELECT tasa FROM tasas_cambio WHERE fecha = CURDATE() AND eliminado_en IS NULL LIMIT 1`,
      [], cx,
    );
    const tasa = tasaFila?.tasa ?? '1';
    const tasaEsc = aTasaCambio(tasa);
    const anio = new Date().getFullYear();

    const { numero, prefijo } = await siguienteConsecutivo(cx, usuario.sucursalId, TIPO_DOCUMENTO.COMPRA, anio);

    // Calcular totales.
    const lineas = entrada.renglones.map((r) => {
      const cantidad = aCantidad(r.cantidad);
      if (cantidad <= 0n) throw new ReglaNegocio('CANTIDAD_INVALIDA');
      const costoUnit = aUnitario(r.costoUnitario);
      const descUnit = aUnitario(r.descuentoUnitario ?? '0');
      const costoNeto = costoUnit - descUnit;
      const subtotal = multiplicarPorCantidad(costoNeto, cantidad); // escala 2
      return { productoId: r.productoId, cantidad, costoUnit, descUnit, costoNeto, subtotal };
    });

    const subtotalTotal = sumar(lineas.map((l) => l.subtotal));
    const totalUsd = subtotalTotal;
    const totalBs = usdABs(totalUsd, tasaEsc);

    const compraId = await insertar(
      `INSERT INTO compras
        (sucursal_id, proveedor_id, usuario_id, prefijo, numero, anio, numero_factura_proveedor,
         fecha_documento, fecha_recepcion, subtotal, impuesto_total, moneda_pago, tasa_cambio,
         total_usd, total_bs, saldo_pendiente, condicion_pago, estado, observaciones, clave_idempotencia)
       VALUES (?, ?, ?, ?, ?, ?, ?, COALESCE(?, CURDATE()), NOW(3), ?, 0, ?, ?, ?, ?, ?, ?, 'RECIBIDA', ?, ?)`,
      [
        usuario.sucursalId, proveedorId, usuario.id, prefijo, numero, anio,
        entrada.numeroFacturaProveedor ?? null, entrada.fechaDocumento ?? null,
        centavosASql(subtotalTotal), entrada.monedaPago ?? 'USD', tasa,
        centavosASql(totalUsd), bsASql(totalBs),
        entrada.condicionPago === CONDICION_PAGO.CREDITO ? centavosASql(totalUsd) : '0',
        entrada.condicionPago ?? CONDICION_PAGO.CONTADO, entrada.observaciones ?? null, idempotencyKey,
      ],
      cx,
    );

    // Renglones + stock + CPP + ledger.
    let linea = 0;
    for (const l of lineas) {
      linea += 1;
      const prod = await queryOne<{ nombre: string; unidad_medida_id: number; impuesto_id: number; impuesto_tasa: string }>(
        `SELECT p.nombre, p.unidad_medida_id, p.impuesto_id, i.tasa AS impuesto_tasa
           FROM productos p JOIN impuestos i ON i.id = p.impuesto_id
          WHERE p.id = ? AND p.eliminado_en IS NULL LIMIT 1`,
        [l.productoId], cx,
      );
      if (!prod) throw new NoEncontrado('PRODUCTO_NO_ENCONTRADO');

      await insertar(
        `INSERT INTO compra_detalle
          (compra_id, linea, producto_id, descripcion, unidad_medida_id, cantidad, costo_unitario,
           descuento_unitario, costo_unitario_neto, impuesto_id, impuesto_tasa, subtotal, total_linea)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          compraId, linea, l.productoId, prod.nombre, prod.unidad_medida_id,
          cantidadASql(l.cantidad), unitarioASql(l.costoUnit), unitarioASql(l.descUnit),
          unitarioASql(l.costoNeto), prod.impuesto_id, tasaMilesimasASql(aTasa(prod.impuesto_tasa)),
          centavosASql(l.subtotal), centavosASql(l.subtotal),
        ],
        cx,
      );

      await ingresarStockYRecalcularCPP(cx, {
        productoId: l.productoId, sucursalId: usuario.sucursalId, cantidad: l.cantidad,
        costoNetoUnit: l.costoNeto, compraId, usuarioId: usuario.id,
      });
    }

    // Cuenta por pagar al proveedor si es a credito.
    if (entrada.condicionPago === CONDICION_PAGO.CREDITO) {
      await ejecutar(
        `UPDATE proveedores SET saldo_actual = saldo_actual + ? WHERE id = ?`,
        [centavosASql(totalUsd), proveedorId], cx,
      );
    }

    return { id: compraId, numero: `${prefijo}${numero}`, total_usd: centavosASql(totalUsd) };
  });
}

/** Ingresa stock y recalcula el costo promedio ponderado movil. */
async function ingresarStockYRecalcularCPP(
  cx: Ejecutor,
  d: { productoId: number; sucursalId: number; cantidad: bigint; costoNetoUnit: bigint; compraId: number; usuarioId: number },
): Promise<void> {
  const stock = await queryOne<{ cantidad: string; costo_promedio: string }>(
    `SELECT cantidad, costo_promedio FROM producto_stock
      WHERE producto_id = ? AND sucursal_id = ? LIMIT 1 FOR UPDATE`,
    [d.productoId, d.sucursalId], cx,
  );

  const saldoAnterior = aCantidad(stock?.cantidad ?? '0');
  const cppAnterior = aUnitario(stock?.costo_promedio ?? '0');
  const saldoPosterior = saldoAnterior + d.cantidad;

  // CPP nuevo = (saldoAnterior*cppAnterior + cantidad*costoNeto) / saldoPosterior
  // Valores en escala real: usamos bigint con escalas y dividimos.
  //   valorAnterior (escala 2) = saldoAnterior(3) * cppAnterior(4)  -> reescalar a 2
  //   valorEntrada  (escala 2) = cantidad(3) * costoNeto(4)
  const valorAnterior = multiplicarPorCantidad(cppAnterior, saldoAnterior); // escala 2
  const valorEntrada = multiplicarPorCantidad(d.costoNetoUnit, d.cantidad); // escala 2
  const valorTotal = valorAnterior + valorEntrada;

  // cpp nuevo (escala 4) = valorTotal(2) / saldoPosterior(cantidad real)
  //   = valorTotal * 10^2 (para pasar a escala 4 del total) / saldoPosterior_real
  //   saldoPosterior_real = saldoPosterior_esc3 / 10^3
  //   cpp4 = valorTotal_esc2 * 10^2 * 10^3 / saldoPosterior_esc3 = valorTotal * 10^5 / saldoPosterior
  const cppNuevo =
    saldoPosterior > 0n ? dividirRedondeando(valorTotal * 100_000n, saldoPosterior) : d.costoNetoUnit;

  if (stock) {
    await ejecutar(
      `UPDATE producto_stock SET cantidad = ?, costo_promedio = ?, ultima_entrada_en = NOW(3)
        WHERE producto_id = ? AND sucursal_id = ?`,
      [cantidadASql(saldoPosterior), unitarioASql(cppNuevo), d.productoId, d.sucursalId], cx,
    );
  } else {
    await insertar(
      `INSERT INTO producto_stock (producto_id, sucursal_id, cantidad, costo_promedio, ultima_entrada_en)
       VALUES (?, ?, ?, ?, NOW(3))`,
      [d.productoId, d.sucursalId, cantidadASql(saldoPosterior), unitarioASql(cppNuevo)], cx,
    );
  }

  // Actualiza tambien el costo del producto (valorizacion actual).
  await ejecutar(
    `UPDATE productos SET costo_promedio = ?, ultimo_costo = ? WHERE id = ?`,
    [unitarioASql(cppNuevo), unitarioASql(d.costoNetoUnit), d.productoId], cx,
  );

  await insertar(
    `INSERT INTO inventario_movimientos
      (sucursal_id, producto_id, tipo, signo, cantidad, costo_unitario, costo_total,
       saldo_anterior, saldo_posterior, costo_promedio_anterior, costo_promedio_posterior,
       documento_tipo, compra_id, usuario_id, nota)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      d.sucursalId, d.productoId, TIPO_MOVIMIENTO_INVENTARIO.ENTRADA_COMPRA,
      SIGNO_MOVIMIENTO_INVENTARIO.ENTRADA_COMPRA, cantidadASql(d.cantidad),
      unitarioASql(d.costoNetoUnit), centavosASql(valorEntrada), cantidadASql(saldoAnterior),
      cantidadASql(saldoPosterior), unitarioASql(cppAnterior), unitarioASql(cppNuevo),
      DOCUMENTO_TIPO_MOVIMIENTO.COMPRA, d.compraId, d.usuarioId, 'Entrada por compra',
    ],
    cx,
  );
}

function tasaMilesimasASql(tasaMilesimas: bigint): string {
  return `${tasaMilesimas / 1000n}.${(tasaMilesimas % 1000n).toString().padStart(3, '0')}`;
}

async function siguienteConsecutivo(
  cx: Ejecutor, sucursalId: number, tipo: string, anio: number,
): Promise<{ numero: number; prefijo: string }> {
  const fila = await queryOne<{ id: number; ultimo_numero: number; prefijo: string }>(
    `SELECT id, ultimo_numero, prefijo FROM consecutivos
      WHERE sucursal_id = ? AND tipo_documento = ? AND anio = ? LIMIT 1 FOR UPDATE`,
    [sucursalId, tipo, anio], cx,
  );
  if (!fila) {
    await insertar(
      `INSERT INTO consecutivos (sucursal_id, tipo_documento, anio, prefijo, ultimo_numero) VALUES (?, ?, ?, 'C-', 1)`,
      [sucursalId, tipo, anio], cx,
    );
    return { numero: 1, prefijo: 'C-' };
  }
  const nuevo = fila.ultimo_numero + 1;
  await ejecutar(`UPDATE consecutivos SET ultimo_numero = ? WHERE id = ?`, [nuevo, fila.id], cx);
  return { numero: nuevo, prefijo: fila.prefijo };
}

export async function listar(
  sucursalId: number, desplazamiento: number, limite: number,
): Promise<{ datos: unknown[]; total: number }> {
  const datos = await query(
    `SELECT c.id, CONCAT(c.prefijo, c.numero) AS numero, c.fecha_recepcion, c.total_usd, c.total_bs,
            c.estado, c.condicion_pago, c.saldo_pendiente, p.razon_social AS proveedor
       FROM compras c JOIN proveedores p ON p.id = c.proveedor_id
      WHERE c.sucursal_id = ? ORDER BY c.id DESC LIMIT ? OFFSET ?`,
    [sucursalId, limite, desplazamiento],
  );
  const total = await queryOne<{ n: number }>(`SELECT COUNT(*) AS n FROM compras WHERE sucursal_id = ?`, [sucursalId]);
  return { datos, total: total?.n ?? 0 };
}

export async function detalle(id: number, sucursalId: number): Promise<unknown> {
  const compra = await queryOne(
    `SELECT c.*, p.razon_social AS proveedor FROM compras c JOIN proveedores p ON p.id = c.proveedor_id
      WHERE c.id = ? AND c.sucursal_id = ?`,
    [id, sucursalId],
  );
  if (!compra) throw new NoEncontrado('COMPRA_NO_ENCONTRADA');
  const renglones = await query(`SELECT * FROM compra_detalle WHERE compra_id = ? ORDER BY linea`, [id]);
  return { compra, renglones };
}

/** Anula una compra recibida: revierte stock y cuenta por pagar (reversion documental). */
export async function anular(id: number, sucursalId: number, usuario: UsuarioAutenticado, motivo: string): Promise<void> {
  await withTransaction(async (cx) => {
    const compra = await queryOne<{ id: number; estado: string; proveedor_id: number; condicion_pago: string; total_usd: string }>(
      `SELECT id, estado, proveedor_id, condicion_pago, total_usd FROM compras WHERE id = ? AND sucursal_id = ? LIMIT 1 FOR UPDATE`,
      [id, sucursalId], cx,
    );
    if (!compra) throw new NoEncontrado('COMPRA_NO_ENCONTRADA');
    if (compra.estado === ESTADO_COMPRA.ANULADA) throw new Conflicto('COMPRA_YA_ANULADA');

    const renglones = await query<{ producto_id: number; cantidad: string; costo_unitario_neto: string }>(
      `SELECT producto_id, cantidad, costo_unitario_neto FROM compra_detalle WHERE compra_id = ?`,
      [id], cx,
    );

    for (const r of renglones) {
      const cantidad = aCantidad(r.cantidad);
      const stock = await queryOne<{ cantidad: string; costo_promedio: string }>(
        `SELECT cantidad, costo_promedio FROM producto_stock WHERE producto_id = ? AND sucursal_id = ? FOR UPDATE`,
        [r.producto_id, sucursalId], cx,
      );
      const saldoAnterior = aCantidad(stock?.cantidad ?? '0');
      const saldoPosterior = saldoAnterior - cantidad;
      const cpp = aUnitario(stock?.costo_promedio ?? '0');
      await ejecutar(
        `UPDATE producto_stock SET cantidad = ? WHERE producto_id = ? AND sucursal_id = ?`,
        [cantidadASql(saldoPosterior < 0n ? 0n : saldoPosterior), r.producto_id, sucursalId], cx,
      );
      await insertar(
        `INSERT INTO inventario_movimientos
          (sucursal_id, producto_id, tipo, signo, cantidad, costo_unitario, costo_total,
           saldo_anterior, saldo_posterior, costo_promedio_anterior, costo_promedio_posterior,
           documento_tipo, compra_id, usuario_id, nota)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          sucursalId, r.producto_id, TIPO_MOVIMIENTO_INVENTARIO.ANULACION_COMPRA, -1,
          cantidadASql(cantidad), unitarioASql(cpp), centavosASql(multiplicarPorCantidad(cpp, cantidad)),
          cantidadASql(saldoAnterior), cantidadASql(saldoPosterior < 0n ? 0n : saldoPosterior),
          unitarioASql(cpp), unitarioASql(cpp), DOCUMENTO_TIPO_MOVIMIENTO.COMPRA, id,
          usuario.id, `Anulacion compra: ${motivo}`,
        ],
        cx,
      );
    }

    if (compra.condicion_pago === CONDICION_PAGO.CREDITO) {
      await ejecutar(
        `UPDATE proveedores SET saldo_actual = GREATEST(0, saldo_actual - ?) WHERE id = ?`,
        [compra.total_usd, compra.proveedor_id], cx,
      );
    }

    await ejecutar(
      `UPDATE compras SET estado = 'ANULADA', anulada_en = NOW(3), anulada_por = ?, motivo_anulacion = ? WHERE id = ?`,
      [usuario.id, motivo, id], cx,
    );
  });
}
