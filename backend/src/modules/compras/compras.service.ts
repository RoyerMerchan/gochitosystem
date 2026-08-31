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
import { existeTabla, existeColumna } from '../../database/esquema';
import {
  aCentavos, aCantidad, aUnitario, cantidadASql, unitarioASql, centavosASql,
  multiplicarPorCantidad, dividirRedondeando, sumar, aTasa,
} from '../../utils/dinero';
import { costoPromedioTrasEntrada } from '../../utils/costeo';
import {
  aTasaCambio, usdABs, bsASql, aMontoMoneda, montoMonedaASql, montoMonedaAUsdPiso,
  usdAMontoMoneda,
} from '../../utils/moneda';
import { siguienteConsecutivo } from '../../utils/consecutivos';
import {
  TIPO_MOVIMIENTO_INVENTARIO, DOCUMENTO_TIPO_MOVIMIENTO, SIGNO_MOVIMIENTO_INVENTARIO,
  ESTADO_COMPRA, CONDICION_PAGO, TIPO_DOCUMENTO,
} from '../../config/constantes';
import { registrarMovimiento, turnoActivoDeUsuario } from '../caja/caja.service';
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
      `SELECT tasa FROM tasas_cambio WHERE fecha = CURRENT_DATE AND eliminado_en IS NULL LIMIT 1`,
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
       VALUES (?, ?, ?, ?, ?, ?, ?, COALESCE(?, CURRENT_DATE), NOW(), ?, 0, ?, ?, ?, ?, ?, ?, 'RECIBIDA', ?, ?)`,
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
  /**
   * `costo_confirmado` llego con la migracion 0009 y en produccion la base es
   * externa: si el despliegue va por delante de la migracion, ingresar mercancia
   * no puede reventar. Sin la columna se promedia siempre, como antes.
   */
  const hayConfirmado = await existeColumna('producto_stock', 'costo_confirmado', cx);
  const stock = await queryOne<{ cantidad: string; costo_promedio: string; costo_confirmado?: boolean }>(
    `SELECT cantidad, costo_promedio${hayConfirmado ? ', costo_confirmado' : ''} FROM producto_stock
      WHERE producto_id = ? AND sucursal_id = ? LIMIT 1 FOR UPDATE`,
    [d.productoId, d.sucursalId], cx,
  );

  const saldoAnterior = aCantidad(stock?.cantidad ?? '0');
  const cppAnterior = aUnitario(stock?.costo_promedio ?? '0');
  const saldoPosterior = saldoAnterior + d.cantidad;
  /**
   * Si el costo que hay es la semilla que alguien tecleo al crear el producto,
   * esta entrada lo pisa en vez de promediarlo: no se promedia un estimado con
   * plata real. Ver migracion 0009.
   */
  const esSemilla = hayConfirmado && !stock?.costo_confirmado;

  const valorEntrada = multiplicarPorCantidad(d.costoNetoUnit, d.cantidad); // escala 2
  const cppNuevo = costoPromedioTrasEntrada({
    saldoAnterior, cppAnterior, cantidad: d.cantidad, costoUnitario: d.costoNetoUnit, esSemilla,
  });

  if (stock) {
    await ejecutar(
      `UPDATE producto_stock SET cantidad = ?, costo_promedio = ?${hayConfirmado ? ', costo_confirmado = TRUE' : ''},
              ultima_entrada_en = NOW()
        WHERE producto_id = ? AND sucursal_id = ?`,
      [cantidadASql(saldoPosterior), unitarioASql(cppNuevo), d.productoId, d.sucursalId], cx,
    );
  } else {
    await ejecutar(
      `INSERT INTO producto_stock (producto_id, sucursal_id, cantidad, costo_promedio${hayConfirmado ? ', costo_confirmado' : ''}, ultima_entrada_en)
       VALUES (?, ?, ?, ?${hayConfirmado ? ', TRUE' : ''}, NOW())`,
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
      DOCUMENTO_TIPO_MOVIMIENTO.COMPRA, d.compraId, d.usuarioId,
      esSemilla ? 'Entrada por compra (fija el costo real)' : 'Entrada por compra',
    ],
    cx,
  );
}

function tasaMilesimasASql(tasaMilesimas: bigint): string {
  return `${tasaMilesimas / 1000n}.${(tasaMilesimas % 1000n).toString().padStart(3, '0')}`;
}


export async function listar(
  sucursalId: number, desplazamiento: number, limite: number,
  filtros: { desde?: string; hasta?: string; proveedorId?: number } = {},
): Promise<{ datos: unknown[]; total: number }> {
  const cond = ['c.sucursal_id = ?'];
  const params: (string | number)[] = [sucursalId];
  if (filtros.desde) { cond.push('c.fecha_recepcion >= ?'); params.push(`${filtros.desde} 00:00:00`); }
  if (filtros.hasta) { cond.push('c.fecha_recepcion <= ?'); params.push(`${filtros.hasta} 23:59:59`); }
  if (filtros.proveedorId) { cond.push('c.proveedor_id = ?'); params.push(filtros.proveedorId); }
  const where = `WHERE ${cond.join(' AND ')}`;

  const datos = await query(
    `SELECT c.id, c.prefijo || c.numero AS numero, c.fecha_recepcion, c.total_usd, c.total_bs,
            c.estado, c.condicion_pago, c.saldo_pendiente, c.numero_factura_proveedor,
            c.proveedor_id, p.razon_social AS proveedor
       FROM compras c JOIN proveedores p ON p.id = c.proveedor_id
      ${where} ORDER BY c.id DESC LIMIT ? OFFSET ?`,
    [...params, limite, desplazamiento],
  );
  const total = await queryOne<{ n: number }>(`SELECT COUNT(*) AS n FROM compras c ${where}`, params);
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
  // Lo que ya se le pago al proveedor por esta entrada, para que el saldo que se
  // muestra tenga de donde salir a la vista. Si la migracion que crea la tabla
  // todavia no corrio, el detalle de la entrada se muestra igual: ver que se
  // ingreso no puede depender de una funcion nueva.
  const pagos = await existeTabla('compra_pagos')
    ? await query(
      `SELECT cp.id, cp.fecha, cp.moneda, cp.monto_moneda, cp.tasa_aplicada, cp.monto_usd,
              cp.referencia, mp.nombre AS metodo_nombre, u.nombre_completo AS usuario
         FROM compra_pagos cp
         JOIN metodos_pago mp ON mp.id = cp.metodo_pago_id
         JOIN usuarios u ON u.id = cp.usuario_id
        WHERE cp.compra_id = ? AND cp.estado = 'APLICADO'
        ORDER BY cp.fecha`,
      [id],
    )
    : [];
  return { compra, renglones, pagos };
}

export interface PagoCompraEntrada {
  metodoPagoId: Id;
  /** Moneda en la que sale la plata. Debe ser la del metodo de pago. */
  moneda: 'USD' | 'VES';
  montoMoneda: string;
  referencia?: string;
  observaciones?: string;
}

/**
 * Tolerancia de cierre: 1 centavo de USD.
 *
 * Pagandole al proveedor en Bs, dividir por la tasa casi nunca cae exacto sobre el
 * saldo en USD. Sin tolerancia la entrada queda debiendo $ 0,01 imposibles de pagar
 * —o rechaza el pago completo por un centavo—. La misma regla que en los abonos.
 */
const TOLERANCIA_CIERRE = 1n;

/**
 * Le paga (total o parcialmente) una entrada de mercancia al proveedor.
 *
 * Una entrada a credito abria `compras.saldo_pendiente` y ahi se quedaba: no habia
 * forma de registrar que se le pago, asi que la entrada seguia diciendo "Debes $ X"
 * para siempre. Esto es el espejo del abono del cliente, con la plata al reves:
 *
 *   - baja `compras.saldo_pendiente` (la entrada queda pagada cuando llega a 0),
 *   - baja la cuenta por pagar del proveedor,
 *   - si se paga en efectivo, saca la plata de la gaveta con su movimiento de caja
 *     para que el arqueo del turno cuadre.
 */
export async function pagar(
  compraId: number,
  entrada: PagoCompraEntrada,
  usuario: UsuarioAutenticado,
  idempotencyKey: string | null,
): Promise<{
  id: Id; compra_id: number; moneda: string; monto_moneda: string;
  monto_usd: string; saldo_pendiente: string; pagada: boolean;
}> {
  return withTransaction(async (cx) => {
    // Sin la tabla no hay donde anotar el pago, y bajarle el saldo al proveedor sin
    // dejar rastro es peor que no cobrar: mejor decir que falta la migracion.
    if (!(await existeTabla('compra_pagos', cx))) throw new Conflicto('MIGRACION_PENDIENTE');

    const compra = await queryOne<{
      id: number; estado: string; proveedor_id: number; prefijo: string; numero: number;
      moneda_pago: 'USD' | 'VES'; tasa_cambio: string; total_pagado_moneda: string;
      saldo_pendiente: string;
    }>(
      `SELECT id, estado, proveedor_id, prefijo, numero, moneda_pago, tasa_cambio,
              total_pagado_moneda, saldo_pendiente
         FROM compras WHERE id = ? AND sucursal_id = ? LIMIT 1 FOR UPDATE`,
      [compraId, usuario.sucursalId], cx,
    );
    if (!compra) throw new NoEncontrado('COMPRA_NO_ENCONTRADA');
    if (compra.estado === ESTADO_COMPRA.ANULADA) throw new Conflicto('COMPRA_YA_ANULADA');

    const saldo = aCentavos(compra.saldo_pendiente);
    if (saldo <= 0n) throw new Conflicto('COMPRA_SIN_SALDO');

    // Metodo de pago: de aca sale si la plata pasa por la gaveta.
    const metodo = await queryOne<{
      moneda: 'USD' | 'VES'; requiere_referencia: boolean;
      afecta_caja_efectivo: boolean; es_no_es_cobro: boolean; esta_activo: boolean;
    }>(
      `SELECT moneda, requiere_referencia, afecta_caja_efectivo, es_no_es_cobro, esta_activo
         FROM metodos_pago WHERE id = ? AND eliminado_en IS NULL`,
      [entrada.metodoPagoId], cx,
    );
    if (!metodo || !metodo.esta_activo) throw new NoEncontrado('NO_ENCONTRADO');
    // "Credito (fiado)" no mueve plata: es justamente lo que se esta pagando.
    if (metodo.es_no_es_cobro) throw new ReglaNegocio('METODO_PAGO_NO_VALIDO');
    if (metodo.moneda !== entrada.moneda) throw new ReglaNegocio('MONEDA_NO_COINCIDE');
    if (metodo.requiere_referencia && !entrada.referencia?.trim()) {
      throw new ReglaNegocio('REFERENCIA_REQUERIDA');
    }

    // Tasa del dia para valorar el pago. Pagando en Bs es obligatoria; en dolares
    // no hace falta convertir nada y sirve la tasa congelada de la entrada.
    const tasaFila = await queryOne<{ tasa: string }>(
      `SELECT tasa FROM tasas_cambio WHERE fecha = CURRENT_DATE AND eliminado_en IS NULL LIMIT 1`,
      [], cx,
    );
    if (!tasaFila && entrada.moneda === 'VES') throw new ReglaNegocio('SIN_TASA_DEL_DIA');
    const tasa = tasaFila?.tasa ?? compra.tasa_cambio;
    const tasaEsc = aTasaCambio(tasa);

    const montoMonedaEsc = aMontoMoneda(entrada.montoMoneda);
    // Piso, igual que en los abonos: nunca se da por pagado mas de lo que cubre la
    // plata que salio de verdad.
    let montoUsd = montoMonedaAUsdPiso(montoMonedaEsc, entrada.moneda, tasaEsc);
    if (montoUsd <= 0n) throw new ReglaNegocio('MONTO_INVALIDO');

    if (montoUsd > saldo) {
      if (montoUsd - saldo > TOLERANCIA_CIERRE) throw new ReglaNegocio('PAGO_MAYOR_AL_SALDO');
      montoUsd = saldo; // diferencia de redondeo de la tasa: se toma como pago exacto
    } else if (saldo - montoUsd <= TOLERANCIA_CIERRE) {
      montoUsd = saldo; // cierra la entrada en vez de dejar 0,01 de deuda fantasma
    }

    // Efectivo: la plata sale de la gaveta, asi que exige turno abierto.
    const turno = metodo.afecta_caja_efectivo
      ? await turnoActivoDeUsuario(usuario.id, usuario.sucursalId)
      : null;
    if (metodo.afecta_caja_efectivo && !turno) throw new Conflicto('CAJA_NO_ABIERTA');

    const pagoId = await insertar(
      `INSERT INTO compra_pagos
        (compra_id, sucursal_id, turno_caja_id, metodo_pago_id, usuario_id, moneda,
         monto_moneda, tasa_aplicada, monto_usd, referencia, observaciones,
         estado, clave_idempotencia)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'APLICADO', ?)`,
      [
        compraId, usuario.sucursalId, turno?.id ?? null, entrada.metodoPagoId, usuario.id,
        entrada.moneda, montoMonedaASql(montoMonedaEsc), tasa, centavosASql(montoUsd),
        entrada.referencia?.trim() ?? null, entrada.observaciones?.trim() ?? null, idempotencyKey,
      ],
      cx,
    );

    const saldoNuevo = saldo - montoUsd;
    // `total_pagado_moneda` lleva lo pagado EN LA MONEDA DE LA ENTRADA: si se paga
    // en la otra, se convierte, para que la columna signifique una sola cosa.
    const pagadoEnMonedaCompra = compra.moneda_pago === entrada.moneda
      ? montoMonedaEsc
      : usdAMontoMoneda(montoUsd, compra.moneda_pago, tasaEsc);
    await ejecutar(
      `UPDATE compras SET saldo_pendiente = ?, total_pagado_moneda = total_pagado_moneda + ? WHERE id = ?`,
      [centavosASql(saldoNuevo), montoMonedaASql(pagadoEnMonedaCompra), compraId], cx,
    );

    // Cuenta por pagar del proveedor.
    await ejecutar(
      `UPDATE proveedores SET saldo_actual = GREATEST(0, saldo_actual - ?) WHERE id = ?`,
      [centavosASql(montoUsd), compra.proveedor_id], cx,
    );

    // Movimiento de caja: la plata sale de la gaveta y baja lo esperado al cierre.
    if (turno) {
      const concepto = `Pago entrada ${compra.prefijo}${compra.numero}`;
      await registrarMovimiento(
        cx, turno.id, usuario.sucursalId, 'EGRESO', -1, entrada.moneda,
        montoMonedaASql(montoMonedaEsc), tasa, centavosASql(montoUsd),
        concepto, usuario.id, entrada.metodoPagoId, 'MANUAL', compraId,
      );
      if (entrada.moneda === 'USD') {
        await ejecutar(
          `UPDATE turnos_caja SET total_egresos_usd = total_egresos_usd + ?, esperado_usd = esperado_usd - ? WHERE id = ?`,
          [centavosASql(montoUsd), centavosASql(montoUsd), turno.id], cx,
        );
      } else {
        const bs = dividirRedondeando(montoMonedaEsc, 100n); // escala 4 -> 2
        await ejecutar(
          `UPDATE turnos_caja SET total_egresos_bs = total_egresos_bs + ?, esperado_bs = esperado_bs - ? WHERE id = ?`,
          [bsASql(bs), bsASql(bs), turno.id], cx,
        );
      }
    }

    return {
      id: pagoId,
      compra_id: compraId,
      moneda: entrada.moneda,
      monto_moneda: montoMonedaASql(montoMonedaEsc),
      monto_usd: centavosASql(montoUsd),
      saldo_pendiente: centavosASql(saldoNuevo),
      pagada: saldoNuevo <= 0n,
    };
  });
}

/** Anula una compra recibida: revierte stock y cuenta por pagar (reversion documental). */
export async function anular(id: number, sucursalId: number, usuario: UsuarioAutenticado, motivo: string): Promise<void> {
  await withTransaction(async (cx) => {
    const compra = await queryOne<{ id: number; estado: string; proveedor_id: number; condicion_pago: string; total_usd: string; saldo_pendiente: string }>(
      `SELECT id, estado, proveedor_id, condicion_pago, total_usd, saldo_pendiente
         FROM compras WHERE id = ? AND sucursal_id = ? LIMIT 1 FOR UPDATE`,
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

    // Al proveedor se le devuelve lo que TODAVIA se le debe, no el total de la
    // entrada: si ya se le habia pagado una parte, ese pago ya bajo su cuenta y
    // restar el total otra vez lo dejaria con saldo a favor de la nada.
    if (compra.condicion_pago === CONDICION_PAGO.CREDITO) {
      await ejecutar(
        `UPDATE proveedores SET saldo_actual = GREATEST(0, saldo_actual - ?) WHERE id = ?`,
        [compra.saldo_pendiente, compra.proveedor_id], cx,
      );
    }

    await ejecutar(
      `UPDATE compras SET estado = 'ANULADA', saldo_pendiente = 0, anulada_en = NOW(),
              anulada_por = ?, motivo_anulacion = ? WHERE id = ?`,
      [usuario.id, motivo, id], cx,
    );
  });
}
