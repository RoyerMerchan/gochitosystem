/**
 * Entrada de mercancía: el negocio ingresa el stock manualmente.
 * Se agregan productos con cantidad y costo; actualiza stock y costo promedio.
 *
 * Cada entrada queda a nombre de un proveedor. Si no se elige ninguno usa el
 * generico "INGRESO DIRECTO" (id 1), que es lo que hacia siempre antes.
 * A crédito, la entrada abre cuenta por pagar con ese proveedor.
 */
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { PackagePlus, Plus, Trash2, Search, Eye, Truck, HandCoins } from 'lucide-react';
import { obtenerPaginado, obtener, crear } from '@/lib/axios';
import { ErrorApi } from '@/lib/errores';
import { Card, Cargando, Badge, EmptyState } from '@/components/ui/Feedback';
import { Modal } from '@/components/ui/Modal';
import { FiltroPeriodo } from '@/components/ui/FiltroPeriodo';
import { toast } from '@/store/toastStore';
import { useDebounce } from '@/hooks/useDebounce';
import { useTasaStore } from '@/store/tasaStore';
import { formatearUSD, formatearBs, formatearFecha, formatearFechaHora, aNumero, usdABs, redondearCentavos } from '@/lib/formato';
import { METODOS_PAGO } from '@/features/pos/metodosPago';
import type { Producto } from '@/lib/tipos';

interface EntradaFila {
  id: number; numero: string; fecha_recepcion: string; total_usd: string; total_bs: string;
  estado: string; proveedor: string; proveedor_id: number;
  numero_factura_proveedor: string | null; condicion_pago: string; saldo_pendiente: string;
}
interface Renglon { productoId: number; nombre: string; sku: string; cantidad: string; costoUnitario: string; }
interface Proveedor { id: number; razon_social: string; nit: string | null; saldo_actual: string; }
interface DetalleCompra {
  compra: {
    proveedor: string; estado: string; total_usd: string; total_bs: string; tasa_cambio: string;
    fecha_recepcion: string; numero_factura_proveedor: string | null;
    condicion_pago: string; saldo_pendiente: string;
  };
  renglones: Array<{ linea: number; descripcion: string; cantidad: string; costo_unitario_neto: string; total_linea: string }>;
  /** Lo que ya se le pagó al proveedor por esta entrada. */
  pagos: Array<{
    id: number; fecha: string; moneda: 'USD' | 'VES'; monto_moneda: string;
    monto_usd: string; referencia: string | null; metodo_nombre: string; usuario: string;
  }>;
}

/** Proveedor generico que usa el sistema cuando no se indica ninguno. */
const PROVEEDOR_DIRECTO = 1;

/** Centavos hacia abajo: el backend convierte Bs -> USD truncando, aquí igual. */
const pisoCentavos = (n: number) => Math.floor(n * 100 + 1e-9) / 100;
/** Centavos hacia arriba: Bs mínimos que cubren un saldo en USD sin quedar corto. */
const techoCentavos = (n: number) => Math.ceil(n * 100 - 1e-9) / 100;

