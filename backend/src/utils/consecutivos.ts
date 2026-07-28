/**
 * Numeracion de documentos (V-1, C-1, A-1...).
 *
 * El contador vive en `consecutivos`, pero la VERDAD es el indice unico de cada
 * documento —uq_ventas_numero, uq_compras_numero, uq_abonos_numero— sobre
 * (sucursal, anio, prefijo, numero).
 *
 * Si los dos se desincronizan (se reinicio el contador a 0 con documentos ya
 * cargados, se restauro un backup parcial, se cargo data de prueba), el INSERT
 * choca con el indice y al cajero le sale "Ya existe un registro con esos datos"
 * sin poder avanzar nunca: el contador vuelve a proponer el mismo numero ocupado.
 *
 * Por eso el siguiente numero se toma del MAYOR entre el contador y el numero mas
 * alto realmente usado. Asi el sistema se autorepara solo en el siguiente intento
 * en vez de quedarse trancado.
 *
 * El SELECT ... FOR UPDATE sobre la fila del contador serializa a los cajeros
 * concurrentes: el segundo espera al primero y lee el valor ya actualizado.
 */
import { queryOne, ejecutar, insertar, type Ejecutor } from '../database/pool';
import { TIPO_DOCUMENTO } from '../config/constantes';

/** Tabla donde vive el numero de cada tipo de documento, y su prefijo por defecto. */
const DOCUMENTO: Record<string, { tabla: string; prefijo: string }> = {
  [TIPO_DOCUMENTO.VENTA]: { tabla: 'ventas', prefijo: '' },
  [TIPO_DOCUMENTO.COMPRA]: { tabla: 'compras', prefijo: 'C-' },
  [TIPO_DOCUMENTO.ABONO]: { tabla: 'abonos', prefijo: 'A-' },
  [TIPO_DOCUMENTO.DEVOLUCION_VENTA]: { tabla: 'devoluciones', prefijo: 'DV-' },
  [TIPO_DOCUMENTO.DEVOLUCION_COMPRA]: { tabla: 'devoluciones', prefijo: 'DC-' },
  [TIPO_DOCUMENTO.AJUSTE]: { tabla: 'ajustes_inventario', prefijo: 'AJ-' },
};

/** Numero mas alto ya usado por ese documento (0 si no hay ninguno). */
async function numeroMasAlto(
  cx: Ejecutor, tabla: string, sucursalId: number, anio: number, prefijo: string,
): Promise<number> {
  // `tabla` sale del mapa de arriba, nunca de la entrada del usuario.
  const fila = await queryOne<{ maximo: string | number | null }>(
    `SELECT MAX(numero) AS maximo FROM ${tabla}
      WHERE sucursal_id = ? AND anio = ? AND prefijo = ?`,
    [sucursalId, anio, prefijo], cx,
  );
  // pg devuelve BIGINT como string: sin Number(), "1" + 1 concatenaria ("11").
  return Number(fila?.maximo ?? 0);
}

/**
 * Entrega el siguiente numero libre del consecutivo, con bloqueo.
 * Devuelve tambien el prefijo para componer el numero visible (`${prefijo}${numero}`).
 */
export async function siguienteConsecutivo(
  cx: Ejecutor, sucursalId: number, tipo: string, anio: number,
): Promise<{ numero: number; prefijo: string }> {
  const doc = DOCUMENTO[tipo];

  const fila = await queryOne<{ id: number; ultimo_numero: number; prefijo: string }>(
    `SELECT id, ultimo_numero, prefijo FROM consecutivos
      WHERE sucursal_id = ? AND tipo_documento = ? AND anio = ? LIMIT 1 FOR UPDATE`,
    [sucursalId, tipo, anio], cx,
  );

  const prefijo = fila?.prefijo ?? doc?.prefijo ?? '';
  const usado = doc ? await numeroMasAlto(cx, doc.tabla, sucursalId, anio, prefijo) : 0;

  if (!fila) {
    const numero = usado + 1;
    await insertar(
      `INSERT INTO consecutivos (sucursal_id, tipo_documento, anio, prefijo, ultimo_numero)
       VALUES (?, ?, ?, ?, ?)`,
      [sucursalId, tipo, anio, prefijo, numero], cx,
    );
    return { numero, prefijo };
  }

  const numero = Math.max(Number(fila.ultimo_numero), usado) + 1;
  await ejecutar(`UPDATE consecutivos SET ultimo_numero = ? WHERE id = ?`, [numero, fila.id], cx);
  return { numero, prefijo };
}
