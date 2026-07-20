/** Tasa del día: ver la vigente, registrarla e historial. */
import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { TrendingUp, Save } from 'lucide-react';
import { obtener, crear, obtenerPaginado } from '@/lib/axios';
import { ErrorApi } from '@/lib/errores';
import { Card, Cargando } from '@/components/ui/Feedback';
import { toast } from '@/store/toastStore';
import { useTasaStore } from '@/store/tasaStore';
import { formatearNumero, formatearFecha } from '@/lib/formato';
import type { TasaCambio } from '@/lib/tipos';

interface FilaTasa {
  id: number;
  fecha: string;
  tasa: string;
  fuente: string;
  es_correccion: number;
  usuario_nombre: string;
}

export default function TasasPage() {
  const qc = useQueryClient();
  const establecerTasa = useTasaStore((s) => s.establecer);
  const [valor, setValor] = useState('');

  const vigente = useQuery({
    queryKey: ['tasa', 'vigente'],
    queryFn: () => obtener<TasaCambio | null>('/tasas-cambio/vigente'),
  });

  const historial = useQuery({
    queryKey: ['tasa', 'historial'],
    queryFn: () => obtenerPaginado<FilaTasa>('/tasas-cambio?limite=15'),
  });

  useEffect(() => {
    if (vigente.data) establecerTasa(vigente.data);
  }, [vigente.data, establecerTasa]);

  const registrar = useMutation({
    mutationFn: (tasa: string) => crear<TasaCambio>('/tasas-cambio', { tasa }),
    onSuccess: (t) => {
      toast.exito(`Tasa registrada: Bs ${formatearNumero(t.tasa, 2)} / $`);
      establecerTasa(t);
      setValor('');
      qc.invalidateQueries({ queryKey: ['tasa'] });
    },
    onError: (e) => toast.error(e instanceof ErrorApi ? e.message : 'No se pudo registrar la tasa'),
  });

  /** Corrige la tasa de hoy (crea una corrección y reemplaza la vigente). */
  const corregir = useMutation({
    mutationFn: (tasa: string) => crear<TasaCambio>(`/tasas-cambio/${vigente.data!.id}/corregir`, { tasa }),
    onSuccess: (t) => {
      toast.exito(`Tasa actualizada: Bs ${formatearNumero(t.tasa, 2)} / $`);
      establecerTasa(t);
      setValor('');
      qc.invalidateQueries({ queryKey: ['tasa'] });
    },
    onError: (e) => toast.error(e instanceof ErrorApi ? e.message : 'No se pudo actualizar la tasa'),
  });

  const guardando = registrar.isPending || corregir.isPending;
  const guardar = () => {
    if (vigente.data) corregir.mutate(valor);
    else registrar.mutate(valor);
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Tasa del día</h1>
        <p className="text-sm text-gray-500">Bolívares por cada dólar. Se congela en cada venta.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <p className="text-xs uppercase tracking-wide text-gray-500">Tasa vigente hoy</p>
          {vigente.isLoading ? (
            <Cargando />
          ) : vigente.data ? (
            <div className="mt-2 flex items-center gap-3">
              <TrendingUp className="h-10 w-10 text-green-500" />
              <div>
                <p className="text-3xl font-bold tabular-nums">Bs {formatearNumero(vigente.data.tasa, 2)}</p>
                <p className="text-xs text-gray-400">por 1 USD · {formatearFecha(vigente.data.fecha)}</p>
              </div>
            </div>
          ) : (
            <p className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-900/30 dark:text-red-300">
              No hay tasa registrada hoy. Regístrela para poder vender.
            </p>
          )}
        </Card>

        <Card>
          <p className="text-xs uppercase tracking-wide text-gray-500">
            {vigente.data ? 'Actualizar tasa de hoy' : 'Registrar tasa de hoy'}
          </p>
          <div className="mt-2 flex items-end gap-2">
            <div className="flex-1">
              <label className="text-xs text-gray-400">Bs por 1 USD</label>
              <input
                type="number"
                step="0.01"
                value={valor}
                onChange={(e) => setValor(e.target.value)}
                placeholder={vigente.data ? `Actual: ${formatearNumero(vigente.data.tasa, 2)}` : '36.50'}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-lg tabular-nums focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-200 dark:border-gray-600 dark:bg-gray-700"
              />
            </div>
            <button
              onClick={guardar}
              disabled={!valor || Number(valor) <= 0 || guardando}
              className="flex items-center gap-2 rounded-lg bg-amber-500 px-4 py-2.5 font-semibold text-white hover:bg-amber-600 disabled:opacity-40"
            >
              <Save className="h-4 w-4" />
              {vigente.data ? 'Actualizar' : 'Guardar'}
            </button>
          </div>
        </Card>
      </div>

      <Card padding={false}>
        <div className="border-b border-gray-100 p-4 dark:border-gray-700">
          <h2 className="font-semibold">Historial de tasas</h2>
        </div>
        {historial.isLoading ? (
          <Cargando />
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs uppercase text-gray-500 dark:bg-gray-700/50">
              <tr>
                <th className="p-3 text-left">Fecha</th>
                <th className="p-3 text-right">Tasa (Bs/$)</th>
                <th className="p-3 text-left">Fuente</th>
                <th className="p-3 text-left">Registró</th>
              </tr>
            </thead>
            <tbody>
              {(historial.data?.datos ?? []).map((t) => (
                <tr key={t.id} className="border-t border-gray-100 dark:border-gray-700">
                  <td className="p-3">{formatearFecha(t.fecha)}</td>
                  <td className="p-3 text-right font-medium tabular-nums">{formatearNumero(t.tasa, 2)}</td>
                  <td className="p-3">{t.fuente}{t.es_correccion === 1 ? ' (corrección)' : ''}</td>
                  <td className="p-3 text-gray-500">{t.usuario_nombre}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
