/**
 * NUCLEO DEL SISTEMA: registro de una venta en el POS.
 *
 * Toda la operacion ocurre en UNA transaccion, con las dos reglas innegociables:
 *   1) SNAPSHOT DE COSTO: precio_compra_unitario se copia de producto_stock.costo_promedio
 *      EN ESE INSTANTE. La utilidad se calcula y se guarda; jamas se recalcula.
 *   2) SNAPSHOT DE TASA: ventas.tasa_cambio congela la tasa del dia. total_bs se
 *      calcula una vez y se guarda; jamas se recalcula con la tasa de hoy.
 *
 * Pasos: validar tasa del dia -> validar turno abierto -> FOR UPDATE del consecutivo
 * -> por renglon FOR UPDATE del stock y snapshot de costo -> calcular impuestos,
 * descuentos y utilidad -> insertar venta, detalle y pagos (mixtos entre monedas)
 * -> descontar stock e insertar el ledger -> crear credito si queda saldo ->
 * registrar movimientos de caja -> COMMIT.
 */
import { ReglaNegocio, Conflicto, NoEncontrado } from '../../errores/AppError';
import {
  query,
  queryOne,
  ejecutar,
  insertar,
  withTransaction,
  type Ejecutor,
} from '../../database/pool';
import {
  aCentavos,
  aUnitario,
  aCantidad,
  aTasa,
  unitarioASql,
  cantidadASql,
  centavosASql,
  multiplicarPorCantidad,
  desagregarImpuesto,
  agregarImpuesto,
  prorratearDescuento,
  dividirRedondeando,
  sumar,
} from '../../utils/dinero';
import {
  aTasaCambio,
  usdABs,
  bsASql,
  montoMonedaAUsd,
  montoMonedaASql,
} from '../../utils/moneda';
import {
  MONEDA,
  TIPO_MOVIMIENTO_INVENTARIO,
  DOCUMENTO_TIPO_MOVIMIENTO,
  SIGNO_MOVIMIENTO_INVENTARIO,
  ESTADO_VENTA,
  ESTADO_CREDITO,
  ORIGEN_CREDITO,
  TIPO_DOCUMENTO,
} from '../../config/constantes';
import { exigirTasaDeHoy } from '../tasas/tasas.service';
import { turnoActivoDeUsuario, registrarMovimiento } from '../caja/caja.service';
import type { Id } from '../../tipos/comunes';
import type { UsuarioAutenticado } from '../../tipos/comunes';
import type { VentaEntrada } from './pos.types';

/** Fila de producto bloqueada para la venta. */
interface FilaProductoVenta {
  id: number;
  nombre: string;
  categoria_id: number;
  unidad_medida_id: number;
  impuesto_id: number;
  impuesto_tasa: string;
  precio_venta: string;
  es_precio_incluye_impuesto: boolean;
  es_maneja_inventario: boolean;
  esta_activo: boolean;
  cantidad: string | null;
  costo_promedio: string | null;
}

/** Metodo de pago con su moneda y reglas. */
interface FilaMetodoPago {
  id: number;
  moneda: 'USD' | 'VES';
  requiere_referencia: boolean;
  afecta_caja_efectivo: boolean;
  es_no_es_cobro: boolean;
  esta_activo: boolean;
}

/** Calculo intermedio por renglon (todo en escala USD). */
interface RenglonCalculado {
  productoId: number;
  descripcion: string;
  categoriaId: number;
  unidadMedidaId: number;
  impuestoId: number;
  impuestoTasaMilesimas: bigint;
  cantidad: bigint; // escala 3
  precioVentaUnit: bigint; // escala 4
  precioCompraUnit: bigint; // escala 4 (SNAPSHOT DE COSTO)
  descuentoUnit: bigint; // escala 4 (incluye prorrateo del descuento de documento)
  esPrecioIncluyeImpuesto: boolean;
  esManejaInventario: boolean;
  base: bigint; // escala 2
  impuesto: bigint; // escala 2
  costoTotal: bigint; // escala 2
  utilidadTotal: bigint; // escala 2
  totalLinea: bigint; // escala 2
}

export interface ResultadoVenta {
  id: Id;
  numero: string;
  total_usd: string;
  total_bs: string;
  tasa_cambio: string;
  total_pagado_usd: string;
  total_credito_usd: string;
  vuelto_usd: string;
  utilidad_total: string;
}

/**
 * Registra una venta completa. `idempotencyKey` ya fue validada por el middleware;
 * si esta venta ya existe con esa clave, el UNIQUE la rechaza y se traduce a 409.
 */
