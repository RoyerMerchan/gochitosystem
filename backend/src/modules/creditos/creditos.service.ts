/**
 * Creditos y abonos. La deuda vive en USD. Un abono se recibe en la moneda que
 * pague el cliente, con la tasa del DIA DEL ABONO, se convierte a USD y se aplica
 * a las facturas pendientes en orden FIFO (las mas antiguas primero).
 */
import { Conflicto, NoEncontrado, ReglaNegocio } from '../../errores/AppError';
import {
  query, queryOne, ejecutar, insertar, withTransaction, type Ejecutor,
} from '../../database/pool';
import { existeColumna } from '../../database/esquema';
import { aCentavos, centavosASql, dividirRedondeando } from '../../utils/dinero';
import {
  aTasaCambio, montoMonedaAUsdPiso, aMontoMoneda, montoMonedaASql, usdAMontoMoneda,
} from '../../utils/moneda';
import { siguienteConsecutivo } from '../../utils/consecutivos';
import { ESTADO_CREDITO, TIPO_DOCUMENTO } from '../../config/constantes';
import { registrarMovimiento, turnoActivoDeUsuario } from '../caja/caja.service';
import type { Id, UsuarioAutenticado } from '../../tipos/comunes';

/**
 * Cartera: una fila por PERSONA, con su deuda total.
 *
 * El total sale de sumar TODOS sus creditos vivos (`creditos.saldo_usd`), no de
 * `clientes.saldo_actual`: ese es un espejo desnormalizado que se actualiza con
 * GREATEST(0, ...), y si alguna vez se desincroniza el cliente aparece debiendo
 * de menos —o desaparece de la cartera con facturas todavia sin cobrar—.
 * Sumando los creditos, el total de la persona y sus tramos de mora siempre
 * cuadran entre si, porque salen de las mismas filas.
 */
export async function listarCartera(): Promise<unknown[]> {
  return query(
    `SELECT c.id AS cliente_id, c.nombre, c.documento, c.cupo_credito,
            SUM(cr.saldo_usd) AS saldo_usd,
            COUNT(*) AS documentos,
            COALESCE(SUM(CASE WHEN (CURRENT_DATE - cr.fecha_vencimiento) <= 0 THEN cr.saldo_usd ELSE 0 END),0) AS por_vencer,
            COALESCE(SUM(CASE WHEN (CURRENT_DATE - cr.fecha_vencimiento) BETWEEN 1 AND 30 THEN cr.saldo_usd ELSE 0 END),0) AS d1_30,
            COALESCE(SUM(CASE WHEN (CURRENT_DATE - cr.fecha_vencimiento) BETWEEN 31 AND 60 THEN cr.saldo_usd ELSE 0 END),0) AS d31_60,
            COALESCE(SUM(CASE WHEN (CURRENT_DATE - cr.fecha_vencimiento) BETWEEN 61 AND 90 THEN cr.saldo_usd ELSE 0 END),0) AS d61_90,
            COALESCE(SUM(CASE WHEN (CURRENT_DATE - cr.fecha_vencimiento) > 90 THEN cr.saldo_usd ELSE 0 END),0) AS d90_mas
       FROM clientes c
       JOIN creditos cr ON cr.cliente_id = c.id
        AND cr.estado IN ('PENDIENTE','PARCIAL','VENCIDO') AND cr.saldo_usd > 0
      WHERE c.eliminado_en IS NULL
      GROUP BY c.id, c.nombre, c.documento, c.cupo_credito
      ORDER BY SUM(cr.saldo_usd) DESC`,
  );
}

/**
 * Estado de cuenta de un cliente: su deuda total consolidada, las facturas que
 * la componen y el historial de abonos. `resumen` es la cuenta unica de la
 * persona: lo que hay que cobrarle sumando todos sus creditos.
 */
