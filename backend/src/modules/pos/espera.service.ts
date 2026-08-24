/**
 * Ventas en espera: carritos que el cajero aparca para atender al siguiente.
 *
 * NO son ventas. No consumen consecutivo, no tocan inventario, no reservan stock y
 * no entran en ningun reporte: es el estado de la pantalla del POS guardado con un
 * nombre. Por eso vive en `ventas_en_espera` y no como un estado de `ventas`.
 *
 * Se guarda en la base y no en el navegador para que sobreviva a un refresco y para
 * que se pueda retomar desde otra caja de la misma sucursal.
 */
import { NoEncontrado, ReglaNegocio } from '../../errores/AppError';
import { query, queryOne, ejecutar, insertar } from '../../database/pool';
import { listarPorIds, type ProductoListado } from '../productos/productos.service';
import { tasaDeFecha } from '../tasas/tasas.service';
import type { Id, UsuarioAutenticado } from '../../tipos/comunes';

/**
 * Tope de carritos aparcados por sucursal.
 *
 * No es una restriccion tecnica: una gaveta con cincuenta borradores deja de ser
 * util y lo que hace falta es que el cajero cierre o descarte los viejos. El limite
 * avisa en vez de dejar crecer una lista que nadie vuelve a mirar.
 */
const MAX_EN_ESPERA = 30;

/** Renglon del carrito tal como lo maneja el POS (frontend: ItemCarrito). */
export interface RenglonEspera {
  productoId: number;
  sku: string;
  nombre: string;
  precioUnitario: number;
  precioDetal: number;
  precioMayorista: number | null;
  esMayor: boolean;
  costoUnitario: number;
  impuestoTasa: number;
  esPrecioIncluyeImpuesto: boolean;
  cantidad: number;
  descuentoUnitario: number;
  esPesable: boolean;
  stock: number;
}

export interface EsperaEntrada {
  nombre: string;
  clienteId?: number | null;
  nota?: string;
  totalUsd: string;
  items: RenglonEspera[];
}

export interface EsperaListada {
  id: Id;
  nombre: string;
  nota: string | null;
  cliente_id: Id | null;
  cliente_nombre: string | null;
  total_usd: string;
  renglones: number;
  creado_en: string;
  cajero: string;
}

/** Las que estan aparcadas en la sucursal, la mas reciente arriba. */
export async function listar(sucursalId: Id): Promise<EsperaListada[]> {
  return query<EsperaListada>(
    `SELECT e.id, e.nombre, e.nota, e.cliente_id, c.nombre AS cliente_nombre,
            e.total_usd, e.renglones, e.creado_en, u.nombre_completo AS cajero
       FROM ventas_en_espera e
       JOIN usuarios u ON u.id = e.usuario_id
       LEFT JOIN clientes c ON c.id = e.cliente_id
      WHERE e.sucursal_id = ?
      ORDER BY e.creado_en DESC`,
    [sucursalId],
  );
}

