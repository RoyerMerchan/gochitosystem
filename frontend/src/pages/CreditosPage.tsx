/** Cartera: clientes con deuda, antigüedad de saldos y registro de abonos. */
import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { CreditCard, HandCoins } from 'lucide-react';
import { obtener, crear } from '@/lib/axios';
import { ErrorApi } from '@/lib/errores';
import { Card, Cargando, EmptyState, Badge } from '@/components/ui/Feedback';
import { Modal } from '@/components/ui/Modal';
import { toast } from '@/store/toastStore';
import { useTasaStore } from '@/store/tasaStore';
import { formatearUSD, formatearBs, formatearFecha, aNumero } from '@/lib/formato';
import { METODOS_PAGO } from '@/features/pos/metodosPago';

interface FilaCartera {
  cliente_id: number; nombre: string; documento: string | null; saldo_usd: string;
  por_vencer: string; d1_30: string; d31_60: string; d61_90: string; d90_mas: string;
}

interface Deuda {
  id: number; documento: string | null; fecha_emision: string; fecha_vencimiento: string;
  monto_original_usd: string; saldo_usd: string; estado: string; dias_mora: number;
}

interface EstadoCuenta { creditos: Deuda[] }

const ESTADOS_VIVOS = ['PENDIENTE', 'PARCIAL', 'VENCIDO'];

/** Centavos hacia abajo: el backend convierte Bs -> USD truncando, aquí igual. */
const pisoCentavos = (n: number) => Math.floor(n * 100 + 1e-9) / 100;
/** Centavos hacia arriba: Bs mínimos que cubren un saldo en USD sin quedar corto. */
const techoCentavos = (n: number) => Math.ceil(n * 100 - 1e-9) / 100;