export async function estadoCuenta(clienteId: Id): Promise<unknown> {
  const cliente = await queryOne(
    `SELECT id, nombre, documento, saldo_actual, cupo_credito FROM clientes WHERE id = ? AND eliminado_en IS NULL`,
    [clienteId],
  );
  if (!cliente) throw new NoEncontrado('CLIENTE_NO_ENCONTRADO');

  const resumen = await queryOne(
    `SELECT COALESCE(SUM(saldo_usd), 0) AS deuda_usd,
            COUNT(*) AS documentos,
            COALESCE(SUM(saldo_usd) FILTER (WHERE fecha_vencimiento < CURRENT_DATE), 0) AS vencido_usd,
            COUNT(*) FILTER (WHERE fecha_vencimiento < CURRENT_DATE) AS documentos_vencidos,
            MIN(fecha_emision) AS deuda_desde
       FROM creditos
      WHERE cliente_id = ? AND estado IN ('PENDIENTE','PARCIAL','VENCIDO') AND saldo_usd > 0`,
    [clienteId],
  );

  const creditos = await query(
    `SELECT cr.id, cr.venta_id, v.prefijo || v.numero AS documento, cr.fecha_emision, cr.fecha_vencimiento,
            cr.monto_original_usd, cr.saldo_usd, cr.estado, (CURRENT_DATE - cr.fecha_vencimiento) AS dias_mora
       FROM creditos cr LEFT JOIN ventas v ON v.id = cr.venta_id
      WHERE cr.cliente_id = ? AND cr.estado <> 'ANULADO'
      ORDER BY cr.fecha_emision`,
    [clienteId],
  );

  /*
    Las columnas del vuelto se leen a traves de to_jsonb a proposito.

    Son un dato secundario del historial, pero nombrarlas directo hace que TODA la
    consulta reviente si la migracion que las agrega todavia no corrio en esta base
    —y el migrador se traga los fallos, asi que eso pasa sin que nadie se entere—.
    Cuando eso ocurria, el cajero abria el abono y veia la cuenta en blanco: sin
    facturas que marcar y sin poder cobrar, por una columna de adorno.

    Con to_jsonb, si la columna no existe llega null y el estado de cuenta —que es
    lo que se necesita para cobrar— sigue en pie.
  */
  const abonos = await query(
    `SELECT a.id, a.prefijo || a.numero AS numero, a.fecha, a.moneda, a.monto_moneda,
            a.tasa_aplicada, a.monto_usd, a.estado,
            (to_jsonb(a) ->> 'cambio_moneda')::NUMERIC AS cambio_moneda,
            COALESCE(to_jsonb(a) ->> 'cambio_moneda_codigo', a.moneda::TEXT) AS cambio_moneda_codigo
       FROM abonos a WHERE a.cliente_id = ? ORDER BY a.fecha DESC LIMIT 50`,
    [clienteId],
  );

  // Que se llevo en cada compra que todavia debe. Va en el estado de cuenta para
  // que el cliente vea el detalle sin tener que abrir factura por factura (y sin
  // pedir permiso de ventas, que es de otro modulo).
  const renglones = await query(
    `SELECT cr.id AS credito_id, vd.linea, vd.descripcion, vd.cantidad,
            vd.precio_venta_unitario, vd.total_linea
       FROM creditos cr
       JOIN venta_detalle vd ON vd.venta_id = cr.venta_id
      WHERE cr.cliente_id = ? AND cr.estado IN ('PENDIENTE','PARCIAL','VENCIDO') AND cr.saldo_usd > 0
      ORDER BY cr.fecha_emision, cr.id, vd.linea`,
    [clienteId],
  );

  return { cliente, resumen, creditos, renglones, abonos };
}

export interface AbonoEntrada {
  clienteId: Id;
  metodoPagoId: Id;
  moneda: 'USD' | 'VES';
  /** Lo que se ABONA a la deuda. Es la plata que se queda en la gaveta. */
  montoMoneda: string;
  /**
   * Lo que el cliente ENTREGO. Si supera `montoMoneda`, la diferencia es el vuelto
   * que se le devuelve: debe 9,50, da un billete de 10 y se lleva 0,50.
   * Ausente = pago justo, sin vuelto (comportamiento historico).
   */
  montoRecibidoMoneda?: string;
  /**
   * Moneda en la que se le entrega el vuelto. Ausente = la misma del abono.
   *
   * Paga con 4.000 Bs y se le devuelve en dolares porque no hay billetes chicos de
   * Bs: la plata que entra y la que sale son de gavetas distintas y el arqueo las
   * cuadra por separado.
   */
  monedaVuelto?: 'USD' | 'VES';
  /**
   * Facturas a las que se aplica el abono (las que el cliente marco como "pago esto").
   * Vacio o ausente = toda la deuda, FIFO.
   */
  creditoIds?: Id[];
  referencia?: string;
  observaciones?: string;
}