export default function ComprasPage() {
  const qc = useQueryClient();
  // La compra se guarda en USD; los Bs son referencia a la tasa del día (la entrada
  // congela su propia tasa_cambio, que es la que se muestra al ver el detalle).
  const tasa = useTasaStore((s) => s.tasa);
  const tasaNum = tasa ? Number(tasa.tasa) : 0;
  const [modal, setModal] = useState(false);
  const [renglones, setRenglones] = useState<Renglon[]>([]);
  const [termino, setTermino] = useState('');
  const q = useDebounce(termino, 250);

  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');
  const [ver, setVer] = useState<EntradaFila | null>(null);
  /** Filtro del listado: 0 = todos los proveedores. */
  const [filtroProv, setFiltroProv] = useState(0);
  // Datos de la entrada que se está cargando.
  const [proveedorId, setProveedorId] = useState(PROVEEDOR_DIRECTO);
  const [facturaProv, setFacturaProv] = useState('');
  const [condicion, setCondicion] = useState<'CONTADO' | 'CREDITO'>('CONTADO');
  // Alta rápida de proveedor, para no tener que salir a otra pantalla.
  const [creandoProv, setCreandoProv] = useState(false);
  const [provNuevo, setProvNuevo] = useState({ razonSocial: '', telefono: '' });
  /*
    Pago al proveedor de una entrada que quedó a crédito. La entrada se marca
    pagada sola cuando el saldo llega a cero: no hay un "check" aparte, porque el
    estado tiene que salir de la plata que se le entregó, no de un botón.
  */
  const [pagando, setPagando] = useState<EntradaFila | null>(null);
  const [pagoMetodoId, setPagoMetodoId] = useState(2); // Efectivo USD
  /** Moneda en la que se ESCRIBE el monto; puede no ser la del método. */
  const [pagoMoneda, setPagoMoneda] = useState<'USD' | 'VES'>('USD');
  /** null = pagar todo el saldo; string = el usuario escribió otro monto. */
  const [pagoMonto, setPagoMonto] = useState<string | null>(null);
  const [pagoRef, setPagoRef] = useState('');

  const paramsE = new URLSearchParams({ limite: '100' });
  if (desde) paramsE.set('desde', desde);
  if (hasta) paramsE.set('hasta', hasta);
  if (filtroProv) paramsE.set('proveedorId', String(filtroProv));
  const entradas = useQuery({ queryKey: ['compras', desde, hasta, filtroProv], queryFn: () => obtenerPaginado<EntradaFila>(`/compras?${paramsE.toString()}`) });
  const detalle = useQuery({ queryKey: ['compra-detalle', ver?.id], queryFn: () => obtener<DetalleCompra>(`/compras/${ver!.id}`), enabled: ver !== null });
  const busq = useQuery({ queryKey: ['prodBuscar', q], queryFn: () => obtener<Producto[]>(`/productos/buscar?q=${encodeURIComponent(q)}`), enabled: q.length > 0 });
  const proveedores = useQuery({ queryKey: ['proveedores'], queryFn: () => obtenerPaginado<Proveedor>('/proveedores?limite=200') });
  const listaProv = proveedores.data?.datos ?? [];

  const registrar = useMutation({
    mutationFn: () => crear('/compras', {
      proveedorId,
      numeroFacturaProveedor: facturaProv.trim() || undefined,
      condicionPago: condicion,
      renglones: renglones.map((r) => ({ productoId: r.productoId, cantidad: r.cantidad, costoUnitario: r.costoUnitario })),
    }),
    onSuccess: () => {
      toast.exito(condicion === 'CREDITO'
        ? 'Mercancía ingresada · queda por pagar al proveedor'
        : 'Mercancía ingresada · stock y costo actualizados');
      qc.invalidateQueries({ queryKey: ['compras'] });
      qc.invalidateQueries({ queryKey: ['existencias'] });
      // La compra a crédito mueve el saldo del proveedor y los totales del panel.
      qc.invalidateQueries({ queryKey: ['proveedores'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      cerrar();
    },
    onError: (e) => toast.error(e instanceof ErrorApi ? e.message : 'No se pudo registrar la entrada'),
  });

  const crearProveedor = useMutation({
    mutationFn: () => crear<Proveedor>('/proveedores', {
      razonSocial: provNuevo.razonSocial.trim(),
      telefono: provNuevo.telefono.trim() || null,
    }),
    onSuccess: (p) => {
      toast.exito('Proveedor creado');
      qc.invalidateQueries({ queryKey: ['proveedores'] });
      setProveedorId(p.id);
      setCreandoProv(false); setProvNuevo({ razonSocial: '', telefono: '' });
    },
    onError: (e) => toast.error(e instanceof ErrorApi ? e.message : 'No se pudo crear el proveedor'),
  });

  /* ---------------------------------------------------------------- */
  /* Pago de una entrada a crédito                                     */
  /* ---------------------------------------------------------------- */
  const metodoPago = METODOS_PAGO.find((m) => m.id === pagoMetodoId)!;
  const saldoPagar = aNumero(pagando?.saldo_pendiente ?? 0);
  const pagoEnBs = pagoMoneda === 'VES';
  // Sugerido: pagar todo lo que se debe, en la moneda en la que se escribe.
  const pagoSugerido = pagoEnBs && tasaNum > 0
    ? techoCentavos(saldoPagar * tasaNum).toFixed(2)
    : saldoPagar.toFixed(2);
  const montoPago = pagoMonto ?? pagoSugerido;
  // Equivalente en USD con la aritmética del backend: piso + tolerancia de 1 centavo.
  const pagoUsdCrudo = pagoEnBs
    ? (tasaNum > 0 ? pisoCentavos(aNumero(montoPago) / tasaNum) : 0)
    : pisoCentavos(aNumero(montoPago));
  const pagoUsd = Math.abs(pagoUsdCrudo - saldoPagar) <= 0.01 ? saldoPagar : pagoUsdCrudo;
  /** Lo que se envía va SIEMPRE en la moneda del método: es la plata que sale. */
  const pagoEnvio = metodoPago.moneda === pagoMoneda
    ? aNumero(montoPago)
    : (metodoPago.moneda === 'VES' ? techoCentavos(pagoUsd * tasaNum) : pagoUsd);
  const quedaDebiendo = Math.max(0, redondearCentavos(saldoPagar - pagoUsd));
  /** Al proveedor no se le puede pagar más de lo que se le debe por esta entrada. */
  const pagoExcede = pagoUsd > saldoPagar;

  const registrarPago = useMutation({
    mutationFn: () => crear<{ pagada: boolean; saldo_pendiente: string }>(
      `/compras/${pagando!.id}/pagos`,
      {
        metodoPagoId: pagoMetodoId,
        moneda: metodoPago.moneda,
        montoMoneda: pagoEnvio.toFixed(2),
        referencia: pagoRef.trim() || undefined,
      },
    ),
    onSuccess: (r) => {
      toast.exito(r.pagada
        ? 'Entrada pagada · no le queda saldo a este proveedor'
        : `Pago registrado · queda debiendo ${formatearUSD(r.saldo_pendiente)}`);
      qc.invalidateQueries({ queryKey: ['compras'] });
      qc.invalidateQueries({ queryKey: ['compra-detalle'] });
      // El pago baja la cuenta por pagar del proveedor y, si fue en efectivo,
      // saca plata de la gaveta: el turno abierto queda desactualizado.
      qc.invalidateQueries({ queryKey: ['proveedores'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      qc.invalidateQueries({ queryKey: ['turno-activo'] });
      cerrarPago();
    },
    onError: (e) => toast.error(e instanceof ErrorApi ? e.message : 'No se pudo registrar el pago'),
  });

  const abrirPago = (c: EntradaFila) => {
    setPagando(c);
    setPagoMetodoId(2); setPagoMoneda('USD'); setPagoMonto(null); setPagoRef('');
  };
  const cerrarPago = () => { setPagando(null); setPagoMonto(null); setPagoRef(''); };

  const puedePagar = pagoUsd > 0 && !pagoExcede && !registrarPago.isPending
    && (!metodoPago.requiereReferencia || Boolean(pagoRef.trim()))
    // Sin tasa del día no hay conversión posible en ninguno de los dos sentidos.
    && !((pagoEnBs || metodoPago.moneda === 'VES') && tasaNum <= 0);

  const cerrar = () => {
    setModal(false); setRenglones([]); setTermino('');
    setProveedorId(PROVEEDOR_DIRECTO); setFacturaProv(''); setCondicion('CONTADO');
    setCreandoProv(false); setProvNuevo({ razonSocial: '', telefono: '' });
  };
  const agregar = (p: Producto) => {
    if (renglones.some((r) => r.productoId === p.id)) return;
    setRenglones((rs) => [...rs, { productoId: p.id, nombre: p.nombre, sku: p.sku, cantidad: '1', costoUnitario: p.costo_promedio }]);
    setTermino('');
  };
  const total = renglones.reduce((a, r) => a + Number(r.cantidad || 0) * Number(r.costoUnitario || 0), 0);

  /** Edita el costo de un renglón en USD. */
  const fijarCostoUsd = (i: number, usd: string) =>
    setRenglones((rs) => rs.map((x, j) => (j === i ? { ...x, costoUnitario: usd } : x)));
  /** Edita el costo escribiéndolo en Bs: se guarda su equivalente en USD a la tasa de hoy. */
  const fijarCostoBs = (i: number, bs: string) => {
    if (tasaNum <= 0) return;
    const usd = bs === '' ? '' : (aNumero(bs) / tasaNum).toFixed(4);
    fijarCostoUsd(i, usd);
  };
  const costoEnBs = (usd: string) => (tasaNum > 0 ? (aNumero(usd) * tasaNum).toFixed(2) : '');

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-bold">Entrada de mercancía</h1><p className="text-sm text-gray-500">Ingreso manual de stock · {entradas.data?.meta.total ?? 0} entradas</p></div>
        <div className="flex flex-wrap items-end gap-2">
          <FiltroPeriodo desde={desde} hasta={hasta} onCambiar={(d, h) => { setDesde(d); setHasta(h); }} />
          <div>
            <label className="mb-0.5 block text-[10px] uppercase text-gray-400">Proveedor</label>
            <select value={filtroProv} onChange={(e) => setFiltroProv(Number(e.target.value))}
              className="max-w-[12rem] rounded-lg border border-gray-300 px-2 py-1.5 text-sm dark:border-gray-600 dark:bg-gray-800">
              <option value={0}>Todos</option>
              {listaProv.map((p) => <option key={p.id} value={p.id}>{p.razon_social}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-0.5 block text-[10px] uppercase text-gray-400">Desde</label>
            <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm dark:border-gray-600 dark:bg-gray-800" />
          </div>
          <div>
            <label className="mb-0.5 block text-[10px] uppercase text-gray-400">Hasta</label>
            <input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm dark:border-gray-600 dark:bg-gray-800" />
          </div>
          <button onClick={() => setModal(true)} className="flex items-center gap-2 rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-600"><Plus className="h-4 w-4" /> Ingresar mercancía</button>
        </div>
      </div>

      <Card padding={false}>
        {entradas.isLoading ? <Cargando /> : (entradas.data?.datos ?? []).length === 0 ? (
          <EmptyState titulo="Sin entradas" descripcion="Aún no has ingresado mercancía." icono={<PackagePlus className="h-12 w-12" />} />
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs uppercase text-gray-500 dark:bg-gray-700/50"><tr>
              <th className="p-3 text-left">N.º</th><th className="p-3 text-left">Fecha</th>
              <th className="p-3 text-left">Proveedor</th>
              <th className="p-3 text-right">Total $ / Bs</th><th className="p-3 text-center">Estado</th><th className="p-3"></th></tr></thead>
            <tbody>
              {entradas.data!.datos.map((c) => (
                <tr key={c.id} className="border-t border-gray-100 dark:border-gray-700">
                  <td className="p-3 font-medium">{c.numero}</td>
                  <td className="p-3 text-gray-500">{formatearFecha(c.fecha_recepcion)}</td>
                  <td className="p-3">
                    <span className={c.proveedor_id === PROVEEDOR_DIRECTO ? 'text-gray-400' : 'font-medium'}>{c.proveedor}</span>
                    {c.numero_factura_proveedor && (
                      <span className="block text-xs text-gray-400">Factura {c.numero_factura_proveedor}</span>
                    )}
                  </td>
                  <td className="p-3 text-right tabular-nums">
                    {formatearUSD(c.total_usd)}
                    <span className="block text-xs text-gray-400">{formatearBs(c.total_bs)}</span>
                  </td>
                  {/*
                    Dos cosas distintas: la mercancía entró (estado) y al proveedor
                    se le pagó o no (saldo). Una entrada a crédito ya pagada tiene
                    que decirlo, que es lo que antes no se podía ni registrar.
                  */}
                  <td className="p-3 text-center">
                    {c.estado === 'ANULADA' ? <Badge color="rojo">Anulada</Badge> : <Badge color="verde">Ingresada</Badge>}
                    {c.estado !== 'ANULADA' && (aNumero(c.saldo_pendiente) > 0 ? (
                      <span className="mt-1 block text-xs font-medium text-amber-600">
                        Debes {formatearUSD(c.saldo_pendiente)}
                        {tasaNum > 0 && (
                          <span className="block font-normal text-gray-400">{formatearBs(usdABs(c.saldo_pendiente, tasaNum))}</span>
                        )}
                      </span>
                    ) : c.condicion_pago === 'CREDITO' && (
                      <span className="mt-1 block text-xs font-medium text-green-600">Pagada</span>
                    ))}
                  </td>
                  <td className="p-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      {c.estado !== 'ANULADA' && aNumero(c.saldo_pendiente) > 0 && (
                        <button onClick={() => abrirPago(c)}
                          className="flex items-center gap-1 rounded-lg bg-green-600 px-3 py-1 text-xs font-semibold text-white hover:bg-green-700"
                          title="Registrar el pago al proveedor">
                          <HandCoins className="h-3.5 w-3.5" /> Pagar
                        </button>
                      )}
                      <button onClick={() => setVer(c)} className="p-1.5 text-gray-400 hover:text-amber-600" title="Ver productos">
                        <Eye className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <Modal abierto={modal} onCerrar={cerrar} titulo="Ingresar mercancía" ancho="xl"
        pie={<div className="flex items-center justify-between"><span className="text-lg font-bold">Total: {formatearUSD(redondearCentavos(total))}<span className="ml-2 text-sm font-normal text-gray-400">{formatearBs(usdABs(total, tasaNum))}</span></span>
          <button onClick={() => registrar.mutate()} disabled={renglones.length === 0 || registrar.isPending} className="rounded-lg bg-green-600 px-5 py-2 font-semibold text-white hover:bg-green-700 disabled:opacity-50">Ingresar al inventario</button></div>}>
        <div className="space-y-3">
          <p className="rounded-lg bg-blue-50 p-3 text-xs text-blue-700 dark:bg-blue-900/20 dark:text-blue-300">
            Al ingresar, el stock sube y el costo promedio de cada producto se recalcula automáticamente.
          </p>

          {/* A quién se le compró: queda guardado en la entrada y sale en los reportes. */}
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="sm:col-span-2">
              <label className="mb-1 flex items-center justify-between text-xs font-medium text-gray-500">
                <span className="flex items-center gap-1"><Truck className="h-3.5 w-3.5" /> Proveedor</span>
                <button onClick={() => setCreandoProv((v) => !v)} className="font-semibold text-amber-600 hover:underline">
                  {creandoProv ? 'Cancelar' : '+ Nuevo proveedor'}
                </button>
              </label>
              {creandoProv ? (
                <div className="flex flex-wrap gap-2">
                  <input value={provNuevo.razonSocial} onChange={(e) => setProvNuevo({ ...provNuevo, razonSocial: e.target.value })}
                    placeholder="Nombre del proveedor *" autoFocus className={`${INP} min-w-0 flex-1`} />
                  <input value={provNuevo.telefono} onChange={(e) => setProvNuevo({ ...provNuevo, telefono: e.target.value })}
                    placeholder="Teléfono" className={`${INP} w-32`} />
                  <button onClick={() => crearProveedor.mutate()} disabled={!provNuevo.razonSocial.trim() || crearProveedor.isPending}
                    className="rounded-lg bg-amber-500 px-3 py-2 text-sm font-semibold text-white hover:bg-amber-600 disabled:opacity-50">
                    Guardar
                  </button>
                </div>
              ) : (
                <select value={proveedorId} onChange={(e) => setProveedorId(Number(e.target.value))} className={INP}>
                  {listaProv.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.id === PROVEEDOR_DIRECTO ? `${p.razon_social} (sin proveedor)` : p.razon_social}
                    </option>
                  ))}
                </select>
              )}
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-500">N.º factura del proveedor</label>
              <input value={facturaProv} onChange={(e) => setFacturaProv(e.target.value)} placeholder="Opcional" className={INP} />
            </div>
          </div>

          {/* Contado = ya se pagó. Crédito = queda como cuenta por pagar al proveedor. */}
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-xs font-medium text-gray-500">Cómo se paga:</span>
            <div className="flex overflow-hidden rounded-lg border border-gray-300 dark:border-gray-600">
              {(['CONTADO', 'CREDITO'] as const).map((c) => (
                <button key={c} onClick={() => setCondicion(c)}
                  className={`px-3 py-1.5 text-sm font-semibold ${condicion === c ? 'bg-amber-500 text-white' : 'text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700'}`}>
                  {c === 'CONTADO' ? 'De contado' : 'A crédito'}
                </button>
              ))}
            </div>
            {condicion === 'CREDITO' && (
              <span className="text-xs text-amber-600">Queda como cuenta por pagar a este proveedor</span>
            )}
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input value={termino} onChange={(e) => setTermino(e.target.value)} placeholder="Buscar producto para agregar…" className={`${INP} pl-9`} autoFocus />
            {busq.data && busq.data.length > 0 && (
              <div className="absolute z-10 mt-1 max-h-40 w-full overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-lg dark:border-gray-600 dark:bg-gray-700">
                {busq.data.map((p) => (
                  <button key={p.id} onClick={() => agregar(p)} className="block w-full px-3 py-2 text-left text-sm hover:bg-amber-50 dark:hover:bg-amber-900/20">{p.nombre} <span className="text-gray-400">({p.sku})</span></button>
                ))}
              </div>
            )}
          </div>
          <table className="w-full text-sm">
            <thead className="text-xs uppercase text-gray-400"><tr><th className="p-2 text-left">Producto</th><th className="p-2">Cantidad</th><th className="p-2">Costo $</th><th className="p-2">Costo Bs</th><th className="p-2 text-right">Subtotal</th><th></th></tr></thead>
            <tbody>
              {renglones.map((r, i) => {
                const subtotal = Number(r.cantidad || 0) * Number(r.costoUnitario || 0);
                return (
                <tr key={r.productoId} className="border-t border-gray-100 dark:border-gray-700">
                  <td className="p-2">{r.nombre}<span className="ml-1 text-xs text-gray-400">{r.sku}</span></td>
                  <td className="p-2"><input type="number" step="0.001" value={r.cantidad} onChange={(e) => setRenglones((rs) => rs.map((x, j) => j === i ? { ...x, cantidad: e.target.value } : x))} className="w-20 rounded border border-gray-300 px-2 py-1 text-right dark:border-gray-600 dark:bg-gray-700" /></td>
                  <td className="p-2"><input type="number" step="0.0001" value={r.costoUnitario} onChange={(e) => fijarCostoUsd(i, e.target.value)} className="w-24 rounded border border-gray-300 px-2 py-1 text-right dark:border-gray-600 dark:bg-gray-700" /></td>
                  {/* Si el proveedor factura en Bs se escribe aquí: se convierte a USD a la tasa de hoy. */}
                  <td className="p-2"><input type="number" step="0.01" value={costoEnBs(r.costoUnitario)} onChange={(e) => fijarCostoBs(i, e.target.value)} disabled={tasaNum <= 0} title={tasaNum <= 0 ? 'No hay tasa registrada hoy' : 'Costo en bolívares a la tasa de hoy'} className="w-28 rounded border border-gray-300 px-2 py-1 text-right disabled:opacity-40 dark:border-gray-600 dark:bg-gray-700" /></td>
                  <td className="p-2 text-right tabular-nums">
                    {formatearUSD(redondearCentavos(subtotal))}
                    <span className="block text-xs text-gray-400">{formatearBs(usdABs(subtotal, tasaNum))}</span>
                  </td>
                  <td className="p-2 text-right"><button onClick={() => setRenglones((rs) => rs.filter((_, j) => j !== i))} className="text-gray-400 hover:text-red-500"><Trash2 className="h-4 w-4" /></button></td>
                </tr>
                );
              })}
              {renglones.length === 0 && <tr><td colSpan={6} className="py-6 text-center text-gray-400">Busque y agregue productos</td></tr>}
            </tbody>
          </table>
        </div>
      </Modal>

      {/* Detalle de la entrada: qué productos se ingresaron */}
      <Modal abierto={ver !== null} onCerrar={() => setVer(null)} titulo={`Entrada ${ver?.numero ?? ''}`} ancho="lg">
        {detalle.isLoading ? <Cargando /> : detalle.data && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-3">
              <div><span className="text-gray-500">Fecha:</span> <span className="font-medium">{formatearFecha(detalle.data.compra.fecha_recepcion)}</span></div>
              <div><span className="text-gray-500">Proveedor:</span> <span className="font-medium">{detalle.data.compra.proveedor}</span></div>
              <div><span className="text-gray-500">Estado:</span> <span className="font-medium">{detalle.data.compra.estado}</span></div>
              <div><span className="text-gray-500">Tasa de la entrada:</span> <span className="font-medium">{formatearBs(detalle.data.compra.tasa_cambio)}/$</span></div>
              {detalle.data.compra.numero_factura_proveedor && (
                <div><span className="text-gray-500">Factura del proveedor:</span> <span className="font-medium">{detalle.data.compra.numero_factura_proveedor}</span></div>
              )}
              <div>
                <span className="text-gray-500">Pago:</span>{' '}
                <span className="font-medium">{detalle.data.compra.condicion_pago === 'CREDITO' ? 'A crédito' : 'De contado'}</span>
                {aNumero(detalle.data.compra.saldo_pendiente) > 0 ? (
                  <span className="ml-1 font-medium text-amber-600">· debes {formatearUSD(detalle.data.compra.saldo_pendiente)}</span>
                ) : detalle.data.compra.condicion_pago === 'CREDITO' && (
                  <span className="ml-1 font-medium text-green-600">· pagada</span>
                )}
              </div>
            </div>

            {/* Lo que ya se le entregó al proveedor por esta entrada. */}
            {detalle.data.pagos.length > 0 && (
              <div className="rounded-lg border border-gray-200 p-2 dark:border-gray-700">
                <p className="mb-1 text-[11px] uppercase tracking-wide text-gray-400">Pagos al proveedor</p>
                <ul className="divide-y divide-gray-100 text-xs dark:divide-gray-700">
                  {detalle.data.pagos.map((p) => (
                    <li key={p.id} className="flex flex-wrap items-baseline justify-between gap-x-3 py-1">
                      <span>
                        {formatearFechaHora(p.fecha)} · {p.metodo_nombre}
                        {p.referencia && <span className="text-gray-400"> · ref. {p.referencia}</span>}
                      </span>
                      <span className="tabular-nums font-medium">
                        {p.moneda === 'VES' ? formatearBs(p.monto_moneda) : formatearUSD(p.monto_moneda)}
                        {p.moneda === 'VES' && <span className="ml-1 font-normal text-gray-400">({formatearUSD(p.monto_usd)})</span>}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {ver && aNumero(detalle.data.compra.saldo_pendiente) > 0 && detalle.data.compra.estado !== 'ANULADA' && (
              <button onClick={() => { const c = ver; setVer(null); abrirPago(c); }}
                className="flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700">
                <HandCoins className="h-4 w-4" /> Pagarle al proveedor
              </button>
            )}
            <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-xs uppercase text-gray-500 dark:bg-gray-700/50">
                  <tr>
                    <th className="p-2 text-left">Producto</th><th className="p-2 text-right">Cant.</th>
                    <th className="p-2 text-right">Costo $</th><th className="p-2 text-right">Costo Bs</th><th className="p-2 text-right">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {/* Bs con la tasa congelada de la entrada, nunca la de hoy. */}
                  {detalle.data.renglones.map((r) => {
                    const tasaCompra = aNumero(detalle.data!.compra.tasa_cambio);
                    return (
                      <tr key={r.linea} className="border-t border-gray-100 dark:border-gray-700">
                        <td className="p-2 font-medium">{r.descripcion}</td>
                        <td className="p-2 text-right tabular-nums">{r.cantidad}</td>
                        <td className="p-2 text-right tabular-nums">{formatearUSD(r.costo_unitario_neto)}</td>
                        <td className="p-2 text-right tabular-nums text-gray-500">{formatearBs(aNumero(r.costo_unitario_neto) * tasaCompra)}</td>
                        <td className="p-2 text-right tabular-nums font-medium">
                          {formatearUSD(r.total_linea)}
                          <span className="block text-xs font-normal text-gray-400">{formatearBs(usdABs(r.total_linea, tasaCompra))}</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="flex justify-between text-base font-bold">
              <span>TOTAL</span>
              <span className="tabular-nums">
                {formatearUSD(detalle.data.compra.total_usd)}
                <span className="ml-2 text-sm font-normal text-gray-400">{formatearBs(detalle.data.compra.total_bs)}</span>
              </span>
            </div>
          </div>
        )}
      </Modal>

      {/* Pago al proveedor: se puede pagar todo o una parte, en $ o en Bs. */}
      <Modal abierto={pagando !== null} onCerrar={cerrarPago}
        titulo={`Pagar entrada ${pagando?.numero ?? ''}`} ancho="md"
        pie={
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-sm">
              {pagoExcede ? (
                <span className="font-medium text-red-500">
                  No le puedes pagar más de lo que le debes ({formatearUSD(saldoPagar)})
                </span>
              ) : quedaDebiendo > 0 ? (
                <>Queda debiendo <span className="font-semibold">{formatearUSD(quedaDebiendo)}</span></>
              ) : (
                <span className="font-semibold text-green-600">Con esto la entrada queda pagada</span>
              )}
            </div>
            <button onClick={() => registrarPago.mutate()} disabled={!puedePagar}
              className="w-full shrink-0 rounded-lg bg-green-600 px-5 py-2 font-semibold text-white hover:bg-green-700 disabled:opacity-50 sm:w-auto">
              {registrarPago.isPending ? 'Registrando…' : `Pagar ${formatearUSD(pagoUsd)}`}
            </button>
          </div>
        }>
        <div className="space-y-4">
          <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 dark:border-gray-700 dark:bg-gray-900/40">
            <div className="flex flex-wrap items-baseline justify-between gap-x-4">
              <span className="text-xs font-medium uppercase tracking-wide text-gray-500">Le debes a {pagando?.proveedor}</span>
              <span className="text-xl font-bold tabular-nums">{formatearUSD(saldoPagar)}</span>
            </div>
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 text-xs text-gray-500">
              <span>Entrada del {pagando ? formatearFecha(pagando.fecha_recepcion) : ''} · total {formatearUSD(pagando?.total_usd ?? 0)}</span>
              <span className="tabular-nums">{tasaNum > 0 ? formatearBs(usdABs(saldoPagar, tasaNum)) : 'sin tasa de hoy'}</span>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-500">Cómo le pagas</label>
              <select value={pagoMetodoId}
                onChange={(e) => {
                  const id = Number(e.target.value);
                  setPagoMetodoId(id);
                  setPagoMoneda(METODOS_PAGO.find((m) => m.id === id)?.moneda ?? 'USD');
                  setPagoMonto(null);
                }} className={INP}>
                {METODOS_PAGO.filter((m) => !m.esCredito).map((m) => (
                  <option key={m.id} value={m.id}>{m.nombre} ({m.moneda})</option>
                ))}
              </select>
              {metodoPago.permiteCambio && (
                <p className="mt-1 text-xs text-gray-400">Sale de la caja: baja el efectivo esperado del turno.</p>
              )}
            </div>
            <div>
              <label className="mb-1 flex items-center justify-between text-xs font-medium text-gray-500">
                <span>Monto</span>
                {pagoMonto !== null && (
                  <button onClick={() => setPagoMonto(null)} className="text-amber-600 hover:underline">Pagar todo</button>
                )}
              </label>
              <div className="flex gap-2">
                {/* Se escribe en $ o en Bs; abajo se ve siempre la conversión. */}
                <div className="flex overflow-hidden rounded-lg border border-gray-300 dark:border-gray-600">
                  {(['USD', 'VES'] as const).map((m) => (
                    <button key={m} onClick={() => { setPagoMoneda(m); setPagoMonto(null); }}
                      disabled={m === 'VES' && tasaNum <= 0}
                      className={`px-3 py-2 text-sm font-bold disabled:opacity-40 ${pagoMoneda === m ? 'bg-amber-500 text-white' : 'text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700'}`}>
                      {m === 'USD' ? '$' : 'Bs'}
                    </button>
                  ))}
                </div>
                <input type="number" step="0.01" min="0" value={montoPago}
                  onChange={(e) => setPagoMonto(e.target.value)}
                  onFocus={(e) => e.currentTarget.select()}
                  className={`${INP} min-w-0 flex-1`} placeholder="0.00" />
              </div>
              <p className="mt-1 text-xs text-gray-400">
                {tasaNum > 0
                  ? `${formatearUSD(pagoUsd)} · ${formatearBs(usdABs(pagoUsd, tasaNum))} (tasa ${formatearBs(tasaNum)}/$)`
                  : 'No hay tasa registrada hoy'}
              </p>
              {metodoPago.moneda !== pagoMoneda && tasaNum > 0 && pagoUsd > 0 && (
                <p className="mt-1 text-xs text-amber-600">
                  Sale por {metodoPago.nombre}: se registra{' '}
                  {metodoPago.moneda === 'VES' ? formatearBs(pagoEnvio) : formatearUSD(pagoEnvio)}
                </p>
              )}
            </div>
          </div>

          {/* Pagos parciales rápidos */}
          {saldoPagar > 0 && (
            <div className="flex flex-wrap gap-2">
              {[0.25, 0.5, 0.75, 1].map((f) => {
                const usd = f === 1 ? saldoPagar : pisoCentavos(saldoPagar * f);
                const valor = pagoEnBs && tasaNum > 0 ? techoCentavos(usd * tasaNum).toFixed(2) : usd.toFixed(2);
                return (
                  <button key={f} onClick={() => setPagoMonto(f === 1 ? null : valor)}
                    className="rounded-lg border border-gray-300 px-3 py-1 text-xs font-semibold hover:border-amber-400 hover:bg-amber-50 dark:border-gray-600 dark:hover:bg-amber-900/20">
                    {f === 1 ? 'Todo' : `${f * 100} %`} · {formatearUSD(usd)}
                    {pagoEnBs && tasaNum > 0 && <span className="ml-1 text-gray-400">({formatearBs(valor)})</span>}
                  </button>
                );
              })}
            </div>
          )}

          {metodoPago.requiereReferencia && (
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-500">Referencia</label>
              <input value={pagoRef} onChange={(e) => setPagoRef(e.target.value)} className={INP} placeholder="N.º de referencia" />
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
}
const INP = 'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-amber-500 focus:outline-none dark:border-gray-600 dark:bg-gray-700';
