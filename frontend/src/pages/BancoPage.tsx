/**
 * Correlación con banco.
 *
 * Apartado APARTE del resto del sistema: aquí se anota a mano lo que el banco
 * reporta cada día (Bs y $) y se contrasta contra lo que el sistema dice que
 * debió entrar (cobros por métodos que no son efectivo ni fiado). Nada de lo que
 * se cargue aquí toca la caja, las ventas, la cartera, los reportes ni el
 * dashboard: sus números no cambian por esto.
 */
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Landmark, Save, Trash2 } from 'lucide-react';
import { obtener, reemplazar, eliminar } from '@/lib/axios';
import { ErrorApi } from '@/lib/errores';
import { Card, Cargando, EmptyState } from '@/components/ui/Feedback';
import { FiltroPeriodo } from '@/components/ui/FiltroPeriodo';
import { useConfirm } from '@/hooks/useConfirm';
import { toast } from '@/store/toastStore';
import { formatearUSD, formatearBs, formatearFecha, aNumero, dayjs } from '@/lib/formato';

interface DiaBanco {
  fecha: string;
  saldo_bs: string | null;
  saldo_usd: string | null;
  observaciones: string | null;
  entrada_bs: string;
  entrada_usd: string;
  variacion_bs: string | null;
  variacion_usd: string | null;
}

interface ResumenBanco {
  ultima_fecha: string | null;
  ultimo_saldo_bs: string | null;
  ultimo_saldo_usd: string | null;
  entradas_bs: string;
  entradas_usd: string;
  dias_registrados: number;
}

interface RespuestaBanco {
  dias: DiaBanco[];
  resumen: ResumenBanco;
  metodos: { nombre: string; moneda: string }[];
}

const INP =
  'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700';

const HOY = () => dayjs().format('YYYY-MM-DD');