export async function registrarVenta(
  entrada: VentaEntrada,
  usuario: UsuarioAutenticado,
  idempotencyKey: string | null,
): Promise<ResultadoVenta> {
  if (entrada.renglones.length === 0) throw new ReglaNegocio('VENTA_SIN_RENGLONES');

  return withTransaction(async (cx) => {
    // --- 1. Tasa del dia (o SIN_TASA_DEL_DIA) ---------------------------------
    const tasaHoy = await exigirTasaDeHoy(cx);
    const tasaEscalada = aTasaCambio(tasaHoy.tasa);

    // --- 2. Turno de caja abierto --------------------------------------------
    const turno = await turnoActivoDeUsuario(usuario.id, usuario.sucursalId);
    if (!turno) throw new Conflicto('CAJA_NO_ABIERTA');

    // --- 3. Consecutivo con FOR UPDATE (sin condicion de carrera) -------------
    const anio = new Date().getFullYear();
    const { numero, prefijo } = await siguienteConsecutivo(
      cx,
      usuario.sucursalId,
      TIPO_DOCUMENTO.VENTA,
      anio,
    );

    // --- 4. Bloqueo de stock y snapshot de costo por renglon -----------------
    const calculados = await calcularRenglones(cx, entrada, usuario.sucursalId);

    // --- 5. Totales del documento --------------------------------------------
    const subtotalBruto = sumar(
      calculados.map((r) => multiplicarPorCantidad(r.precioVentaUnit, r.cantidad)),
    );
    const baseTotal = sumar(calculados.map((r) => r.base));
    const impuestoTotal = sumar(calculados.map((r) => r.impuesto));
    const costoTotal = sumar(calculados.map((r) => r.costoTotal));
    const utilidadTotal = sumar(calculados.map((r) => r.utilidadTotal));
    const descuentoLineas = sumar(
      calculados.map((r) => multiplicarPorCantidad(r.descuentoUnit, r.cantidad)),
    );
    const totalUsd = baseTotal + impuestoTotal; // escala 2
    const totalBs = usdABs(totalUsd, tasaEscalada);

    // --- 6. Pagos (mixtos entre monedas) -------------------------------------
    const { pagosCalculados, pagadoUsd, creditoUsd } = await calcularPagos(
      cx,
      entrada,
      totalUsd,
      tasaEscalada,
    );

    // Credito: exige cliente identificado con cupo suficiente.
    if (creditoUsd > 0n) {
      await validarCredito(cx, entrada.clienteId ?? null, creditoUsd);
    }
    const vueltoUsd = pagadoUsd > totalUsd ? pagadoUsd - totalUsd : 0n;

    // --- 7. Insertar la venta -------------------------------------------------
    const cantidadItems = sumar(calculados.map((r) => r.cantidad));
    const ventaId = await insertar(
      `INSERT INTO ventas
        (sucursal_id, turno_caja_id, usuario_id, cliente_id, prefijo, numero, anio, fecha,
         subtotal_bruto, descuento_lineas, descuento_documento, base_gravable, impuesto_total,
         total_usd, tasa_cambio, tasa_cambio_id, total_bs, costo_total, utilidad_total,
         total_pagado, total_credito, cantidad_items, es_credito, estado, clave_idempotencia)
       VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        usuario.sucursalId, turno.id, usuario.id, entrada.clienteId ?? null, prefijo, numero, anio,
        centavosASql(subtotalBruto), centavosASql(descuentoLineas),
        centavosASql(aCentavos(entrada.descuentoDocumento ?? '0')),
        centavosASql(baseTotal), centavosASql(impuestoTotal),
        centavosASql(totalUsd), tasaHoy.tasa, tasaHoy.id, bsASql(totalBs),
        centavosASql(costoTotal), centavosASql(utilidadTotal),
        centavosASql(pagadoUsd > totalUsd ? totalUsd : pagadoUsd), centavosASql(creditoUsd),
        cantidadASql(cantidadItems), creditoUsd > 0n, ESTADO_VENTA.CERRADA,
        idempotencyKey,
      ],
      cx,
    );

    // --- 8. Renglones, stock y ledger ----------------------------------------
    let linea = 0;
    for (const r of calculados) {
      linea += 1;
      // utilidad_unitaria (escala 4) = utilidad_total(esc 2) / cantidad(esc 3).
      // valor real = (utilidadTotal/100) / (cantidad/1000); escalado a 4 -> *100000.
      const utilidadUnit =
        r.cantidad > 0n ? dividirRedondeando(r.utilidadTotal * 100_000n, r.cantidad) : 0n;

      await insertar(
        `INSERT INTO venta_detalle
          (venta_id, linea, producto_id, descripcion, categoria_id, unidad_medida_id, cantidad,
           precio_compra_unitario, precio_venta_unitario, descuento_unitario, impuesto_id,
           impuesto_tasa, impuesto_monto, es_precio_incluia_impuesto, base_gravable, costo_total,
           utilidad_unitaria, utilidad_total, total_linea)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          ventaId, linea, r.productoId, r.descripcion, r.categoriaId, r.unidadMedidaId,
          cantidadASql(r.cantidad), unitarioASql(r.precioCompraUnit), unitarioASql(r.precioVentaUnit),
          unitarioASql(r.descuentoUnit), r.impuestoId, tasaMilesimasASql(r.impuestoTasaMilesimas),
          centavosASql(r.impuesto), r.esPrecioIncluyeImpuesto ?? false, centavosASql(r.base),
          centavosASql(r.costoTotal), unitarioASql(utilidadUnit), centavosASql(r.utilidadTotal),
          centavosASql(r.totalLinea),
        ],
        cx,
      );

      if (r.esManejaInventario) {
        await descontarStock(cx, r, ventaId, usuario.id, usuario.sucursalId);
      }
    }

    // --- 9. Pagos -------------------------------------------------------------
    for (const p of pagosCalculados) {
      await insertar(
        `INSERT INTO pagos
          (venta_id, sucursal_id, turno_caja_id, metodo_pago_id, moneda, monto_moneda,
           tasa_aplicada, monto_usd, referencia, usuario_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          ventaId, usuario.sucursalId, turno.id, p.metodoPagoId, p.moneda,
          montoMonedaASql(p.montoMoneda), tasaHoy.tasa, centavosASql(p.montoUsd),
          p.referencia ?? null, usuario.id,
        ],
        cx,
      );

      // Movimiento de caja de efectivo por su moneda.
      if (p.afectaCaja) {
        await registrarMovimiento(
          cx, turno.id, usuario.sucursalId, 'VENTA', 1, p.moneda,
          montoMonedaASql(p.montoMoneda), tasaHoy.tasa, centavosASql(p.montoUsd),
          `Venta ${prefijo}${numero}`, usuario.id, p.metodoPagoId, 'VENTA', ventaId,
        );
        await sumarACaja(cx, turno.id, p.moneda, p.montoMoneda, p.montoUsd, 'venta');
      }
    }

    // --- 10. Vueltas ----------------------------------------------------------
    if (vueltoUsd > 0n) {
      const monedaVuelto = entrada.monedaVuelto ?? MONEDA.USD;
      const montoVueltoMoneda =
        monedaVuelto === MONEDA.USD ? vueltoUsd * 100n : usdABs(vueltoUsd, tasaEscalada) * 100n;
      await registrarMovimiento(
        cx, turno.id, usuario.sucursalId, 'VUELTAS', -1, monedaVuelto,
        montoMonedaASql(montoVueltoMoneda), tasaHoy.tasa, centavosASql(vueltoUsd),
        `Vueltas venta ${prefijo}${numero}`, usuario.id, null, 'VENTA', ventaId,
      );
      await restarVueltasCaja(cx, turno.id, monedaVuelto, montoVueltoMoneda);
    }

    // --- 11. Credito ----------------------------------------------------------
    if (creditoUsd > 0n) {
      await crearCredito(cx, {
        sucursalId: usuario.sucursalId,
        clienteId: entrada.clienteId!,
        ventaId,
        montoUsd: creditoUsd,
        tasa: tasaHoy.tasa,
        tasaEscalada,
        usuarioId: usuario.id,
      });
      await ejecutar(
        `UPDATE clientes SET saldo_actual = saldo_actual + ? WHERE id = ?`,
        [centavosASql(creditoUsd), entrada.clienteId ?? 0],
        cx,
      );
    }

    return {
      id: ventaId,
      numero: `${prefijo}${numero}`,
      total_usd: centavosASql(totalUsd),
      total_bs: bsASql(totalBs),
      tasa_cambio: tasaHoy.tasa,
      total_pagado_usd: centavosASql(pagadoUsd),
      total_credito_usd: centavosASql(creditoUsd),
      vuelto_usd: centavosASql(vueltoUsd),
      utilidad_total: centavosASql(utilidadTotal),
    };
  });
}

function tasaMilesimasASql(tasaMilesimas: bigint): string {
  const entero = tasaMilesimas / 1000n;
  const dec = (tasaMilesimas % 1000n).toString().padStart(3, '0');
  return `${entero}.${dec}`;
}

/** Entrega el siguiente numero de un consecutivo, con bloqueo. */
async function siguienteConsecutivo(
  cx: Ejecutor,
  sucursalId: number,
  tipo: string,
  anio: number,
): Promise<{ numero: number; prefijo: string }> {
  const fila = await queryOne<{ id: number; ultimo_numero: number; prefijo: string }>(
    `SELECT id, ultimo_numero, prefijo FROM consecutivos
      WHERE sucursal_id = ? AND tipo_documento = ? AND anio = ? LIMIT 1 FOR UPDATE`,
    [sucursalId, tipo, anio],
    cx,
  );
  if (!fila) {
    // Crea el consecutivo del anio si no existe.
    await insertar(
      `INSERT INTO consecutivos (sucursal_id, tipo_documento, anio, prefijo, ultimo_numero)
       VALUES (?, ?, ?, '', 1)`,
      [sucursalId, tipo, anio],
      cx,
    );
    return { numero: 1, prefijo: '' };
  }
  const nuevo = fila.ultimo_numero + 1;
  await ejecutar(`UPDATE consecutivos SET ultimo_numero = ? WHERE id = ?`, [nuevo, fila.id], cx);
  return { numero: nuevo, prefijo: fila.prefijo };
}

/** Bloquea cada producto, toma el snapshot de costo y calcula el renglon. */
async function calcularRenglones(
  cx: Ejecutor,
  entrada: VentaEntrada,
  sucursalId: number,
): Promise<RenglonCalculado[]> {
  // Prorrateo del descuento de documento sobre el bruto neto de cada renglon.
  const brutos: bigint[] = [];
  const filas: FilaProductoVenta[] = [];

  for (const r of entrada.renglones) {
    const fila = await queryOne<FilaProductoVenta>(
      `SELECT p.id, p.nombre, p.categoria_id, p.unidad_medida_id, p.impuesto_id,
              i.tasa AS impuesto_tasa, p.precio_venta, p.es_precio_incluye_impuesto,
              p.es_maneja_inventario, p.esta_activo,
              ps.cantidad, ps.costo_promedio
         FROM productos p
         JOIN impuestos i ON i.id = p.impuesto_id
         LEFT JOIN producto_stock ps ON ps.producto_id = p.id AND ps.sucursal_id = ?
        WHERE p.id = ? AND p.eliminado_en IS NULL
        LIMIT 1 FOR UPDATE OF p`,
      [sucursalId, r.productoId],
      cx,
    );
    if (!fila) throw new NoEncontrado('PRODUCTO_NO_ENCONTRADO');
    if (!fila.esta_activo) throw new ReglaNegocio('PRODUCTO_INACTIVO');
    filas.push(fila);

    const cantidad = aCantidad(r.cantidad);
    if (cantidad <= 0n) throw new ReglaNegocio('CANTIDAD_INVALIDA');
    const precioUnit = aUnitario(r.precioUnitario ?? fila.precio_venta);
    const descUnit = aUnitario(r.descuentoUnitario ?? '0');
    const brutoNeto =
      multiplicarPorCantidad(precioUnit, cantidad) - multiplicarPorCantidad(descUnit, cantidad);
    brutos.push(brutoNeto > 0n ? brutoNeto : 0n);
  }

  const descuentoDocumento = aCentavos(entrada.descuentoDocumento ?? '0');
  const prorrateos = prorratearDescuento(brutos, descuentoDocumento);

  return entrada.renglones.map((r, idx) => {
    const fila = filas[idx]!;
    const cantidad = aCantidad(r.cantidad);
    const precioUnit = aUnitario(r.precioUnitario ?? fila.precio_venta);
    let descUnit = aUnitario(r.descuentoUnitario ?? '0');

    // Suma el prorrateo del descuento de documento al descuento unitario.
    const prorrateoLinea = prorrateos[idx] ?? 0n;
    if (prorrateoLinea > 0n && cantidad > 0n) {
      // prorrateoLinea es escala 2; se pasa a unitario escala 4 dividiendo por cantidad(3).
      const prorrateoUnit = dividirRedondeando(prorrateoLinea * 10n ** 4n, cantidad * 10n);
      descUnit += prorrateoUnit;
    }

    // SNAPSHOT DE COSTO: costo promedio vigente en este instante.
    const costoUnit = aUnitario(fila.costo_promedio ?? '0');
    const tasaMilesimas = aTasa(fila.impuesto_tasa);
    const esIncluye = fila.es_precio_incluye_impuesto;

    const brutoLinea = multiplicarPorCantidad(precioUnit, cantidad); // escala 2
    const descLinea = multiplicarPorCantidad(descUnit, cantidad); // escala 2
    const netoLinea = brutoLinea - descLinea;

    let base: bigint;
    let impuesto: bigint;
    if (esIncluye) {
      const d = desagregarImpuesto(netoLinea > 0n ? netoLinea : 0n, tasaMilesimas);
      base = d.base;
      impuesto = d.impuesto;
    } else {
      base = netoLinea > 0n ? netoLinea : 0n;
      impuesto = agregarImpuesto(base, tasaMilesimas).impuesto;
    }
    const totalLinea = base + impuesto;
    const costoTotal = multiplicarPorCantidad(costoUnit, cantidad);
    const utilidadTotal = base - costoTotal; // utilidad sobre base sin impuesto

    return {
      productoId: fila.id,
      descripcion: fila.nombre,
      categoriaId: fila.categoria_id,
      unidadMedidaId: fila.unidad_medida_id,
      impuestoId: fila.impuesto_id,
      impuestoTasaMilesimas: tasaMilesimas,
      cantidad,
      precioVentaUnit: precioUnit,
      precioCompraUnit: costoUnit,
      descuentoUnit: descUnit,
      esPrecioIncluyeImpuesto: esIncluye,
      esManejaInventario: fila.es_maneja_inventario,
      base,
      impuesto,
      costoTotal,
      utilidadTotal,
      totalLinea,
    };
  });
}

/** Descuenta stock con FOR UPDATE (ya bloqueado) e inserta el movimiento SALIDA_VENTA. */
async function descontarStock(
  cx: Ejecutor,
  r: RenglonCalculado,
  ventaId: number,
  usuarioId: number,
  sucursalId: number,
): Promise<void> {
  const stock = await queryOne<{ cantidad: string; costo_promedio: string }>(
    `SELECT cantidad, costo_promedio FROM producto_stock
      WHERE producto_id = ? AND sucursal_id = ? LIMIT 1 FOR UPDATE`,
    [r.productoId, sucursalId],
    cx,
  );
  const saldoAnterior = aCantidad(stock?.cantidad ?? '0');
  if (saldoAnterior < r.cantidad) {
    // Se permite vender sin stock solo si la configuracion lo autoriza.
    const cfg = await queryOne<{ es_permite_stock_negativo: boolean }>(
      `SELECT es_permite_stock_negativo FROM configuracion WHERE id = 1`,
      [],
      cx,
    );
    if (!cfg || !cfg.es_permite_stock_negativo) {
      throw new Conflicto('STOCK_INSUFICIENTE');
    }
  }
  const saldoPosterior = saldoAnterior - r.cantidad;
  const costoProm = aUnitario(stock?.costo_promedio ?? '0');

  await ejecutar(
    `UPDATE producto_stock SET cantidad = ?, ultima_salida_en = NOW()
      WHERE producto_id = ? AND sucursal_id = ?`,
    [cantidadASql(saldoPosterior), r.productoId, sucursalId],
    cx,
  );

  await insertar(
    `INSERT INTO inventario_movimientos
      (sucursal_id, producto_id, tipo, signo, cantidad, costo_unitario, costo_total,
       saldo_anterior, saldo_posterior, costo_promedio_anterior, costo_promedio_posterior,
       documento_tipo, venta_id, usuario_id, nota)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      sucursalId, r.productoId, TIPO_MOVIMIENTO_INVENTARIO.SALIDA_VENTA,
      SIGNO_MOVIMIENTO_INVENTARIO.SALIDA_VENTA, cantidadASql(r.cantidad),
      unitarioASql(costoProm), centavosASql(r.costoTotal), cantidadASql(saldoAnterior),
      cantidadASql(saldoPosterior), unitarioASql(costoProm), unitarioASql(costoProm),
      DOCUMENTO_TIPO_MOVIMIENTO.VENTA, ventaId, usuarioId, 'Salida por venta',
    ],
    cx,
  );
}

