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
  saldo_actual: string;
  es_permite_credito: boolean;
  esta_bloqueado: boolean;
  esta_activo: boolean;
}

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
  const cond = ['eliminado_en IS NULL'];
  const params: (string | number)[] = [];
  if (filtros.busqueda) {
    cond.push('(nombre ILIKE ? OR documento ILIKE ?)');
    const like = `%${filtros.busqueda}%`;
    params.push(like, like);
  }
  if (filtros.conDeuda) cond.push('saldo_actual > 0');
  const where = `WHERE ${cond.join(' AND ')}`;

  const datos = await query<ClienteFila>(
    `SELECT id, tipo_documento, documento, nombre, telefono, email, direccion,
            cupo_credito, dias_plazo, saldo_actual, es_permite_credito, esta_bloqueado, esta_activo
       FROM clientes ${where} ORDER BY nombre LIMIT ? OFFSET ?`,
    [...params, filtros.limite, filtros.desplazamiento],
  );
  const total = await queryOne<{ n: number }>(`SELECT COUNT(*) AS n FROM clientes ${where}`, params);
  return { datos, total: total?.n ?? 0 };
}

export async function obtener(id: Id): Promise<ClienteFila> {
  const c = await queryOne<ClienteFila>(
    `SELECT id, tipo_documento, documento, nombre, telefono, email, direccion,
            cupo_credito, dias_plazo, saldo_actual, es_permite_credito, esta_bloqueado, esta_activo
       FROM clientes WHERE id = ? AND eliminado_en IS NULL LIMIT 1`,
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
  const cliente = await queryOne<{ saldo_actual: string }>(
    `SELECT saldo_actual FROM clientes WHERE id = ? AND eliminado_en IS NULL`,
    [id],
  );
  if (!cliente) throw new NoEncontrado('CLIENTE_NO_ENCONTRADO');
  if (Number(cliente.saldo_actual) > 0) throw new Conflicto('REFERENCIA_EN_USO');
  await ejecutar(`UPDATE clientes SET eliminado_en = NOW() WHERE id = ?`, [id]);
}