export default function CreditosPage() {
  const qc = useQueryClient();
  const tasa = useTasaStore((s) => s.tasa);
  const tasaNum = tasa ? Number(tasa.tasa) : 0;

  const [abonar, setAbonar] = useState<FilaCartera | null>(null);
  const [metodoId, setMetodoId] = useState(3);
  /** Facturas marcadas. Vacío = abonar a toda la deuda (FIFO). */
  const [seleccion, setSeleccion] = useState<number[]>([]);
  /** null = el monto lo manda la selección; string = el usuario escribió otro monto. */
  const [montoManual, setMontoManual] = useState<string | null>(null);
  const [referencia, setReferencia] = useState('');

  const cartera = useQuery({
    queryKey: ['cartera'],
    queryFn: () => obtener<FilaCartera[]>('/creditos/cartera'),
  });

  const cuenta = useQuery({
    queryKey: ['estado-cuenta', abonar?.cliente_id],
    queryFn: () => obtener<EstadoCuenta>(`/creditos/cliente/${abonar!.cliente_id}`),
    enabled: abonar !== null,
  });

  const metodo = METODOS_PAGO.find((m) => m.id === metodoId)!;
  const enBs = metodo.moneda === 'VES';

  // Deudas vivas, más antiguas primero (el backend ya las devuelve por fecha_emision).
  const deudas = useMemo(
    () => (cuenta.data?.creditos ?? []).filter((c) => ESTADOS_VIVOS.includes(c.estado)),
    [cuenta.data],
  );
  // Objetivo del abono: lo marcado, o todo si no hay nada marcado.
  const objetivo = seleccion.length > 0 ? deudas.filter((d) => seleccion.includes(d.id)) : deudas;
  const saldoObjetivo = objetivo.reduce((a, d) => a + aNumero(d.saldo_usd), 0);

  // Monto sugerido = pagar completo lo marcado, en la moneda del método.
  const montoSugerido = enBs && tasaNum > 0
    ? techoCentavos(saldoObjetivo * tasaNum).toFixed(2)
    : saldoObjetivo.toFixed(2);
  const monto = montoManual ?? montoSugerido;

  // Equivalente en USD con la misma aritmética del backend (piso + tolerancia de 1 centavo).
  const montoUsdCrudo = enBs
    ? (tasaNum > 0 ? pisoCentavos(aNumero(monto) / tasaNum) : 0)
    : pisoCentavos(aNumero(monto));
  const montoUsd = Math.abs(montoUsdCrudo - saldoObjetivo) <= 0.01 ? saldoObjetivo : montoUsdCrudo;
  const excede = montoUsd > saldoObjetivo;

  // Previsualización: cómo caería el abono factura por factura (FIFO).
  const aplicacion = useMemo(() => {
    const mapa = new Map<number, number>();
    let resto = montoUsd;
    for (const d of objetivo) {
      if (resto <= 0) break;
      const saldo = aNumero(d.saldo_usd);
      const aplica = Math.min(resto, saldo);
      mapa.set(d.id, aplica);
      resto -= aplica;
    }
    return mapa;
  }, [objetivo, montoUsd]);

  const abrir = (c: FilaCartera) => {
    setAbonar(c); setSeleccion([]); setMontoManual(null); setReferencia('');
  };
  const alternar = (id: number) => {
    setMontoManual(null); // el monto vuelve a seguir la selección
    setSeleccion((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  };
  const marcarTodas = () => {
    setMontoManual(null);
    setSeleccion((s) => (s.length === deudas.length ? [] : deudas.map((d) => d.id)));
  };

  const registrarAbono = useMutation({
    mutationFn: () => crear('/abonos', {
      clienteId: abonar!.cliente_id, metodoPagoId: metodoId, moneda: metodo.moneda,
      montoMoneda: monto,
      creditoIds: seleccion.length > 0 ? seleccion : undefined,
      referencia: referencia || undefined,
    }),
    onSuccess: () => {
      toast.exito('Abono registrado');
      qc.invalidateQueries({ queryKey: ['cartera'] });
      qc.invalidateQueries({ queryKey: ['estado-cuenta'] });
      setAbonar(null); setSeleccion([]); setMontoManual(null); setReferencia('');
    },
    onError: (e) => toast.error(e instanceof ErrorApi ? e.message : 'No se pudo registrar el abono'),
  });

  const totalCartera = (cartera.data ?? []).reduce((a, c) => a + Number(c.saldo_usd), 0);
  const puedeRegistrar = montoUsd > 0 && !excede && !registrarAbono.isPending
    && (!metodo.requiereReferencia || Boolean(referencia))
    && !(enBs && tasaNum <= 0);

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
                    <td className="p-3 text-right tabular-nums font-bold">
                      {formatearUSD(c.saldo_usd)}
                      <span className="block text-xs font-normal text-gray-400">{formatearBs(aNumero(c.saldo_usd) * tasaNum)}</span>
                    </td>
                    <td className="p-3 text-right">
                      <button onClick={() => abrir(c)} className="flex items-center gap-1 rounded-lg bg-green-600 px-3 py-1 text-xs font-semibold text-white hover:bg-green-700">
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

      <Modal abierto={Boolean(abonar)} onCerrar={() => setAbonar(null)} titulo={`Abono de ${abonar?.nombre ?? ''}`} ancho="lg"
        pie={
          <div className="flex items-center justify-between gap-3">
            <div className="text-sm">
              <span className="text-gray-500">
                {seleccion.length > 0 ? `${seleccion.length} factura(s) marcada(s):` : 'Toda la deuda:'}
              </span>{' '}
              <span className="font-semibold">{formatearUSD(saldoObjetivo)}</span>
              {excede && <p className="text-xs font-medium text-red-500">El monto supera lo que se va a pagar</p>}
            </div>
            <button onClick={() => registrarAbono.mutate()} disabled={!puedeRegistrar}
              className="rounded-lg bg-green-600 px-5 py-2 font-semibold text-white hover:bg-green-700 disabled:opacity-50">
              {registrarAbono.isPending ? 'Registrando…' : `Abonar ${formatearUSD(montoUsd)}`}
            </button>
          </div>
        }>
        <div className="space-y-4">
          {/* Deudas: marcar cuáles se pagan */}
          <div>
            <div className="mb-1 flex items-center justify-between">
              <label className="text-xs font-medium text-gray-500">
                Deudas pendientes {seleccion.length === 0 && <span className="text-gray-400">· sin marcar se abona a las más antiguas primero</span>}
              </label>
              {deudas.length > 0 && (
                <button onClick={marcarTodas} className="text-xs font-semibold text-amber-600 hover:underline">
                  {seleccion.length === deudas.length ? 'Quitar todas' : 'Marcar todas'}
                </button>
              )}
            </div>
            {cuenta.isLoading ? <Cargando /> : deudas.length === 0 ? (
              <p className="rounded-lg border border-dashed border-gray-300 p-3 text-center text-sm text-gray-400 dark:border-gray-600">Sin facturas pendientes</p>
            ) : (
              <div className="max-h-56 space-y-1 overflow-y-auto rounded-lg border border-gray-200 p-1 dark:border-gray-700">
                {deudas.map((d) => {
                  const marcada = seleccion.includes(d.id);
                  const aplica = aplicacion.get(d.id) ?? 0;
                  const saldo = aNumero(d.saldo_usd);
                  const queda = saldo - aplica;
                  return (
                    <label key={d.id}
                      className={`flex cursor-pointer items-center gap-3 rounded-lg p-2 text-sm hover:bg-gray-50 dark:hover:bg-gray-700/50 ${marcada ? 'bg-amber-50 dark:bg-amber-900/20' : ''}`}>
                      <input type="checkbox" checked={marcada} onChange={() => alternar(d.id)}
                        className="h-4 w-4 rounded border-gray-300 text-amber-600 focus:ring-amber-500" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium">{d.documento ?? `Crédito #${d.id}`}</p>
                        <p className="text-xs text-gray-400">
                          Vence {formatearFecha(d.fecha_vencimiento)}
                          {d.dias_mora > 0 && <span className="ml-1 text-red-500">· {d.dias_mora} d. de mora</span>}
                        </p>
                      </div>
                      <div className="text-right tabular-nums">
                        <p className="font-semibold">{formatearUSD(saldo)}</p>
                        <p className="text-xs text-gray-400">{formatearBs(saldo * tasaNum)}</p>
                      </div>
                      <div className="w-24 text-right">
                        {aplica > 0 ? (
                          queda <= 0
                            ? <Badge color="verde">Se paga</Badge>
                            : <span className="text-xs text-amber-600">Abona {formatearUSD(aplica)}<br />queda {formatearUSD(queda)}</span>
                        ) : <span className="text-xs text-gray-300 dark:text-gray-600">—</span>}
                      </div>
                    </label>
                  );
                })}
              </div>
            )}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-500">Método de pago</label>
              <select value={metodoId} onChange={(e) => { setMetodoId(Number(e.target.value)); setMontoManual(null); }} className={INP}>
                {METODOS_PAGO.filter((m) => !m.esCredito).map((m) => <option key={m.id} value={m.id}>{m.nombre} ({m.moneda})</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1 flex items-center justify-between text-xs font-medium text-gray-500">
                <span>Monto en {enBs ? 'bolívares' : 'dólares'}</span>
                {montoManual !== null && (
                  <button onClick={() => setMontoManual(null)} className="text-amber-600 hover:underline">Pagar completo</button>
                )}
              </label>
              <input type="number" step="0.01" min="0" value={monto}
                onChange={(e) => setMontoManual(e.target.value)}
                onFocus={(e) => e.currentTarget.select()}
                className={INP} placeholder="0.00" />
              <p className="mt-1 text-xs text-gray-400">
                {enBs
                  ? (tasaNum > 0 ? `≈ ${formatearUSD(montoUsd)} a la tasa de hoy (${formatearBs(tasaNum)}/$)` : 'No hay tasa registrada hoy')
                  : `≈ ${formatearBs(montoUsd * tasaNum)}`}
              </p>
            </div>
          </div>

          {/* Abonos parciales rápidos sobre lo marcado */}
          {saldoObjetivo > 0 && (
            <div className="flex flex-wrap gap-2">
              {[0.25, 0.5, 0.75, 1].map((f) => {
                const usd = f === 1 ? saldoObjetivo : pisoCentavos(saldoObjetivo * f);
                const valor = enBs && tasaNum > 0 ? techoCentavos(usd * tasaNum).toFixed(2) : usd.toFixed(2);
                return (
                  <button key={f} onClick={() => setMontoManual(f === 1 ? null : valor)}
                    className="rounded-lg border border-gray-300 px-3 py-1 text-xs font-semibold hover:border-amber-400 hover:bg-amber-50 dark:border-gray-600 dark:hover:bg-amber-900/20">
                    {f === 1 ? 'Todo' : `${f * 100} %`} · {formatearUSD(usd)}
                    {enBs && tasaNum > 0 && <span className="ml-1 text-gray-400">({formatearBs(valor)})</span>}
                  </button>
                );
              })}
            </div>
          )}

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
