/** Clientes. Cupo y saldo en USD (la deuda no se licua con la devaluacion). */
import { Conflicto, NoEncontrado } from '../../errores/AppError';
import { query, queryOne, ejecutar, insertar } from '../../database/pool';
import type { Id } from '../../tipos/comunes';

export interface ClienteFila {
  id: number;
  tipo_documento: string;
  documento: string | null;
  nombre: string;
  telefono: string | null;
  email: string | null;
  direccion: string | null;
  cupo_credito: string;
  dias_plazo: number;
  /** Espejo desnormalizado. Para mostrar deuda usa `deuda_usd`. */
  saldo_actual: string;
  /** Deuda real de la persona: suma de TODOS sus creditos vivos. */
  deuda_usd: string;
  /** Cuantas facturas componen esa deuda (COUNT llega como texto desde pg). */
  documentos_deuda: string;
  es_permite_credito: boolean;
  esta_bloqueado: boolean;
  esta_activo: boolean;
}

/**
 * Deuda de la persona = suma de sus creditos vivos. Es la fuente de verdad;
 * `clientes.saldo_actual` es solo un acumulado desnormalizado que puede quedar
 * corto (se baja con GREATEST(0, ...)).
 *
 * Va como LATERAL y no como dos subconsultas en el SELECT: asi el total y el
 * conteo salen del mismo recorrido de creditos, no de dos.
 */
const DEUDA_VIVA = `
  LEFT JOIN LATERAL (
    SELECT COALESCE(SUM(cr.saldo_usd), 0) AS deuda_usd, COUNT(*) AS documentos_deuda
      FROM creditos cr
     WHERE cr.cliente_id = c.id
       AND cr.estado IN ('PENDIENTE','PARCIAL','VENCIDO') AND cr.saldo_usd > 0
  ) d ON TRUE`;

/** Filtro "tiene deuda", sobre los creditos y no sobre el espejo. */
const TIENE_DEUDA = `EXISTS (SELECT 1 FROM creditos cr
                              WHERE cr.cliente_id = c.id
                                AND cr.estado IN ('PENDIENTE','PARCIAL','VENCIDO') AND cr.saldo_usd > 0)`;

export interface EntradaCliente {
  tipoDocumento?: string;
  documento?: string | null;
  nombre: string;
  telefono?: string | null;
  email?: string | null;
  direccion?: string | null;
  cupoCredito?: string;
  diasPlazo?: number;
  esPermiteCredito?: boolean;
  notas?: string | null;
}

export async function listar(
  filtros: { busqueda?: string; conDeuda?: boolean; desplazamiento: number; limite: number },
): Promise<{ datos: ClienteFila[]; total: number }> {
  const cond = ['c.eliminado_en IS NULL'];
  const params: (string | number)[] = [];
  if (filtros.busqueda) {
    cond.push('(c.nombre ILIKE ? OR c.documento ILIKE ?)');
    const like = `%${filtros.busqueda}%`;
    params.push(like, like);
  }
  if (filtros.conDeuda) cond.push(TIENE_DEUDA);
  const where = `WHERE ${cond.join(' AND ')}`;

  const datos = await query<ClienteFila>(
    `SELECT c.id, c.tipo_documento, c.documento, c.nombre, c.telefono, c.email, c.direccion,
            c.cupo_credito, c.dias_plazo, c.saldo_actual, c.es_permite_credito, c.esta_bloqueado, c.esta_activo,
            d.deuda_usd, d.documentos_deuda
       FROM clientes c ${DEUDA_VIVA} ${where} ORDER BY c.nombre LIMIT ? OFFSET ?`,
    [...params, filtros.limite, filtros.desplazamiento],
  );
  const total = await queryOne<{ n: number }>(`SELECT COUNT(*) AS n FROM clientes c ${where}`, params);
  return { datos, total: total?.n ?? 0 };
}

export async function obtener(id: Id): Promise<ClienteFila> {
  const c = await queryOne<ClienteFila>(
    `SELECT c.id, c.tipo_documento, c.documento, c.nombre, c.telefono, c.email, c.direccion,
            c.cupo_credito, c.dias_plazo, c.saldo_actual, c.es_permite_credito, c.esta_bloqueado, c.esta_activo,
            d.deuda_usd, d.documentos_deuda
       FROM clientes c ${DEUDA_VIVA} WHERE c.id = ? AND c.eliminado_en IS NULL LIMIT 1`,
    [id],
  );
  if (!c) throw new NoEncontrado('CLIENTE_NO_ENCONTRADO');
  return c;
}

export async function crear(e: EntradaCliente): Promise<ClienteFila> {
  const id = await insertar(
    `INSERT INTO clientes
      (tipo_documento, documento, nombre, telefono, email, direccion, cupo_credito,
       dias_plazo, es_permite_credito, notas)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      e.tipoDocumento ?? 'CC', e.documento ?? null, e.nombre, e.telefono ?? null,
      e.email ?? null, e.direccion ?? null, e.cupoCredito ?? '0', e.diasPlazo ?? 30,
      e.esPermiteCredito ? 1 : 0, e.notas ?? null,
    ],
  );
  return obtener(id);
}

export async function actualizar(id: Id, e: EntradaCliente): Promise<ClienteFila> {
  const existe = await queryOne<{ id: number }>(
    `SELECT id FROM clientes WHERE id = ? AND eliminado_en IS NULL`,
    [id],
  );
  if (!existe) throw new NoEncontrado('CLIENTE_NO_ENCONTRADO');
  await ejecutar(
    `UPDATE clientes SET tipo_documento=?, documento=?, nombre=?, telefono=?, email=?,
            direccion=?, cupo_credito=?, dias_plazo=?, es_permite_credito=?, notas=?
      WHERE id = ?`,
    [
      e.tipoDocumento ?? 'CC', e.documento ?? null, e.nombre, e.telefono ?? null,
      e.email ?? null, e.direccion ?? null, e.cupoCredito ?? '0', e.diasPlazo ?? 30,
      e.esPermiteCredito ? 1 : 0, e.notas ?? null, id,
    ],
  );
  return obtener(id);
}

export async function eliminar(id: Id): Promise<void> {
  if (id === 1) throw new Conflicto('OPERACION_NO_PERMITIDA'); // CONSUMIDOR FINAL
  const cliente = await queryOne<{ deuda_usd: string }>(
    `SELECT COALESCE((SELECT SUM(cr.saldo_usd) FROM creditos cr
                       WHERE cr.cliente_id = c.id
                         AND cr.estado IN ('PENDIENTE','PARCIAL','VENCIDO') AND cr.saldo_usd > 0), 0) AS deuda_usd
       FROM clientes c WHERE c.id = ? AND c.eliminado_en IS NULL`,
    [id],
  );
  if (!cliente) throw new NoEncontrado('CLIENTE_NO_ENCONTRADO');
  // No se borra a alguien que todavia debe: su cuenta tiene que seguir cobrable.
  if (Number(cliente.deuda_usd) > 0) throw new Conflicto('REFERENCIA_EN_USO');
  await ejecutar(`UPDATE clientes SET eliminado_en = NOW() WHERE id = ?`, [id]);
}
