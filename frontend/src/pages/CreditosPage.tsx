/** Cartera: clientes con deuda, antigüedad de saldos y registro de abonos. */
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { CreditCard, HandCoins } from 'lucide-react';
import { obtener, crear } from '@/lib/axios';
import { ErrorApi } from '@/lib/errores';
import { Card, Cargando, EmptyState } from '@/components/ui/Feedback';
import { Modal } from '@/components/ui/Modal';
import { toast } from '@/store/toastStore';
import { useTasaStore } from '@/store/tasaStore';
import { formatearUSD, formatearBs } from '@/lib/formato';
import { METODOS_PAGO } from '@/features/pos/metodosPago';

interface FilaCartera {
  cliente_id: number; nombre: string; documento: string | null; saldo_usd: string;
  por_vencer: string; d1_30: string; d31_60: string; d61_90: string; d90_mas: string;
}

export default function CreditosPage() {
  const qc = useQueryClient();
  const tasa = useTasaStore((s) => s.tasa);
  const tasaNum = tasa ? Number(tasa.tasa) : 0;
  const [abonar, setAbonar] = useState<FilaCartera | null>(null);
  const [metodoId, setMetodoId] = useState(3);
  const [monto, setMonto] = useState('');
  const [referencia, setReferencia] = useState('');

  const cartera = useQuery({
    queryKey: ['cartera'],
    queryFn: () => obtener<FilaCartera[]>('/creditos/cartera'),
  });

  const metodo = METODOS_PAGO.find((m) => m.id === metodoId)!;

  const registrarAbono = useMutation({
    mutationFn: () => crear('/abonos', {
      clienteId: abonar!.cliente_id, metodoPagoId: metodoId, moneda: metodo.moneda,
      montoMoneda: monto, referencia: referencia || undefined,
    }),
    onSuccess: () => {
      toast.exito('Abono registrado');
      qc.invalidateQueries({ queryKey: ['cartera'] });
      setAbonar(null); setMonto(''); setReferencia('');
    },
    onError: (e) => toast.error(e instanceof ErrorApi ? e.message : 'No se pudo registrar el abono'),
  });

  const totalCartera = (cartera.data ?? []).reduce((a, c) => a + Number(c.saldo_usd), 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Créditos y cartera</h1>
          <p className="text-sm text-gray-500">Deuda total: {formatearUSD(totalCartera)} · {formatearBs(totalCartera * tasaNum)}</p>
        </div>
      </div>

      <Card padding={false}>
        {cartera.isLoading ? <Cargando /> : (cartera.data ?? []).length === 0 ? (
          <EmptyState titulo="Sin cartera pendiente" descripcion="Ningún cliente tiene deuda." icono={<CreditCard className="h-12 w-12" />} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs uppercase text-gray-500 dark:bg-gray-700/50">
                <tr>
                  <th className="p-3 text-left">Cliente</th>
                  <th className="p-3 text-right">Por vencer</th>
                  <th className="p-3 text-right">1-30</th>
                  <th className="p-3 text-right">31-60</th>
                  <th className="p-3 text-right">61-90</th>
                  <th className="p-3 text-right">+90</th>
                  <th className="p-3 text-right">Saldo total</th>
                  <th className="p-3"></th>
                </tr>
              </thead>
              <tbody>
                {cartera.data!.map((c) => (
                  <tr key={c.cliente_id} className="border-t border-gray-100 dark:border-gray-700">
                    <td className="p-3 font-medium">{c.nombre}</td>
                    <td className="p-3 text-right tabular-nums text-gray-500">{formatearUSD(c.por_vencer, false)}</td>
                    <td className="p-3 text-right tabular-nums">{formatearUSD(c.d1_30, false)}</td>
                    <td className="p-3 text-right tabular-nums text-amber-600">{formatearUSD(c.d31_60, false)}</td>
                    <td className="p-3 text-right tabular-nums text-orange-600">{formatearUSD(c.d61_90, false)}</td>
                    <td className="p-3 text-right tabular-nums font-semibold text-red-600">{formatearUSD(c.d90_mas, false)}</td>
                    <td className="p-3 text-right tabular-nums font-bold">{formatearUSD(c.saldo_usd)}</td>
                    <td className="p-3 text-right">
                      <button onClick={() => { setAbonar(c); setMonto(''); }} className="flex items-center gap-1 rounded-lg bg-green-600 px-3 py-1 text-xs font-semibold text-white hover:bg-green-700">
                        <HandCoins className="h-3.5 w-3.5" /> Abonar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Modal abierto={Boolean(abonar)} onCerrar={() => setAbonar(null)} titulo={`Abono de ${abonar?.nombre ?? ''}`}
        pie={
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-500">Saldo: {formatearUSD(abonar?.saldo_usd ?? 0)}</span>
            <button onClick={() => registrarAbono.mutate()} disabled={!monto || Number(monto) <= 0 || registrarAbono.isPending || (metodo.requiereReferencia && !referencia)}
              className="rounded-lg bg-green-600 px-5 py-2 font-semibold text-white hover:bg-green-700 disabled:opacity-50">Registrar abono</button>
          </div>
        }>
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-500">Método de pago</label>
            <select value={metodoId} onChange={(e) => setMetodoId(Number(e.target.value))} className={INP}>
              {METODOS_PAGO.filter((m) => !m.esCredito).map((m) => <option key={m.id} value={m.id}>{m.nombre} ({m.moneda})</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-500">Monto en {metodo.moneda === 'USD' ? 'dólares' : 'bolívares'}</label>
            <input type="number" step="0.01" value={monto} onChange={(e) => setMonto(e.target.value)} className={INP} placeholder="0.00" autoFocus />
            {metodo.moneda === 'VES' && monto && tasaNum > 0 && (
              <p className="mt-1 text-xs text-gray-400">≈ {formatearUSD(Number(monto) / tasaNum)} a la tasa de hoy</p>
            )}
          </div>
          {metodo.requiereReferencia && (
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-500">Referencia</label>
              <input value={referencia} onChange={(e) => setReferencia(e.target.value)} className={INP} placeholder="N.º de referencia" />
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
}

const INP = 'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-amber-500 focus:outline-none dark:border-gray-600 dark:bg-gray-700';