interface PagoCalculado {
  metodoPagoId: number;
  moneda: 'USD' | 'VES';
  montoMoneda: bigint; // escala 4
  montoUsd: bigint; // escala 2
  referencia?: string;
  afectaCaja: boolean;
  esCredito: boolean;
}

/** Valida y calcula los pagos; separa lo pagado de lo que va a credito. */
async function calcularPagos(
  cx: Ejecutor,
  entrada: VentaEntrada,
  totalUsd: bigint,
  tasaEscalada: bigint,
): Promise<{ pagosCalculados: PagoCalculado[]; pagadoUsd: bigint; creditoUsd: bigint }> {
  const pagos: PagoCalculado[] = [];
  let pagadoUsd = 0n;
  let creditoDeclarado = 0n;

  for (const p of entrada.pagos) {
    const metodo = await queryOne<FilaMetodoPago>(
      `SELECT id, moneda, requiere_referencia, afecta_caja_efectivo, es_no_es_cobro, esta_activo
         FROM metodos_pago WHERE id = ? AND eliminado_en IS NULL LIMIT 1`,
      [p.metodoPagoId],
      cx,
    );
    if (!metodo || !metodo.esta_activo) throw new NoEncontrado('NO_ENCONTRADO');
    if (metodo.requiere_referencia && !p.referencia?.trim()) {
      throw new ReglaNegocio('REFERENCIA_REQUERIDA');
    }

    const montoMoneda = aMontoMonedaLocal(p.montoMoneda);
    if (montoMoneda <= 0n) throw new ReglaNegocio('MONTO_INVALIDO');
    const montoUsd = montoMonedaAUsd(montoMoneda, metodo.moneda, tasaEscalada);

    const esCredito = metodo.es_no_es_cobro;
    if (esCredito) creditoDeclarado += montoUsd;
    else pagadoUsd += montoUsd;

    pagos.push({
      metodoPagoId: metodo.id,
      moneda: metodo.moneda,
      montoMoneda,
      montoUsd,
      referencia: p.referencia?.trim(),
      afectaCaja: metodo.afecta_caja_efectivo,
      esCredito,
    });
  }

  // El credito es lo declarado explicitamente, o el faltante si los pagos no cubren.
  const faltante = totalUsd - pagadoUsd;
  const creditoUsd = creditoDeclarado > 0n ? creditoDeclarado : faltante > 0n ? faltante : 0n;

  // Si no hay credito y lo pagado no cubre el total: pago insuficiente.
  if (creditoUsd === 0n && pagadoUsd < totalUsd) {
    throw new ReglaNegocio('PAGO_INSUFICIENTE');
  }

  return { pagosCalculados: pagos.filter((p) => !p.esCredito), pagadoUsd, creditoUsd };
}

