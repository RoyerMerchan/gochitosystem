/** Caja: todas las cajas de la sucursal con su estado, apertura, cierre y arqueo. */
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Wallet, DoorOpen, DoorClosed, Plus, Lock } from 'lucide-react';
import { obtener, crear } from '@/lib/axios';
import { ErrorApi } from '@/lib/errores';
import { Card, Cargando } from '@/components/ui/Feedback';
import { toast } from '@/store/toastStore';
import { useAuthStore } from '@/store/authStore';
import { formatearUSD, formatearBs, formatearFechaHora } from '@/lib/formato';

interface CajaEstado {
  caja_id: number;
  caja_nombre: string;
  turno_id: number | null;
  usuario_apertura_id: number | null;
  abierto_por: string | null;
  abierto_en: string | null;
  base_inicial_usd: string | null;
  base_inicial_bs: string | null;
}

export default function CajaPage() {
  const qc = useQueryClient();
  const usuario = useAuthStore((s) => s.usuario);
  const [abriendo, setAbriendo] = useState<number | null>(null); // caja_id en apertura
  const [baseUsd, setBaseUsd] = useState('');
  const [baseBs, setBaseBs] = useState('');
  const [cerrando, setCerrando] = useState<number | null>(null); // turno_id en cierre
  const [contUsd, setContUsd] = useState('');
  const [contBs, setContBs] = useState('');
  const [nuevaCaja, setNuevaCaja] = useState('');
  const [creando, setCreando] = useState(false);

  const cajas = useQuery({ queryKey: ['cajas-estado'], queryFn: () => obtener<CajaEstado[]>('/turnos-caja/cajas') });

  const refrescar = () => {
    qc.invalidateQueries({ queryKey: ['cajas-estado'] });
    qc.invalidateQueries({ queryKey: ['turno-activo'] });
  };

  const abrir = useMutation({
    mutationFn: (cajaId: number) => crear('/turnos-caja/abrir', { cajaId, baseInicialUsd: baseUsd || '0', baseInicialBs: baseBs || '0' }),
    onSuccess: () => { toast.exito('Turno abierto'); refrescar(); setAbriendo(null); setBaseUsd(''); setBaseBs(''); },
    onError: (e) => toast.error(e instanceof ErrorApi ? e.message : 'No se pudo abrir el turno'),
  });

  const cerrar = useMutation({
    mutationFn: (turnoId: number) => crear(`/turnos-caja/${turnoId}/cerrar`, { contadoUsd: contUsd || '0', contadoBs: contBs || '0' }),
    onSuccess: (r: unknown) => {
      const res = r as { diferencia_usd: string; diferencia_bs: string };
      toast.exito(`Turno cerrado · Diferencia: ${formatearUSD(res.diferencia_usd)} / ${formatearBs(res.diferencia_bs)}`);
      refrescar(); setCerrando(null); setContUsd(''); setContBs('');
    },
    onError: (e) => toast.error(e instanceof ErrorApi ? e.message : 'No se pudo cerrar el turno'),
  });

  const agregarCaja = useMutation({
    mutationFn: () => crear('/turnos-caja/cajas', { nombre: nuevaCaja.trim() }),
    onSuccess: () => { toast.exito('Caja creada'); refrescar(); setNuevaCaja(''); setCreando(false); },
    onError: (e) => toast.error(e instanceof ErrorApi ? e.message : 'No se pudo crear la caja'),
  });

  if (cajas.isLoading) return <Cargando />;
  const lista = cajas.data ?? [];

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Caja</h1>
          <p className="text-sm text-gray-500">El efectivo en USD y en Bs se cuadra por separado. Cada usuario opera su propia caja.</p>
        </div>
        {creando ? (
          <div className="flex items-center gap-2">
            <input autoFocus value={nuevaCaja} onChange={(e) => setNuevaCaja(e.target.value)} placeholder="Nombre de la caja" className={INP} />
            <button onClick={() => agregarCaja.mutate()} disabled={!nuevaCaja.trim() || agregarCaja.isPending} className="rounded-lg bg-amber-500 px-3 py-2 text-sm font-semibold text-white hover:bg-amber-600 disabled:opacity-50">Crear</button>
            <button onClick={() => { setCreando(false); setNuevaCaja(''); }} className="rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-600">Cancelar</button>
          </div>
        ) : (
          <button onClick={() => setCreando(true)} className="flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-2 text-sm hover:border-amber-400 dark:border-gray-600"><Plus className="h-4 w-4" /> Agregar caja</button>
        )}
      </div>

      {lista.map((c) => {
        const abierta = c.turno_id !== null;
        const esMia = abierta && c.usuario_apertura_id === usuario?.id;
        return (
          <Card key={c.caja_id}>
            <div className="flex items-center gap-3">
              <div className={`flex h-12 w-12 items-center justify-center rounded-xl text-white ${abierta ? 'bg-green-500' : 'bg-gray-400'}`}>
                <Wallet className="h-6 w-6" />
              </div>
              <div className="flex-1">
                <p className="font-semibold">{c.caja_nombre}</p>
                {abierta ? (
                  <p className="text-sm text-gray-500">
                    Abierta por <span className="font-medium text-gray-700 dark:text-gray-300">{c.abierto_por}</span> · {formatearFechaHora(c.abierto_en!)}
                  </p>
                ) : (
                  <p className="text-sm text-gray-400">Cerrada</p>
                )}
              </div>
              {abierta && (
                <span className="rounded-full bg-green-100 px-3 py-1 text-xs font-semibold text-green-700 dark:bg-green-900/30 dark:text-green-300">Abierta</span>
              )}
            </div>

            {abierta && (
              <div className="mt-3 grid grid-cols-2 gap-3 border-t border-gray-100 pt-3 text-sm dark:border-gray-700">
                <div><span className="text-gray-500">Base USD:</span> <span className="font-medium">{formatearUSD(c.base_inicial_usd ?? '0')}</span></div>
                <div><span className="text-gray-500">Base Bs:</span> <span className="font-medium">{formatearBs(c.base_inicial_bs ?? '0')}</span></div>
              </div>
            )}

            {/* Acciones */}
            {!abierta && abriendo !== c.caja_id && (
              <button onClick={() => { setAbriendo(c.caja_id); setBaseUsd(''); setBaseBs(''); }} className="mt-3 flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700">
                <DoorOpen className="h-4 w-4" /> Abrir turno
              </button>
            )}

            {!abierta && abriendo === c.caja_id && (
              <div className="mt-3 border-t border-gray-100 pt-3 dark:border-gray-700">
                <p className="mb-2 text-sm font-medium">Efectivo inicial</p>
                <div className="grid grid-cols-2 gap-3">
                  <div><label className="mb-1 block text-xs font-medium text-gray-500">Base inicial USD</label>
                    <input type="number" step="0.01" value={baseUsd} onChange={(e) => setBaseUsd(e.target.value)} className={INP} placeholder="0.00" /></div>
                  <div><label className="mb-1 block text-xs font-medium text-gray-500">Base inicial Bs</label>
                    <input type="number" step="0.01" value={baseBs} onChange={(e) => setBaseBs(e.target.value)} className={INP} placeholder="0.00" /></div>
                </div>
                <div className="mt-3 flex gap-2">
                  <button onClick={() => abrir.mutate(c.caja_id)} disabled={abrir.isPending} className="rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-50">Confirmar apertura</button>
                  <button onClick={() => setAbriendo(null)} className="rounded-lg border border-gray-300 px-4 py-2 text-sm dark:border-gray-600">Cancelar</button>
                </div>
              </div>
            )}

            {esMia && cerrando !== c.turno_id && (
              <button onClick={() => { setCerrando(c.turno_id); setContUsd(''); setContBs(''); }} className="mt-3 flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700">
                <DoorClosed className="h-4 w-4" /> Cerrar turno (arqueo)
              </button>
            )}

            {esMia && cerrando === c.turno_id && (
              <div className="mt-3 border-t border-gray-100 pt-3 dark:border-gray-700">
                <p className="mb-2 text-sm font-medium">Arqueo: efectivo contado</p>
                <div className="grid grid-cols-2 gap-3">
                  <div><label className="mb-1 block text-xs font-medium text-gray-500">Contado USD</label>
                    <input type="number" step="0.01" value={contUsd} onChange={(e) => setContUsd(e.target.value)} className={INP} placeholder="0.00" /></div>
                  <div><label className="mb-1 block text-xs font-medium text-gray-500">Contado Bs</label>
                    <input type="number" step="0.01" value={contBs} onChange={(e) => setContBs(e.target.value)} className={INP} placeholder="0.00" /></div>
                </div>
                <div className="mt-3 flex gap-2">
                  <button onClick={() => cerrar.mutate(c.turno_id!)} disabled={cerrar.isPending} className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50">Cerrar y arquear</button>
                  <button onClick={() => setCerrando(null)} className="rounded-lg border border-gray-300 px-4 py-2 text-sm dark:border-gray-600">Cancelar</button>
                </div>
              </div>
            )}

            {abierta && !esMia && (
              <p className="mt-3 flex items-center gap-1.5 border-t border-gray-100 pt-3 text-xs text-gray-400 dark:border-gray-700">
                <Lock className="h-3.5 w-3.5" /> Solo {c.abierto_por} puede cerrar esta caja.
              </p>
            )}
          </Card>
        );
      })}

      {lista.length === 0 && (
        <Card><p className="text-center text-sm text-gray-500">No hay cajas. Cree una con “Agregar caja”.</p></Card>
      )}
    </div>
  );
}
const INP = 'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-amber-500 focus:outline-none dark:border-gray-600 dark:bg-gray-700';
