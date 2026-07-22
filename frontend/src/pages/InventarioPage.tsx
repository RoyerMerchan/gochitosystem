/** Inventario: existencias valorizadas en USD, reconciliación y ajuste manual. */
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Boxes, CheckCircle2, AlertTriangle, Search, SlidersHorizontal } from 'lucide-react';
import { obtenerPaginado, obtener, crear } from '@/lib/axios';
import { ErrorApi } from '@/lib/errores';
import { Card, Cargando, EmptyState } from '@/components/ui/Feedback';
import { Modal } from '@/components/ui/Modal';
import { toast } from '@/store/toastStore';
import { useDebounce } from '@/hooks/useDebounce';
import { formatearUSD, formatearCantidad } from '@/lib/formato';

interface Existencia {
  id: number; sku: string; nombre: string; categoria: string;
  cantidad: string; stock_minimo: string; costo_promedio: string; valor_usd: string;
}
interface Motivo { id: number; codigo: string; nombre: string; signo: number; }

export default function InventarioPage() {
  const qc = useQueryClient();
  const [busqueda, setBusqueda] = useState('');
  const [soloBajo, setSoloBajo] = useState(false);
  const [ajustando, setAjustando] = useState<Existencia | null>(null);
  const [nuevaCantidad, setNuevaCantidad] = useState('');
  const [motivoId, setMotivoId] = useState(0);
  const [observaciones, setObservaciones] = useState('');
  const q = useDebounce(busqueda, 300);

  const existencias = useQuery({
    queryKey: ['existencias', q, soloBajo],
    queryFn: () => obtenerPaginado<Existencia>(`/inventario/existencias?limite=200${q ? `&busqueda=${encodeURIComponent(q)}` : ''}${soloBajo ? '&stockBajo=true' : ''}`),
  });
  const motivos = useQuery({ queryKey: ['motivos-ajuste'], queryFn: () => obtener<Motivo[]>('/inventario/motivos') });

  const abrirAjuste = (e: Existencia) => {
    setAjustando(e);
    setNuevaCantidad(e.cantidad);
    setMotivoId(motivos.data?.find((m) => m.codigo === 'CORRECCION')?.id ?? motivos.data?.[0]?.id ?? 0);
    setObservaciones('');
  };

  const ajustar = useMutation({
    mutationFn: () => crear('/inventario/ajustes', {
      motivoId,
      observaciones: observaciones || undefined,
      renglones: [{ productoId: ajustando!.id, cantidadContada: nuevaCantidad || '0' }],
    }),
    onSuccess: () => {
      toast.exito('Inventario ajustado');
      qc.invalidateQueries({ queryKey: ['existencias'] });
      qc.invalidateQueries({ queryKey: ['productos'] });
      setAjustando(null);
    },
    onError: (e) => toast.error(e instanceof ErrorApi ? e.message : 'No se pudo ajustar'),
  });

  const reconciliar = async () => {
    try {
      const r = await obtener<{ diferencias: unknown[]; cuadrado: boolean }>('/inventario/reconciliacion');
      if (r.cuadrado) toast.exito('Inventario cuadrado: stock = ledger, sin diferencias');
      else toast.error(`${r.diferencias.length} producto(s) con diferencia entre stock y ledger`);
    } catch {
      toast.error('No se pudo reconciliar');
    }
  };

  const filas = existencias.data?.datos ?? [];
  const valorTotal = filas.reduce((a, e) => a + Number(e.valor_usd), 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Inventario</h1>
          <p className="text-sm text-gray-500">Valor total: {formatearUSD(valorTotal)}</p>
        </div>
        <div className="flex gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Buscar…"
              className="rounded-lg border border-gray-300 py-2 pl-9 pr-3 text-sm dark:border-gray-600 dark:bg-gray-800" />
          </div>
          <button onClick={() => setSoloBajo((v) => !v)} className={`rounded-lg border px-3 py-2 text-sm ${soloBajo ? 'border-amber-500 bg-amber-50 text-amber-700 dark:bg-amber-900/20' : 'border-gray-300 dark:border-gray-600'}`}>Stock bajo</button>
          <button onClick={reconciliar} className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700">
            <CheckCircle2 className="h-4 w-4" /> Reconciliar
          </button>
        </div>
      </div>

      <Card padding={false}>
        {existencias.isLoading ? <Cargando /> : filas.length === 0 ? (
          <EmptyState titulo="Sin existencias" icono={<Boxes className="h-12 w-12" />} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs uppercase text-gray-500 dark:bg-gray-700/50">
                <tr>
                  <th className="p-3 text-left">SKU</th><th className="p-3 text-left">Producto</th>
                  <th className="p-3 text-left">Categoría</th><th className="p-3 text-right">Stock</th>
                  <th className="p-3 text-right">Mínimo</th><th className="p-3 text-right">Costo prom.</th>
                  <th className="p-3 text-right">Valor USD</th><th className="p-3"></th>
                </tr>
              </thead>
              <tbody>
                {filas.map((e) => {
                  const bajo = Number(e.cantidad) <= Number(e.stock_minimo);
                  return (
                    <tr key={e.id} className="border-t border-gray-100 dark:border-gray-700">
                      <td className="p-3 font-mono text-xs text-gray-500">{e.sku}</td>
                      <td className="p-3 font-medium">{e.nombre}</td>
                      <td className="p-3 text-gray-500">{e.categoria}</td>
                      <td className="p-3 text-right">
                        <span className={bajo ? 'font-semibold text-red-600' : ''}>{formatearCantidad(e.cantidad)}</span>
                        {bajo && <AlertTriangle className="ml-1 inline h-3.5 w-3.5 text-red-500" />}
                      </td>
                      <td className="p-3 text-right text-gray-400">{formatearCantidad(e.stock_minimo)}</td>
                      <td className="p-3 text-right tabular-nums text-gray-500">{formatearUSD(e.costo_promedio)}</td>
                      <td className="p-3 text-right tabular-nums font-medium">{formatearUSD(e.valor_usd)}</td>
                      <td className="p-3 text-right">
                        <button onClick={() => abrirAjuste(e)} className="text-gray-400 hover:text-amber-600" title="Ajustar existencia">
                          <SlidersHorizontal className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Modal abierto={Boolean(ajustando)} onCerrar={() => setAjustando(null)} titulo={`Ajustar existencia · ${ajustando?.nombre ?? ''}`}
        pie={<div className="flex justify-end gap-2">
          <button onClick={() => setAjustando(null)} className="rounded-lg border border-gray-300 px-4 py-2 text-sm dark:border-gray-600">Cancelar</button>
          <button onClick={() => ajustar.mutate()} disabled={nuevaCantidad === '' || !motivoId || ajustar.isPending} className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-600 disabled:opacity-50">Aplicar ajuste</button>
        </div>}>
        {ajustando && (() => {
          const dif = Number(nuevaCantidad || 0) - Number(ajustando.cantidad);
          return (
            <div className="space-y-3">
              <p className="text-sm text-gray-500">
                Fija la cantidad real en existencia. Genera un movimiento de ajuste (no es una venta).
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="mb-1 block text-xs font-medium text-gray-500">Stock actual (sistema)</label>
                  <input value={formatearCantidad(ajustando.cantidad)} readOnly className={`${INP} bg-gray-50 dark:bg-gray-800`} /></div>
                <div><label className="mb-1 block text-xs font-medium text-gray-500">Cantidad real *</label>
                  <input type="number" step="0.001" value={nuevaCantidad} onChange={(ev) => setNuevaCantidad(ev.target.value)} autoFocus className={INP} /></div>
              </div>
              {dif !== 0 && (
                <p className={`text-sm font-medium ${dif > 0 ? 'text-green-600' : 'text-red-600'}`}>
                  Diferencia: {dif > 0 ? '+' : ''}{formatearCantidad(String(dif))} ({dif > 0 ? 'entra' : 'sale'} inventario)
                </p>
              )}
              <div><label className="mb-1 block text-xs font-medium text-gray-500">Motivo *</label>
                <select value={motivoId} onChange={(ev) => setMotivoId(Number(ev.target.value))} className={INP}>
                  {(motivos.data ?? []).map((m) => <option key={m.id} value={m.id}>{m.nombre}</option>)}
                </select></div>
              <div><label className="mb-1 block text-xs font-medium text-gray-500">Observaciones</label>
                <input value={observaciones} onChange={(ev) => setObservaciones(ev.target.value)} className={INP} placeholder="Opcional" /></div>
            </div>
          );
        })()}
      </Modal>
    </div>
  );
}
const INP = 'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-amber-500 focus:outline-none dark:border-gray-600 dark:bg-gray-700';