function aMontoMonedaLocal(v: string): bigint {
  return aUnitario(v); // escala 4 igual que MONTO_MONEDA
}

/** Valida que el cliente pueda recibir credito por `montoUsd` (escala 2). */
async function validarCredito(
  cx: Ejecutor,
  clienteId: number | null,
  montoUsd: bigint,
): Promise<void> {
  if (!clienteId || clienteId === 1) throw new ReglaNegocio('CLIENTE_GENERICO_SIN_CREDITO');
  const cliente = await queryOne<{
    es_permite_credito: boolean;
    esta_bloqueado: boolean;
    cupo_credito: string;
    saldo_actual: string;
  }>(
    `SELECT es_permite_credito, esta_bloqueado, cupo_credito, saldo_actual
       FROM clientes WHERE id = ? AND eliminado_en IS NULL LIMIT 1 FOR UPDATE`,
    [clienteId],
    cx,
  );
  if (!cliente) throw new NoEncontrado('CLIENTE_NO_ENCONTRADO');
  if (cliente.esta_bloqueado) throw new Conflicto('CLIENTE_BLOQUEADO');
  if (!cliente.es_permite_credito) throw new ReglaNegocio('CLIENTE_SIN_CREDITO');

  const cupo = aCentavos(cliente.cupo_credito);
  const saldo = aCentavos(cliente.saldo_actual);
  if (saldo + montoUsd > cupo) throw new Conflicto('CUPO_CREDITO_EXCEDIDO');
}

