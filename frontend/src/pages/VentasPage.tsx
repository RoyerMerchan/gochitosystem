/** Historial de ventas con totales USD/Bs y anulación. */
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Receipt, Ban } from 'lucide-react';
import { obtenerPaginado, crear } from '@/lib/axios';
import { ErrorApi } from '@/lib/errores';
import { Card, Cargando, Badge, EmptyState } from '@/components/ui/Feedback';
import { Modal } from '@/components/ui/Modal';
import { toast } from '@/store/toastStore';
import { useAuthStore } from '@/store/authStore';
import { formatearUSD, formatearBs, formatearFechaHora } from '@/lib/formato';

interface VentaFila {
  id: number; numero: string; fecha: string; total_usd: string; total_bs: string;
  utilidad_total: string; estado: string; es_credito: number; cliente: string; cajero: string;
}

export default function VentasPage() {
  const qc = useQueryClient();
  const puedeAnular = useAuthStore((s) => s.permisos.includes('ventas.anular'));
  const [anular, setAnular] = useState<VentaFila | null>(null);
  const [motivo, setMotivo] = useState('');

  const ventas = useQuery({
    queryKey: ['ventas', 'lista'],
    queryFn: () => obtenerPaginado<VentaFila>('/ventas?limite=50'),
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

  const filas = ventas.data?.datos ?? [];

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Ventas</h1>
        <p className="text-sm text-gray-500">{ventas.data?.meta.total ?? 0} ventas registradas</p>
      </div>

      <Card padding={false}>
        {ventas.isLoading ? <Cargando /> : filas.length === 0 ? (
          <EmptyState titulo="Sin ventas todavía" icono={<Receipt className="h-12 w-12" />} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs uppercase text-gray-500 dark:bg-gray-700/50">
                <tr>
                  <th className="p-3 text-left">N.º</th><th className="p-3 text-left">Fecha</th>
                  <th className="p-3 text-left">Cliente</th><th className="p-3 text-left">Cajero</th>
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
                    <td className="p-3 text-gray-500">{v.cajero}</td>
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