/**
 * Tolerancia de cierre: 1 centavo de USD.
 *
 * Pagando en Bs la division por la tasa casi nunca cae exacta sobre el saldo en USD
 * (3.132,00 Bs / 743 = 4,2153...). Sin tolerancia el cliente que quiere quedar en cero
 * o recibe "el abono supera el saldo" por un centavo, o queda con una deuda fantasma de
 * 0,01 imposible de pagar. Si el abono cae a un centavo del saldo objetivo se toma como
 * pago exacto de ese saldo.
 */
const TOLERANCIA_CIERRE = 1n;

/** Registra un abono y lo aplica FIFO a los creditos pendientes del cliente. */
export async function registrarAbono(
  entrada: AbonoEntrada,
  usuario: UsuarioAutenticado,
  idempotencyKey: string | null,
): Promise<{
  id: Id; numero: string; moneda: string; monto_usd: string; aplicado_usd: string;
  recibido_moneda: string; vuelto_moneda: string; vuelto_moneda_codigo: string;
  vuelto_usd: string; saldo_restante: string;
}> {
  return withTransaction(async (cx) => {
    // Tasa del dia del abono.
    const tasaFila = await queryOne<{ tasa: string }>(
      `SELECT tasa FROM tasas_cambio WHERE fecha = CURRENT_DATE AND eliminado_en IS NULL LIMIT 1`, [], cx,
    );
    if (!tasaFila) throw new ReglaNegocio('SIN_TASA_DEL_DIA');
    const tasaEsc = aTasaCambio(tasaFila.tasa);

    // Metodo de pago (para referencia y caja).
    const metodo = await queryOne<{
      moneda: string; requiere_referencia: boolean;
      afecta_caja_efectivo: boolean; es_permite_cambio: boolean;
    }>(
      `SELECT moneda, requiere_referencia, afecta_caja_efectivo, es_permite_cambio
         FROM metodos_pago WHERE id = ? AND eliminado_en IS NULL`,
      [entrada.metodoPagoId], cx,
    );
    if (!metodo) throw new NoEncontrado('NO_ENCONTRADO');
    if (metodo.requiere_referencia && !entrada.referencia?.trim()) throw new ReglaNegocio('REFERENCIA_REQUERIDA');

    const montoMonedaEsc = aMontoMoneda(entrada.montoMoneda);
    // Piso, no half-up: jamas se acreditan mas dolares de los que cubren los Bs recibidos.
    let montoUsd = montoMonedaAUsdPiso(montoMonedaEsc, entrada.moneda, tasaEsc);
    if (montoUsd <= 0n) throw new ReglaNegocio('MONTO_INVALIDO');

    // El billete que el cliente puso sobre el mostrador. Lo que sobre despues de
    // abonar es su vuelto.
    const montoRecibidoEsc = entrada.montoRecibidoMoneda !== undefined
      ? aMontoMoneda(entrada.montoRecibidoMoneda)
      : montoMonedaEsc;
    if (montoRecibidoEsc < montoMonedaEsc) throw new ReglaNegocio('RECIBIDO_MENOR_AL_ABONO');
    const cambioMonedaEsc = montoRecibidoEsc - montoMonedaEsc;
    // El vuelto sale de la gaveta. Por Pago Movil o Zelle entra el monto exacto y no
    // hay de donde devolver: mejor frenar aqui que inventar un egreso de efectivo
    // que nadie hizo y descuadrar el arqueo.
    if (cambioMonedaEsc > 0n && !metodo.es_permite_cambio) {
      throw new ReglaNegocio('VUELTO_SOLO_EN_EFECTIVO');
    }
    // Se valora con la misma tasa y el mismo piso que el abono, para que
    // (abono + vuelto) sea exactamente lo que entro por la gaveta.
    const cambioUsd = cambioMonedaEsc > 0n
      ? montoMonedaAUsdPiso(cambioMonedaEsc, entrada.moneda, tasaEsc)
      : 0n;

    /**
     * En que moneda sale el vuelto de la gaveta.
     *
     * Casi siempre es la del cobro, pero el cajero puede no tener billetes chicos:
     * el cliente paga con 4.000 Bs y se le devuelve el vuelto en dolares. La plata
     * que entra y la que sale son de gavetas distintas y el arqueo las cuadra por
     * separado, asi que hay que guardar en cual salio.
     *
     * Si el sobrante no llega a un centavo de dolar no hay forma de devolverlo en
     * la otra moneda (seria entregar $ 0,00): se devuelve en la del cobro, que es
     * lo unico que cuadra la gaveta al centimo.
     */
    const monedaVuelto: 'USD' | 'VES' =
      cambioMonedaEsc > 0n && cambioUsd > 0n
        ? (entrada.monedaVuelto ?? entrada.moneda)
        : entrada.moneda;
    /** Lo que el cajero saca de la gaveta, en la moneda del vuelto (escala 4). */
    const vueltoEntregadoEsc = cambioMonedaEsc === 0n
      ? 0n
      : monedaVuelto === entrada.moneda
        ? cambioMonedaEsc
        : usdAMontoMoneda(cambioUsd, monedaVuelto, tasaEsc);

    // Cliente y su saldo (bloqueado).
    const cliente = await queryOne<{ saldo_actual: string; dias_plazo: number }>(
      `SELECT saldo_actual, dias_plazo FROM clientes WHERE id = ? AND eliminado_en IS NULL FOR UPDATE`,
      [entrada.clienteId], cx,
    );
    if (!cliente) throw new NoEncontrado('CLIENTE_NO_ENCONTRADO');

    // Facturas objetivo: las marcadas por el usuario, o toda la deuda en FIFO.
    const seleccion = [...new Set((entrada.creditoIds ?? []).map(Number).filter((n) => n > 0))];
    const creditos = await creditosObjetivo(cx, entrada.clienteId, seleccion);
    if (creditos.length === 0) throw new ReglaNegocio('CREDITO_YA_PAGADO');

    const saldoObjetivo = creditos.reduce((acc, cr) => acc + aCentavos(cr.saldo_usd), 0n);
    if (montoUsd > saldoObjetivo) {
      if (montoUsd - saldoObjetivo > TOLERANCIA_CIERRE) throw new ReglaNegocio('ABONO_MAYOR_A_SALDO');
      montoUsd = saldoObjetivo; // diferencia de redondeo de la tasa: se toma como pago exacto
    } else if (saldoObjetivo - montoUsd <= TOLERANCIA_CIERRE) {
      montoUsd = saldoObjetivo; // cierra la factura en vez de dejar 0,01 de deuda fantasma
    }

    // Turno de caja (para el movimiento de efectivo).
    const turno = await turnoActivoDeUsuario(usuario.id, usuario.sucursalId);
    if (!turno && metodo.afecta_caja_efectivo) throw new Conflicto('CAJA_NO_ABIERTA');

    const anio = new Date().getFullYear();
    const { numero, prefijo } = await siguienteConsecutivo(cx, usuario.sucursalId, TIPO_DOCUMENTO.ABONO, anio);

    /*
      Si la base todavia no tiene `cambio_moneda_codigo` (migracion 0006 sin
      aplicar), el cobro se registra igual: lo unico que no se puede es devolver el
      vuelto en una moneda distinta a la del cobro, porque no habria donde anotarlo
      y el arqueo terminaria descontandolo de la gaveta equivocada.
    */
    const guardaMonedaVuelto = await existeColumna('abonos', 'cambio_moneda_codigo', cx);
    if (!guardaMonedaVuelto && monedaVuelto !== entrada.moneda) {
      throw new Conflicto('MIGRACION_PENDIENTE');
    }
    const colVuelto = guardaMonedaVuelto ? ', cambio_moneda_codigo' : '';
    const valVuelto = guardaMonedaVuelto ? ', ?' : '';

    const abonoId = await insertar(
      `INSERT INTO abonos
        (sucursal_id, cliente_id, turno_caja_id, metodo_pago_id, usuario_id, prefijo, numero, anio,
         moneda, monto_moneda, tasa_aplicada, monto_usd, monto_aplicado_usd,
         monto_recibido_moneda, cambio_moneda, referencia, observaciones,
         estado, clave_idempotencia${colVuelto})
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'APLICADO', ?${valVuelto})`,
      [
        usuario.sucursalId, entrada.clienteId, turno?.id ?? 1, entrada.metodoPagoId, usuario.id,
        prefijo, numero, anio, entrada.moneda, montoMonedaASql(montoMonedaEsc), tasaFila.tasa,
        centavosASql(montoUsd), centavosASql(montoUsd),
        montoMonedaASql(montoRecibidoEsc), montoMonedaASql(vueltoEntregadoEsc),
        entrada.referencia ?? null, entrada.observaciones ?? null, idempotencyKey,
        ...(guardaMonedaVuelto ? [cambioMonedaEsc > 0n ? monedaVuelto : null] : []),
      ],
      cx,
    );

    // Aplicacion FIFO sobre las facturas objetivo (mas antiguas primero).
    let restante = montoUsd;
    for (const cr of creditos) {
      if (restante <= 0n) break;
      const saldoCred = aCentavos(cr.saldo_usd);
      const aplicar = restante >= saldoCred ? saldoCred : restante;
      const saldoNuevo = saldoCred - aplicar;

      await insertar(
        `INSERT INTO abono_aplicaciones (abono_id, credito_id, monto_aplicado_usd)
         VALUES (?, ?, ?)`,
        [abonoId, cr.id, centavosASql(aplicar)], cx,
      );

      const nuevoEstado = saldoNuevo <= 0n ? ESTADO_CREDITO.PAGADO : ESTADO_CREDITO.PARCIAL;
      await ejecutar(
        `UPDATE creditos SET saldo_usd = ?, estado = ?, pagado_en = ? WHERE id = ?`,
        [centavosASql(saldoNuevo), nuevoEstado, saldoNuevo <= 0n ? new Date().toISOString().slice(0, 19).replace('T', ' ') : null, cr.id],
        cx,
      );
      restante -= aplicar;
    }

    // Baja el saldo del cliente por lo efectivamente aplicado.
    const aplicado = montoUsd - restante;
    await ejecutar(
      `UPDATE clientes SET saldo_actual = GREATEST(0, saldo_actual - ?) WHERE id = ?`,
      [centavosASql(aplicado), entrada.clienteId], cx,
    );
    // Si sobro (pago de mas), queda como saldo a favor.
    if (restante > 0n) {
      await ejecutar(`UPDATE abonos SET saldo_a_favor_usd = ?, monto_aplicado_usd = ? WHERE id = ?`,
        [centavosASql(restante), centavosASql(aplicado), abonoId], cx);
    }

    // Movimiento de caja si el abono fue en efectivo.
    //
    // Por la gaveta entra el BILLETE COMPLETO y el vuelto sale despues como su
    // propio movimiento, igual que en una venta (pos.service, paso 10). Registrar
    // el neto seria mas corto pero mentiria: el arqueo debe reflejar los dos gestos
    // reales del cajero, no un numero que no coincide con ningun billete.
    if (turno && metodo.afecta_caja_efectivo) {
      const recibidoUsd = montoUsd + cambioUsd;
      await registrarMovimiento(
        cx, turno.id, usuario.sucursalId, 'ABONO', 1, entrada.moneda,
        montoMonedaASql(montoRecibidoEsc), tasaFila.tasa, centavosASql(recibidoUsd),
        `Abono ${prefijo}${numero}`, usuario.id, entrada.metodoPagoId, 'ABONO', abonoId,
      );
      if (entrada.moneda === 'USD') {
        await ejecutar(`UPDATE turnos_caja SET total_abonos_efectivo_usd = total_abonos_efectivo_usd + ?, esperado_usd = esperado_usd + ? WHERE id = ?`,
          [centavosASql(recibidoUsd), centavosASql(recibidoUsd), turno.id], cx);
      } else {
        const bs = dividirRedondeando(montoRecibidoEsc, 100n);
        await ejecutar(`UPDATE turnos_caja SET total_abonos_efectivo_bs = total_abonos_efectivo_bs + ?, esperado_bs = esperado_bs + ? WHERE id = ?`,
          [centavosASql(bs), centavosASql(bs), turno.id], cx);
      }

      // Vuelto: sale de la gaveta y baja lo esperado al cierre. Se descuenta de la
      // moneda en la que se entrego de verdad, que puede no ser la del cobro.
      if (vueltoEntregadoEsc > 0n) {
        await registrarMovimiento(
          cx, turno.id, usuario.sucursalId, 'VUELTAS', -1, monedaVuelto,
          montoMonedaASql(vueltoEntregadoEsc), tasaFila.tasa, centavosASql(cambioUsd),
          `Vuelto abono ${prefijo}${numero}`, usuario.id, entrada.metodoPagoId, 'ABONO', abonoId,
        );
        if (monedaVuelto === 'USD') {
          await ejecutar(`UPDATE turnos_caja SET total_vueltas_usd = total_vueltas_usd + ?, esperado_usd = esperado_usd - ? WHERE id = ?`,
            [centavosASql(cambioUsd), centavosASql(cambioUsd), turno.id], cx);
        } else {
          const bsVuelto = dividirRedondeando(vueltoEntregadoEsc, 100n);
          await ejecutar(`UPDATE turnos_caja SET total_vueltas_bs = total_vueltas_bs + ?, esperado_bs = esperado_bs - ? WHERE id = ?`,
            [centavosASql(bsVuelto), centavosASql(bsVuelto), turno.id], cx);
        }
      }
    }

    // Lo que le queda debiendo a la persona: la suma de sus creditos vivos, no el
    // espejo de clientes.saldo_actual.
    const saldoRestante = await queryOne<{ deuda_usd: string }>(
      `SELECT COALESCE(SUM(saldo_usd), 0) AS deuda_usd FROM creditos
        WHERE cliente_id = ? AND estado IN ('PENDIENTE','PARCIAL','VENCIDO') AND saldo_usd > 0`,
      [entrada.clienteId], cx,
    );
    return {
      id: abonoId, numero: `${prefijo}${numero}`, moneda: entrada.moneda,
      monto_usd: centavosASql(montoUsd), aplicado_usd: centavosASql(aplicado),
      recibido_moneda: montoMonedaASql(montoRecibidoEsc),
      vuelto_moneda: montoMonedaASql(vueltoEntregadoEsc),
      vuelto_moneda_codigo: monedaVuelto,
      vuelto_usd: centavosASql(cambioUsd),
      saldo_restante: saldoRestante?.deuda_usd ?? '0',
    };
  });
}

/**
 * Creditos vivos a los que se aplicara el abono, bloqueados y en orden FIFO.
 * Con `ids` se restringe a las facturas que el usuario marco; sin ids, toda la deuda.
 */
async function creditosObjetivo(
  cx: Ejecutor, clienteId: Id, ids: number[],
): Promise<Array<{ id: number; saldo_usd: string }>> {
  const base = `SELECT id, saldo_usd FROM creditos
                 WHERE cliente_id = ? AND estado IN ('PENDIENTE','PARCIAL','VENCIDO')
                   AND saldo_usd > 0`;
  const orden = 'ORDER BY fecha_emision, id FOR UPDATE';

  if (ids.length === 0) {
    return query(`${base} ${orden}`, [clienteId], cx);
  }
  const marcas = ids.map(() => '?').join(',');
  const filas = await query<{ id: number; saldo_usd: string }>(
    `${base} AND id IN (${marcas}) ${orden}`, [clienteId, ...ids], cx,
  );
  // Una factura marcada que ya no esta pendiente (o no es de este cliente) es un
  // dato viejo en pantalla: mejor fallar que cobrar sobre otra cosa.
  if (filas.length !== ids.length) throw new NoEncontrado('CREDITO_NO_ENCONTRADO');
  return filas;
}

