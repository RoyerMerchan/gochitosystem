/** Caja: turno activo, apertura, movimientos y cierre con arqueo por moneda. */
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Wallet, DoorOpen, DoorClosed } from 'lucide-react';
import { obtener, crear } from '@/lib/axios';
import { ErrorApi } from '@/lib/errores';
import { Card, Cargando } from '@/components/ui/Feedback';
import { toast } from '@/store/toastStore';
import { formatearUSD, formatearBs, formatearFechaHora } from '@/lib/formato';

interface Turno {
  id: number; caja_nombre: string; abierto_en: string;
  base_inicial_usd: string; base_inicial_bs: string;
}

export default function CajaPage() {
  const qc = useQueryClient();
  const [baseUsd, setBaseUsd] = useState('');
  const [baseBs, setBaseBs] = useState('');
  const [contUsd, setContUsd] = useState('');
  const [contBs, setContBs] = useState('');

  const turno = useQuery({ queryKey: ['turno-activo'], queryFn: () => obtener<Turno | null>('/turnos-caja/activo') });

  const abrir = useMutation({
    mutationFn: () => crear('/turnos-caja/abrir', { cajaId: 1, baseInicialUsd: baseUsd || '0', baseInicialBs: baseBs || '0' }),
    onSuccess: () => { toast.exito('Turno abierto'); qc.invalidateQueries({ queryKey: ['turno-activo'] }); setBaseUsd(''); setBaseBs(''); },
    onError: (e) => toast.error(e instanceof ErrorApi ? e.message : 'No se pudo abrir el turno'),
  });

  const cerrar = useMutation({
    mutationFn: () => crear(`/turnos-caja/${turno.data!.id}/cerrar`, { contadoUsd: contUsd || '0', contadoBs: contBs || '0' }),
    onSuccess: (r: unknown) => {
      const res = r as { diferencia_usd: string; diferencia_bs: string };
      toast.exito(`Turno cerrado · Diferencia: ${formatearUSD(res.diferencia_usd)} / ${formatearBs(res.diferencia_bs)}`);
      qc.invalidateQueries({ queryKey: ['turno-activo'] }); setContUsd(''); setContBs('');
    },
    onError: (e) => toast.error(e instanceof ErrorApi ? e.message : 'No se pudo cerrar el turno'),
  });

  if (turno.isLoading) return <Cargando />;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Caja</h1>
        <p className="text-sm text-gray-500">El efectivo en USD y en Bs se cuadra por separado.</p>
      </div>

      {turno.data ? (
        <>
          <Card>
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-green-500 text-white"><Wallet className="h-6 w-6" /></div>
              <div>
                <p className="font-semibold">Turno abierto · {turno.data.caja_nombre}</p>
                <p className="text-sm text-gray-500">Desde {formatearFechaHora(turno.data.abierto_en)}</p>
              </div>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-3 border-t border-gray-100 pt-3 text-sm dark:border-gray-700">
              <div><span className="text-gray-500">Base USD:</span> <span className="font-medium">{formatearUSD(turno.data.base_inicial_usd)}</span></div>
              <div><span className="text-gray-500">Base Bs:</span> <span className="font-medium">{formatearBs(turno.data.base_inicial_bs)}</span></div>
            </div>
          </Card>

          <Card>
            <h2 className="mb-3 flex items-center gap-2 font-semibold"><DoorClosed className="h-5 w-5" /> Cerrar turno (arqueo)</h2>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="mb-1 block text-xs font-medium text-gray-500">Efectivo contado USD</label>
                <input type="number" step="0.01" value={contUsd} onChange={(e) => setContUsd(e.target.value)} className={INP} placeholder="0.00" /></div>
              <div><label className="mb-1 block text-xs font-medium text-gray-500">Efectivo contado Bs</label>
                <input type="number" step="0.01" value={contBs} onChange={(e) => setContBs(e.target.value)} className={INP} placeholder="0.00" /></div>
            </div>
            <button onClick={() => cerrar.mutate()} disabled={cerrar.isPending} className="mt-4 w-full rounded-lg bg-red-600 py-2.5 font-semibold text-white hover:bg-red-700 disabled:opacity-50">Cerrar turno y arquear</button>
          </Card>
        </>
      ) : (
        <Card>
          <h2 className="mb-3 flex items-center gap-2 font-semibold"><DoorOpen className="h-5 w-5" /> Abrir turno</h2>
          <p className="mb-3 text-sm text-gray-500">Registre el efectivo inicial con el que abre la caja.</p>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="mb-1 block text-xs font-medium text-gray-500">Base inicial USD</label>
              <input type="number" step="0.01" value={baseUsd} onChange={(e) => setBaseUsd(e.target.value)} className={INP} placeholder="0.00" /></div>
            <div><label className="mb-1 block text-xs font-medium text-gray-500">Base inicial Bs</label>
              <input type="number" step="0.01" value={baseBs} onChange={(e) => setBaseBs(e.target.value)} className={INP} placeholder="0.00" /></div>
          </div>
          <button onClick={() => abrir.mutate()} disabled={abrir.isPending} className="mt-4 w-full rounded-lg bg-green-600 py-2.5 font-semibold text-white hover:bg-green-700 disabled:opacity-50">Abrir turno</button>
        </Card>
      )}
    </div>
  );
}
const INP = 'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-amber-500 focus:outline-none dark:border-gray-600 dark:bg-gray-700';
