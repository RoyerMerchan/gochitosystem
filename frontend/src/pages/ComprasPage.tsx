/**
 * Entrada de mercancía: el negocio ingresa el stock manualmente.
 * Solo se agregan productos con cantidad y costo; actualiza stock y costo promedio.
 * (Internamente usa el proveedor generico "INGRESO DIRECTO".)
 */
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { PackagePlus, Plus, Trash2, Search, Eye } from 'lucide-react';
import { obtenerPaginado, obtener, crear } from '@/lib/axios';
import { ErrorApi } from '@/lib/errores';
import { Card, Cargando, Badge, EmptyState } from '@/components/ui/Feedback';
import { Modal } from '@/components/ui/Modal';
import { FiltroPeriodo } from '@/components/ui/FiltroPeriodo';
import { toast } from '@/store/toastStore';
import { useDebounce } from '@/hooks/useDebounce';
import { useTasaStore } from '@/store/tasaStore';
import { formatearUSD, formatearBs, formatearFecha, aNumero, usdABs, redondearCentavos } from '@/lib/formato';
import type { Producto } from '@/lib/tipos';

interface EntradaFila { id: number; numero: string; fecha_recepcion: string; total_usd: string; total_bs: string; estado: string; }
interface Renglon { productoId: number; nombre: string; sku: string; cantidad: string; costoUnitario: string; }
interface DetalleCompra {
  compra: { proveedor: string; estado: string; total_usd: string; total_bs: string; tasa_cambio: string; fecha_recepcion: string };
  renglones: Array<{ linea: number; descripcion: string; cantidad: string; costo_unitario_neto: string; total_linea: string }>;
}

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
  const paramsE = new URLSearchParams({ limite: '100' });
  if (desde) paramsE.set('desde', desde);
  if (hasta) paramsE.set('hasta', hasta);
  const entradas = useQuery({ queryKey: ['compras', desde, hasta], queryFn: () => obtenerPaginado<EntradaFila>(`/compras?${paramsE.toString()}`) });
  const detalle = useQuery({ queryKey: ['compra-detalle', ver?.id], queryFn: () => obtener<DetalleCompra>(`/compras/${ver!.id}`), enabled: ver !== null });
  const busq = useQuery({ queryKey: ['prodBuscar', q], queryFn: () => obtener<Producto[]>(`/productos/buscar?q=${encodeURIComponent(q)}`), enabled: q.length > 0 });

  const registrar = useMutation({
    mutationFn: () => crear('/compras', {
      condicionPago: 'CONTADO',
      renglones: renglones.map((r) => ({ productoId: r.productoId, cantidad: r.cantidad, costoUnitario: r.costoUnitario })),
    }),
    onSuccess: () => { toast.exito('Mercancía ingresada · stock y costo actualizados'); qc.invalidateQueries({ queryKey: ['compras'] }); qc.invalidateQueries({ queryKey: ['existencias'] }); cerrar(); },
    onError: (e) => toast.error(e instanceof ErrorApi ? e.message : 'No se pudo registrar la entrada'),
  });

  const cerrar = () => { setModal(false); setRenglones([]); setTermino(''); };
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
              <th className="p-3 text-right">Total $ / Bs</th><th className="p-3 text-center">Estado</th><th className="p-3"></th></tr></thead>
            <tbody>
              {entradas.data!.datos.map((c) => (
                <tr key={c.id} className="border-t border-gray-100 dark:border-gray-700">
                  <td className="p-3 font-medium">{c.numero}</td>
                  <td className="p-3 text-gray-500">{formatearFecha(c.fecha_recepcion)}</td>
                  <td className="p-3 text-right tabular-nums">
                    {formatearUSD(c.total_usd)}
                    <span className="block text-xs text-gray-400">{formatearBs(c.total_bs)}</span>
                  </td>
                  <td className="p-3 text-center">{c.estado === 'ANULADA' ? <Badge color="rojo">Anulada</Badge> : <Badge color="verde">Ingresada</Badge>}</td>
                  <td className="p-3 text-right">
                    <button onClick={() => setVer(c)} className="text-gray-400 hover:text-amber-600" title="Ver productos">
                      <Eye className="h-4 w-4" />
                    </button>
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
            </div>
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
    </div>
  );
}
const INP = 'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-amber-500 focus:outline-none dark:border-gray-600 dark:bg-gray-700';