/** Crea el credito de cartera en USD. */
async function crearCredito(
  cx: Ejecutor,
  d: {
    sucursalId: number;
    clienteId: number;
    ventaId: number;
    montoUsd: bigint;
    tasa: string;
    tasaEscalada: bigint;
    usuarioId: number;
  },
): Promise<void> {
  const cliente = await queryOne<{ dias_plazo: number }>(
    `SELECT dias_plazo FROM clientes WHERE id = ?`,
    [d.clienteId],
    cx,
  );
  const dias = cliente?.dias_plazo ?? 30;
  const montoBs = usdABs(d.montoUsd, d.tasaEscalada);

  await insertar(
    `INSERT INTO creditos
      (sucursal_id, cliente_id, venta_id, origen, fecha_emision, fecha_vencimiento, dias_plazo,
       monto_original_usd, saldo_usd, tasa_cambio_origen, monto_original_bs_referencia,
       estado, usuario_id)
     VALUES (?, ?, ?, ?, CURRENT_DATE, CURRENT_DATE + (?::TEXT || ' days')::INTERVAL, ?, ?, ?, ?, ?, ?, ?)`,
    [
      d.sucursalId, d.clienteId, d.ventaId, ORIGEN_CREDITO.VENTA, dias, dias,
      centavosASql(d.montoUsd), centavosASql(d.montoUsd), d.tasa, bsASql(montoBs),
      ESTADO_CREDITO.PENDIENTE, d.usuarioId,
    ],
    cx,
  );
}

