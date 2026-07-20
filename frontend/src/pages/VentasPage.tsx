/** Historial de ventas con método de pago, filtros y anulación. */
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Receipt, Ban, Filter, X } from 'lucide-react';
import { obtenerPaginado, crear } from '@/lib/axios';
import { ErrorApi } from '@/lib/errores';
import { Card, Cargando, Badge, EmptyState } from '@/components/ui/Feedback';
import { Modal } from '@/components/ui/Modal';
import { toast } from '@/store/toastStore';
import { useAuthStore } from '@/store/authStore';
import { METODOS_PAGO } from '@/features/pos/metodosPago';
import { formatearUSD, formatearBs, formatearFechaHora } from '@/lib/formato';

interface VentaFila {
  id: number; numero: string; fecha: string; total_usd: string; total_bs: string;
  utilidad_total: string; estado: string; es_credito: number; cliente: string; cajero: string;
  metodos_pago: string | null;
}

export default function VentasPage() {
  const qc = useQueryClient();
  const puedeAnular = useAuthStore((s) => s.permisos.includes('ventas.anular'));
  const [anular, setAnular] = useState<VentaFila | null>(null);
  const [motivo, setMotivo] = useState('');
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');
  const [metodoPagoId, setMetodoPagoId] = useState('');

  const params = new URLSearchParams({ limite: '100' });
  if (desde) params.set('desde', desde);
  if (hasta) params.set('hasta', hasta);
  if (metodoPagoId) params.set('metodoPagoId', metodoPagoId);

  const ventas = useQuery({
    queryKey: ['ventas', 'lista', desde, hasta, metodoPagoId],
    queryFn: () => obtenerPaginado<VentaFila>(`/ventas?${params.toString()}`),
  });

  const anularVenta = useMutation({
    mutationFn: () => crear(`/ventas/${anular!.id}/anular`, { motivo }),
    onSuccess: () => {
      toast.exito('Venta anulada · stock reingresado');
      qc.invalidateQueries({ queryKey: ['ventas'] });
      setAnular(null); setMotivo('');
    },
    onError: (e) => toast.error(e instanceof ErrorApi ? e.message : 'No se pudo anular'),
  });

  const limpiarFiltros = () => { setDesde(''); setHasta(''); setMetodoPagoId(''); };
  const hayFiltros = desde || hasta || metodoPagoId;
  const filas = ventas.data?.datos ?? [];

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Ventas</h1>
        <p className="text-sm text-gray-500">{ventas.data?.meta.total ?? 0} ventas{hayFiltros ? ' (filtradas)' : ' registradas'}</p>
      </div>

      {/* Filtros */}
      <Card>
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="mb-1 flex items-center gap-1 text-xs font-medium text-gray-500"><Filter className="h-3.5 w-3.5" /> Desde</label>
            <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} className={INP} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-500">Hasta</label>
            <input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} className={INP} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-500">Método de pago</label>
            <select value={metodoPagoId} onChange={(e) => setMetodoPagoId(e.target.value)} className={INP}>
              <option value="">Todos</option>
              {METODOS_PAGO.map((m) => <option key={m.id} value={m.id}>{m.nombre}</option>)}
            </select>
          </div>
          {hayFiltros && (
            <button onClick={limpiarFiltros} className="flex items-center gap-1 rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-600 hover:bg-gray-100 dark:border-gray-600 dark:hover:bg-gray-700">
              <X className="h-4 w-4" /> Limpiar
            </button>
          )}
        </div>
      </Card>

      <Card padding={false}>
        {ventas.isLoading ? <Cargando /> : filas.length === 0 ? (
          <EmptyState titulo="Sin ventas" descripcion={hayFiltros ? 'Ninguna venta coincide con los filtros.' : 'Aún no hay ventas.'} icono={<Receipt className="h-12 w-12" />} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs uppercase text-gray-500 dark:bg-gray-700/50">
                <tr>
                  <th className="p-3 text-left">N.º</th><th className="p-3 text-left">Fecha</th>
                  <th className="p-3 text-left">Cliente</th><th className="p-3 text-left">Método de pago</th>
                  <th className="p-3 text-right">Total USD</th><th className="p-3 text-right">Total Bs</th>
                  <th className="p-3 text-right">Utilidad</th><th className="p-3 text-center">Estado</th><th className="p-3"></th>
                </tr>
              </thead>
              <tbody>
                {filas.map((v) => (
                  <tr key={v.id} className="border-t border-gray-100 dark:border-gray-700">
                    <td className="p-3 font-medium">{v.numero}</td>
                    <td className="p-3 text-gray-500">{formatearFechaHora(v.fecha)}</td>
                    <td className="p-3">{v.cliente}</td>
                    <td className="p-3 text-gray-600 dark:text-gray-300">{v.metodos_pago ?? (v.es_credito === 1 ? 'Crédito' : '—')}</td>
                    <td className="p-3 text-right tabular-nums">{formatearUSD(v.total_usd)}</td>
                    <td className="p-3 text-right tabular-nums text-gray-500">{formatearBs(v.total_bs)}</td>
                    <td className="p-3 text-right tabular-nums text-green-600">{formatearUSD(v.utilidad_total)}</td>
                    <td className="p-3 text-center">
                      {v.estado === 'ANULADA' ? <Badge color="rojo">Anulada</Badge>
                        : v.es_credito === 1 ? <Badge color="amarillo">Crédito</Badge>
                        : <Badge color="verde">Pagada</Badge>}
                    </td>
                    <td className="p-3 text-right">
                      {puedeAnular && v.estado !== 'ANULADA' && (
                        <button onClick={() => { setAnular(v); setMotivo(''); }} className="text-gray-400 hover:text-red-500" title="Anular venta">
                          <Ban className="h-4 w-4" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Modal abierto={Boolean(anular)} onCerrar={() => setAnular(null)} titulo={`Anular venta ${anular?.numero ?? ''}`}
        pie={
          <div className="flex justify-end gap-2">
            <button onClick={() => setAnular(null)} className="rounded-lg border border-gray-300 px-4 py-2 text-sm dark:border-gray-600">Cancelar</button>
            <button onClick={() => anularVenta.mutate()} disabled={motivo.trim().length < 3 || anularVenta.isPending}
              className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50">Anular venta</button>
          </div>
        }>
        <p className="mb-3 text-sm text-gray-500">
          Se reingresará el stock de los productos y, si fue a crédito, se revertirá la deuda del cliente.
          La venta no se borra: queda registrada como anulada.
        </p>
        <label className="mb-1 block text-xs font-medium text-gray-500">Motivo de la anulación</label>
        <input value={motivo} onChange={(e) => setMotivo(e.target.value)} autoFocus
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-red-500 focus:outline-none dark:border-gray-600 dark:bg-gray-700"
          placeholder="Ej: error del cajero, cliente se arrepintió…" />
      </Modal>
    </div>
  );
}
const INP = 'rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-amber-500 focus:outline-none dark:border-gray-600 dark:bg-gray-700';