export default function BancoPage() {
  const qc = useQueryClient();
  const confirm = useConfirm();
  const [desde, setDesde] = useState(dayjs().subtract(29, 'day').format('YYYY-MM-DD'));
  const [hasta, setHasta] = useState(HOY());

  const [fecha, setFecha] = useState(HOY());
  const [saldoBs, setSaldoBs] = useState('');
  const [saldoUsd, setSaldoUsd] = useState('');
  const [observaciones, setObservaciones] = useState('');

  const datos = useQuery({
    queryKey: ['banco', desde, hasta],
    queryFn: () => obtener<RespuestaBanco>(`/banco?desde=${desde}&hasta=${hasta}`),
  });

  const guardar = useMutation({
    mutationFn: () =>
      reemplazar(`/banco/${fecha}`, {
        saldoBs: saldoBs.trim() || '0',
        saldoUsd: saldoUsd.trim() || '0',
        observaciones: observaciones.trim() || null,
      }),
    onSuccess: () => {
      toast.exito(`Saldo del ${formatearFecha(fecha)} guardado`);
      setSaldoBs(''); setSaldoUsd(''); setObservaciones('');
      qc.invalidateQueries({ queryKey: ['banco'] });
    },
    onError: (e) => toast.error(e instanceof ErrorApi ? e.message : 'No se pudo guardar el saldo'),
  });

  const borrar = useMutation({
    mutationFn: (f: string) => eliminar(`/banco/${f}`),
    onSuccess: () => {
      toast.exito('Registro eliminado');
      qc.invalidateQueries({ queryKey: ['banco'] });
    },
    onError: (e) => toast.error(e instanceof ErrorApi ? e.message : 'No se pudo eliminar'),
  });

  /** Carga un día ya registrado en el formulario para corregirlo. */
  const editar = (d: DiaBanco) => {
    setFecha(d.fecha);
    setSaldoBs(d.saldo_bs ?? '');
    setSaldoUsd(d.saldo_usd ?? '');
    setObservaciones(d.observaciones ?? '');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const pedirBorrar = async (d: DiaBanco) => {
    if (await confirm({
      titulo: 'Eliminar registro',
      mensaje: `¿Borrar el saldo bancario del ${formatearFecha(d.fecha)}? No afecta ninguna otra cifra del sistema.`,
      confirmar: 'Eliminar', peligro: true,
    })) borrar.mutate(d.fecha);
  };

  const r = datos.data?.resumen;
  const dias = datos.data?.dias ?? [];
  const metodos = datos.data?.metodos ?? [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold">
            <Landmark className="h-5 w-5 text-amber-500" /> Correlación con banco
          </h1>
          <p className="text-sm text-gray-500">
            Anota lo que el banco reporta cada día para cuadrarlo con lo cobrado. Es un
            apartado independiente: no altera caja, ventas ni reportes.
          </p>
        </div>
        <FiltroPeriodo desde={desde} hasta={hasta} onCambiar={(d, h) => { setDesde(d || dayjs().subtract(29, 'day').format('YYYY-MM-DD')); setHasta(h || HOY()); }} />
      </div>

      {/* Formulario del día */}
      <Card>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">
          Registrar saldo del día
        </h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <label className="block text-sm">
            <span className="mb-1 block text-gray-500">Fecha</span>
            <input type="date" value={fecha} max={HOY()} onChange={(e) => setFecha(e.target.value)} className={INP} />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-gray-500">Saldo en Bs</span>
            <input type="number" step="0.01" value={saldoBs} onChange={(e) => setSaldoBs(e.target.value)} placeholder="0,00" className={INP} />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-gray-500">Saldo en $</span>
            <input type="number" step="0.01" value={saldoUsd} onChange={(e) => setSaldoUsd(e.target.value)} placeholder="0.00" className={INP} />
          </label>
          <label className="block text-sm lg:col-span-2">
            <span className="mb-1 block text-gray-500">Nota (opcional)</span>
            <div className="flex gap-2">
              <input value={observaciones} onChange={(e) => setObservaciones(e.target.value)} placeholder="Banco, referencia…" className={INP} />
              <button
                onClick={() => guardar.mutate()}
                disabled={!fecha || guardar.isPending}
                className="flex shrink-0 items-center gap-1.5 rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-600 disabled:opacity-50"
              >
                <Save className="h-4 w-4" /> {guardar.isPending ? 'Guardando…' : 'Guardar'}
              </button>
            </div>
          </label>
        </div>
        <p className="mt-2 text-xs text-gray-400">
          Registrar dos veces el mismo día lo actualiza; no se duplica.
        </p>
      </Card>

      {/* Estadística propia del apartado */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <p className="text-xs uppercase tracking-wide text-gray-500">Último saldo declarado</p>
          <p className="mt-1 text-2xl font-bold tabular-nums">{formatearBs(r?.ultimo_saldo_bs ?? 0)}</p>
          <p className="text-sm text-gray-500 tabular-nums">{formatearUSD(r?.ultimo_saldo_usd ?? 0)}</p>
          <p className="mt-1 text-xs text-gray-400">
            {r?.ultima_fecha ? formatearFecha(r.ultima_fecha) : 'Sin registros aún'}
          </p>
        </Card>
        <Card>
          <p className="text-xs uppercase tracking-wide text-gray-500">Debió entrar al banco</p>
          <p className="mt-1 text-2xl font-bold tabular-nums text-green-600">{formatearBs(r?.entradas_bs ?? 0)}</p>
          <p className="text-sm text-gray-500 tabular-nums">{formatearUSD(r?.entradas_usd ?? 0)}</p>
          <p className="mt-1 text-xs text-gray-400">Cobrado en el período por métodos bancarios</p>
        </Card>
        <Card>
          <p className="text-xs uppercase tracking-wide text-gray-500">Días registrados</p>
          <p className="mt-1 text-2xl font-bold tabular-nums">
            {r?.dias_registrados ?? 0}<span className="text-base font-normal text-gray-400"> / {dias.length}</span>
          </p>
          <p className="mt-1 text-xs text-gray-400">Los días en blanco son los que faltan por anotar</p>
        </Card>
        <Card>
          <p className="text-xs uppercase tracking-wide text-gray-500">Métodos que cuentan</p>
          <p className="mt-1 text-sm">{metodos.length > 0 ? metodos.map((m) => m.nombre).join(', ') : '—'}</p>
          <p className="mt-1 text-xs text-gray-400">Todo lo que no es efectivo ni fiado</p>
        </Card>
      </div>

      {/* Detalle por día */}
      <Card padding={false}>
        {datos.isLoading ? (
          <div className="p-6"><Cargando /></div>
        ) : dias.length === 0 ? (
          <EmptyState titulo="Sin días en el período" descripcion="Ajusta el rango de fechas." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-gray-200 text-left text-xs uppercase tracking-wide text-gray-500 dark:border-gray-700">
                <tr>
                  <th className="p-3">Fecha</th>
                  <th className="p-3 text-right">Saldo declarado</th>
                  <th className="p-3 text-right">Variación vs. día anterior</th>
                  <th className="p-3 text-right">Debió entrar</th>
                  <th className="p-3 text-right">Diferencia</th>
                  <th className="p-3">Nota</th>
                  <th className="p-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                {dias.map((d) => {
                  const registrado = d.saldo_bs !== null;
                  // La diferencia solo tiene sentido si hay con qué comparar: hace
                  // falta el saldo de hoy Y el del día registrado anterior.
                  const hayVariacion = d.variacion_bs !== null || d.variacion_usd !== null;
                  const difBs = hayVariacion ? aNumero(d.variacion_bs) - aNumero(d.entrada_bs) : null;
                  const difUsd = hayVariacion ? aNumero(d.variacion_usd) - aNumero(d.entrada_usd) : null;
                  const cuadra = difBs !== null && Math.abs(difBs) < 0.01 && Math.abs(difUsd ?? 0) < 0.01;

                  return (
                    <tr key={d.fecha} className={registrado ? '' : 'bg-gray-50/60 dark:bg-gray-900/30'}>
                      <td className="p-3 whitespace-nowrap">
                        {formatearFecha(d.fecha)}
                        {!registrado && <span className="ml-2 text-xs text-amber-600">sin registrar</span>}
                      </td>
                      <td className="p-3 text-right tabular-nums">
                        {registrado ? (
                          <>
                            <div className="font-semibold">{formatearBs(d.saldo_bs)}</div>
                            <div className="text-xs text-gray-400">{formatearUSD(d.saldo_usd)}</div>
                          </>
                        ) : <span className="text-gray-400">—</span>}
                      </td>
                      <td className="p-3 text-right tabular-nums">
                        {hayVariacion ? (
                          <>
                            <div>{formatearBs(d.variacion_bs)}</div>
                            <div className="text-xs text-gray-400">{formatearUSD(d.variacion_usd)}</div>
                          </>
                        ) : <span className="text-gray-400">—</span>}
                      </td>
                      <td className="p-3 text-right tabular-nums">
                        <div>{formatearBs(d.entrada_bs)}</div>
                        <div className="text-xs text-gray-400">{formatearUSD(d.entrada_usd)}</div>
                      </td>
                      <td className="p-3 text-right tabular-nums">
                        {difBs === null ? (
                          <span className="text-gray-400">—</span>
                        ) : (
                          <div className={cuadra ? 'text-green-600' : 'text-amber-600'}>
                            <div className="font-semibold">{formatearBs(difBs)}</div>
                            <div className="text-xs opacity-80">{formatearUSD(difUsd ?? 0)}</div>
                          </div>
                        )}
                      </td>
                      <td className="p-3 text-gray-500">{d.observaciones ?? ''}</td>
                      <td className="p-3">
                        <div className="flex justify-end gap-2">
                          <button onClick={() => editar(d)} className="text-xs font-medium text-amber-600 hover:underline">
                            {registrado ? 'Corregir' : 'Anotar'}
                          </button>
                          {registrado && (
                            <button onClick={() => pedirBorrar(d)} className="text-gray-400 hover:text-red-500">
                              <Trash2 className="h-4 w-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <p className="text-xs text-gray-400">
        «Debió entrar» suma los cobros del día por métodos bancarios, de ventas y de abonos,
        sin contar ventas anuladas. La diferencia compara ese monto contra cuánto se movió tu
        saldo declarado respecto al día anterior que anotaste.
      </p>
    </div>
  );
}