/** Suma un cobro de efectivo a los totales del turno. */
async function sumarACaja(
  cx: Ejecutor,
  turnoId: number,
  moneda: 'USD' | 'VES',
  montoMoneda: bigint,
  montoUsd: bigint,
  _tipo: 'venta' | 'abono',
): Promise<void> {
  if (moneda === MONEDA.USD) {
    await ejecutar(
      `UPDATE turnos_caja
          SET total_ventas_efectivo_usd = total_ventas_efectivo_usd + ?,
              esperado_usd = esperado_usd + ?
        WHERE id = ?`,
      [centavosASql(montoUsd), centavosASql(montoUsd), turnoId],
      cx,
    );
  } else {
    const montoBs = dividirRedondeando(montoMoneda, 100n); // escala 4 -> 2
    await ejecutar(
      `UPDATE turnos_caja
          SET total_ventas_efectivo_bs = total_ventas_efectivo_bs + ?,
              esperado_bs = esperado_bs + ?
        WHERE id = ?`,
      [bsASql(montoBs), bsASql(montoBs), turnoId],
      cx,
    );
  }
}

/** Resta las vueltas entregadas del efectivo esperado del turno. */
async function restarVueltasCaja(
  cx: Ejecutor,
  turnoId: number,
  moneda: 'USD' | 'VES',
  montoMoneda: bigint,
): Promise<void> {
  if (moneda === MONEDA.USD) {
    const usd = dividirRedondeando(montoMoneda, 100n);
    await ejecutar(
      `UPDATE turnos_caja SET total_vueltas_usd = total_vueltas_usd + ?, esperado_usd = esperado_usd - ? WHERE id = ?`,
      [centavosASql(usd), centavosASql(usd), turnoId],
      cx,
    );
  } else {
    const bs = dividirRedondeando(montoMoneda, 100n);
    await ejecutar(
      `UPDATE turnos_caja SET total_vueltas_bs = total_vueltas_bs + ?, esperado_bs = esperado_bs - ? WHERE id = ?`,
      [bsASql(bs), bsASql(bs), turnoId],
      cx,
    );
  }
}