/** Aparca el carrito. Devuelve el id para poder avisar por pantalla. */
export async function guardar(
  entrada: EsperaEntrada,
  usuario: UsuarioAutenticado,
): Promise<{ id: Id; nombre: string }> {
  if (entrada.items.length === 0) {
    throw new ReglaNegocio('REGLA_NEGOCIO', { mensaje: 'No hay nada que dejar en espera.' });
  }

  const cuenta = await queryOne<{ n: string }>(
    `SELECT COUNT(*) AS n FROM ventas_en_espera WHERE sucursal_id = ?`,
    [usuario.sucursalId],
  );
  if (Number(cuenta?.n ?? 0) >= MAX_EN_ESPERA) {
    throw new ReglaNegocio('REGLA_NEGOCIO', {
      mensaje: `Ya hay ${MAX_EN_ESPERA} ventas en espera. Cobre o descarte alguna antes de guardar otra.`,
    });
  }

  const id = await insertar(
    `INSERT INTO ventas_en_espera
       (sucursal_id, usuario_id, cliente_id, nombre, nota, total_usd, renglones, carrito)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      usuario.sucursalId,
      usuario.id,
      entrada.clienteId ?? null,
      entrada.nombre,
      entrada.nota ?? null,
      entrada.totalUsd,
      entrada.items.length,
      JSON.stringify(entrada.items),
    ],
  );
  return { id, nombre: entrada.nombre };
}

export interface EsperaRetomada {
  id: Id;
  nombre: string;
  nota: string | null;
  clienteId: Id | null;
  clienteNombre: string | null;
  items: RenglonEspera[];
  /** Renglones que ya no se pueden vender (producto borrado o desactivado). */
  descartados: Array<{ nombre: string; motivo: string }>;
  /** Avisos para el cajero: precio que cambio, existencia que ya no alcanza. */
  avisos: string[];
}

/**
 * Saca el carrito de la gaveta y lo devuelve con existencia y precios REFRESCADOS.
 *
 * SACA: el DELETE ... RETURNING es lo que hace la operacion atomica. Si dos cajas
 * intentan retomar la misma venta a la vez, solo una se la lleva; la otra recibe
 * "ya no existe" en vez de terminar las dos con el mismo carrito y cobrandolo dos
 * veces. Desde aqui el carrito vive en el POS del cajero, que ya persiste solo.
 *
 * REFRESCADOS: lo guardado es una foto. Entre que se aparco y se retoma pudo subir
 * el precio o venderse la ultima unidad. Se rearma cada renglon contra el producto
 * vigente y se avisa de cada diferencia, en vez de dejar que el cajero cobre a un
 * precio viejo y lo descubra en el cierre.
 *
 * Lo que el cajero cambio A MANO se respeta: si el precio del renglon no coincidia
 * ni con el de lista ni con el de mayor, es una decision suya (una rebaja pactada) y
 * refrescarla seria pisarla. Igual se avisa de que la lista cambio.
 */
export async function retomar(id: Id, sucursalId: Id): Promise<EsperaRetomada> {
  const fila = await queryOne<{
    id: Id;
    nombre: string;
    nota: string | null;
    cliente_id: Id | null;
    carrito: RenglonEspera[] | string;
  }>(
    `DELETE FROM ventas_en_espera
      WHERE id = ? AND sucursal_id = ?
      RETURNING id, nombre, nota, cliente_id, carrito`,
    [id, sucursalId],
  );
  if (!fila) throw new NoEncontrado('NO_ENCONTRADO', { mensaje: 'Esa venta en espera ya no existe.' });

  // El nombre del cliente se busca aparte: el DELETE ... RETURNING no admite JOIN.
  const cliente = fila.cliente_id
    ? await queryOne<{ nombre: string }>('SELECT nombre FROM clientes WHERE id = ?', [fila.cliente_id])
    : null;

  // JSONB llega parseado por el driver; el string es por si alguna fila quedara
  // guardada como texto.
  const guardados: RenglonEspera[] = typeof fila.carrito === 'string'
    ? (JSON.parse(fila.carrito) as RenglonEspera[])
    : fila.carrito;

  const tasa = await tasaDeFecha();
  const vigentes = await listarPorIds(
    guardados.map((r) => r.productoId),
    sucursalId,
    tasa?.tasa ?? null,
  );
  const porId = new Map<number, ProductoListado>(vigentes.map((p) => [Number(p.id), p]));

  const items: RenglonEspera[] = [];
  const descartados: EsperaRetomada['descartados'] = [];
  const avisos: string[] = [];

  for (const r of guardados) {
    const p = porId.get(r.productoId);
    if (!p) {
      descartados.push({ nombre: r.nombre, motivo: 'ya no esta disponible' });
      continue;
    }

    const precioDetal = Number(p.precio_venta);
    const precioMayorista = p.precio_venta_mayorista !== null ? Number(p.precio_venta_mayorista) : null;
    const stock = Number(p.cantidad);

    // El renglon sigue marcado al mayor solo si el producto todavia tiene ese precio.
    const esMayor = r.esMayor && precioMayorista !== null;
    /** Precio de lista que le tocaria HOY segun como estaba marcado el renglon. */
    const precioLista = esMayor && precioMayorista !== null ? precioMayorista : precioDetal;
    /** El mismo precio, pero con la foto vieja: sirve para saber si cambio. */
    const precioListaGuardado = r.esMayor && r.precioMayorista !== null ? r.precioMayorista : r.precioDetal;
    /** Lo que el cajero puso a mano: ni el detal ni el mayor de cuando se guardo. */
    const precioEraManual = r.precioUnitario !== r.precioDetal
      && (r.precioMayorista === null || r.precioUnitario !== r.precioMayorista);

    if (precioLista !== precioListaGuardado) {
      avisos.push(precioEraManual
        ? `${p.nombre}: cambio el precio de lista, pero se respeta el que usted puso.`
        : `${p.nombre}: el precio paso de ${precioListaGuardado} a ${precioLista} USD.`);
    }

    /*
      Existencia: aparcar una venta NO reserva mercancia, asi que entre medio se
      pudo vender. Se ajusta aqui, con el aviso, en vez de devolver una cantidad
      que la venta va a rechazar despues: el cajero se enteraria recien al cobrar,
      con el cliente delante y sin saber que renglon es el del problema.
    */
    if (stock <= 0) {
      descartados.push({ nombre: p.nombre, motivo: 'se agoto' });
      continue;
    }
    const cantidad = stock < r.cantidad ? stock : r.cantidad;
    if (cantidad !== r.cantidad) {
      avisos.push(`${p.nombre}: solo quedan ${stock}; se ajusto de ${r.cantidad} a ${cantidad}.`);
    }

    items.push({
      ...r,
      sku: p.sku,
      nombre: p.nombre,
      cantidad,
      precioUnitario: precioEraManual ? r.precioUnitario : precioLista,
      precioDetal,
      precioMayorista,
      esMayor,
      costoUnitario: Number(p.costo_promedio),
      impuestoTasa: Number(p.impuesto_tasa),
      esPrecioIncluyeImpuesto: Boolean(p.es_precio_incluye_impuesto),
      esPesable: Boolean(p.es_pesable),
      stock,
    });
  }

  // Ya salio de la gaveta y no queda nada que cobrar: no se devuelve un carrito
  // vacio al POS, se avisa de que la venta se perdio sola.
  if (items.length === 0) {
    throw new ReglaNegocio('REGLA_NEGOCIO', {
      mensaje: 'Ningun producto de esa venta sigue disponible; se descarto.',
    });
  }

  return {
    id: fila.id,
    nombre: fila.nombre,
    nota: fila.nota,
    clienteId: fila.cliente_id,
    clienteNombre: cliente?.nombre ?? null,
    items,
    descartados,
    avisos,
  };
}

/** Tira el carrito sin retomarlo: el cliente se fue o cambio de idea. */
export async function descartar(id: Id, sucursalId: Id): Promise<void> {
  const { rowCount } = await ejecutar(
    `DELETE FROM ventas_en_espera WHERE id = ? AND sucursal_id = ?`,
    [id, sucursalId],
  );
  if (rowCount === 0) throw new NoEncontrado('NO_ENCONTRADO', { mensaje: 'Esa venta en espera ya no existe.' });
}