export interface FiltrosVentas {
  desde?: string;
  hasta?: string;
  metodoPagoId?: number;
  estado?: string;
  desplazamiento: number;
  limite: number;
}

/** Historial de ventas paginado, con los metodos de pago usados y filtros. */
export async function listarVentas(
  sucursalId: number,
  filtros: FiltrosVentas,
): Promise<{ datos: unknown[]; total: number }> {
  const cond = ['v.sucursal_id = ?'];
  const params: (string | number)[] = [sucursalId];
  if (filtros.desde) { cond.push('v.fecha >= ?'); params.push(`${filtros.desde} 00:00:00`); }
  if (filtros.hasta) { cond.push('v.fecha <= ?'); params.push(`${filtros.hasta} 23:59:59`); }
  if (filtros.estado) { cond.push('v.estado = ?'); params.push(filtros.estado); }
  if (filtros.metodoPagoId) {
    cond.push('EXISTS (SELECT 1 FROM pagos pg WHERE pg.venta_id = v.id AND pg.metodo_pago_id = ?)');
    params.push(filtros.metodoPagoId);
  }
  const where = `WHERE ${cond.join(' AND ')}`;

  const datos = await query(
    `SELECT v.id, v.prefijo || v.numero AS numero, v.fecha, v.total_usd, v.total_bs,
            v.tasa_cambio, v.utilidad_total, v.estado, v.es_credito,
            COALESCE(c.nombre, 'CONSUMIDOR FINAL') AS cliente, u.nombre_completo AS cajero,
            (SELECT STRING_AGG(DISTINCT mp.nombre, ', ')
               FROM pagos pg JOIN metodos_pago mp ON mp.id = pg.metodo_pago_id
              WHERE pg.venta_id = v.id) AS metodos_pago
       FROM ventas v
       LEFT JOIN clientes c ON c.id = v.cliente_id
       JOIN usuarios u ON u.id = v.usuario_id
      ${where}
      ORDER BY v.id DESC LIMIT ? OFFSET ?`,
    [...params, filtros.limite, filtros.desplazamiento],
  );
  const total = await queryOne<{ n: number }>(
    `SELECT COUNT(*) AS n FROM ventas v ${where}`,
    params,
  );
  return { datos, total: total?.n ?? 0 };
}

/**
 * Anula una venta por reversion documental: reingresa el stock, anula el credito
 * si lo hubo y marca la venta como ANULADA. Nunca se edita ni se borra la venta.
 */
export async function anularVenta(
  ventaId: number,
  sucursalId: number,
  usuario: UsuarioAutenticado,
  motivo: string,
): Promise<void> {
  await withTransaction(async (cx) => {
    const venta = await queryOne<{ id: number; estado: string; es_credito: boolean; cliente_id: number | null; prefijo: string; numero: number }>(
      `SELECT id, estado, es_credito, cliente_id, prefijo, numero FROM ventas
        WHERE id = ? AND sucursal_id = ? LIMIT 1 FOR UPDATE`,
      [ventaId, sucursalId], cx,
    );
    if (!venta) throw new NoEncontrado('VENTA_NO_ENCONTRADA');
    if (venta.estado === ESTADO_VENTA.ANULADA) throw new Conflicto('VENTA_YA_ANULADA');

    // Reingresa el stock de cada renglon que maneja inventario.
    const renglones = await query<{ producto_id: number; cantidad: string; precio_compra_unitario: string }>(
      `SELECT vd.producto_id, vd.cantidad, vd.precio_compra_unitario
         FROM venta_detalle vd JOIN productos p ON p.id = vd.producto_id
        WHERE vd.venta_id = ? AND p.es_maneja_inventario = TRUE`,
      [ventaId], cx,
    );
    for (const r of renglones) {
      const cantidad = aCantidad(r.cantidad);
      const stock = await queryOne<{ cantidad: string; costo_promedio: string }>(
        `SELECT cantidad, costo_promedio FROM producto_stock WHERE producto_id = ? AND sucursal_id = ? FOR UPDATE`,
        [r.producto_id, sucursalId], cx,
      );
      const saldoAnterior = aCantidad(stock?.cantidad ?? '0');
      const saldoPosterior = saldoAnterior + cantidad;
      const cpp = aUnitario(stock?.costo_promedio ?? r.precio_compra_unitario);
      await ejecutar(
        `UPDATE producto_stock SET cantidad = ?, ultima_entrada_en = NOW() WHERE producto_id = ? AND sucursal_id = ?`,
        [cantidadASql(saldoPosterior), r.producto_id, sucursalId], cx,
      );
      await insertar(
        `INSERT INTO inventario_movimientos
          (sucursal_id, producto_id, tipo, signo, cantidad, costo_unitario, costo_total,
           saldo_anterior, saldo_posterior, costo_promedio_anterior, costo_promedio_posterior,
           documento_tipo, venta_id, usuario_id, nota)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          sucursalId, r.producto_id, TIPO_MOVIMIENTO_INVENTARIO.ANULACION_VENTA, 1,
          cantidadASql(cantidad), unitarioASql(cpp), centavosASql(multiplicarPorCantidad(cpp, cantidad)),
          cantidadASql(saldoAnterior), cantidadASql(saldoPosterior), unitarioASql(cpp), unitarioASql(cpp),
          DOCUMENTO_TIPO_MOVIMIENTO.VENTA, ventaId, usuario.id, `Anulacion venta ${venta.prefijo}${venta.numero}: ${motivo}`,
        ],
        cx,
      );
    }

    // Anula el credito y devuelve el cupo al cliente.
    if (venta.es_credito && venta.cliente_id) {
      const credito = await queryOne<{ id: number; saldo_usd: string }>(
        `SELECT id, saldo_usd FROM creditos WHERE venta_id = ? AND estado <> 'ANULADO' LIMIT 1 FOR UPDATE`,
        [ventaId], cx,
      );
      if (credito) {
        await ejecutar(
          `UPDATE clientes SET saldo_actual = GREATEST(0, saldo_actual - ?) WHERE id = ?`,
          [credito.saldo_usd, venta.cliente_id], cx,
        );
        await ejecutar(
          `UPDATE creditos SET estado = 'ANULADO', saldo_usd = 0, anulado_en = NOW(), anulado_por = ?, motivo_anulacion = ? WHERE id = ?`,
          [usuario.id, motivo, credito.id], cx,
        );
      }
    }

    await ejecutar(
      `UPDATE ventas SET estado = 'ANULADA', anulada_en = NOW(), anulada_por = ?, motivo_anulacion = ? WHERE id = ?`,
      [usuario.id, motivo, ventaId], cx,
    );
  });
}

/** Detalle completo de una venta (para ticket e historial). */
export async function detalleVenta(ventaId: number, sucursalId: number): Promise<unknown> {
  const venta = await queryOne(
    `SELECT v.*, COALESCE(c.nombre,'CONSUMIDOR FINAL') AS cliente_nombre,
            u.nombre_completo AS cajero
       FROM ventas v LEFT JOIN clientes c ON c.id = v.cliente_id
       JOIN usuarios u ON u.id = v.usuario_id
      WHERE v.id = ? AND v.sucursal_id = ? LIMIT 1`,
    [ventaId, sucursalId],
  );
  if (!venta) throw new NoEncontrado('VENTA_NO_ENCONTRADA');
  const renglones = await query(
    `SELECT * FROM venta_detalle WHERE venta_id = ? ORDER BY linea`,
    [ventaId],
  );
  const pagos = await query(
    `SELECT pg.*, mp.nombre AS metodo_nombre FROM pagos pg
       JOIN metodos_pago mp ON mp.id = pg.metodo_pago_id
      WHERE pg.venta_id = ?`,
    [ventaId],
  );
  return { venta, renglones, pagos };
}
