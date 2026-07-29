/** Cartera: clientes con deuda, antigüedad de saldos y registro de abonos. */
import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { CreditCard, HandCoins, Eye, Search } from 'lucide-react';
import { obtener, crear } from '@/lib/axios';
import { ErrorApi } from '@/lib/errores';
import { Card, Cargando, EmptyState, Badge } from '@/components/ui/Feedback';
import { Modal } from '@/components/ui/Modal';
import { toast } from '@/store/toastStore';
import { useTasaStore } from '@/store/tasaStore';
import { formatearUSD, formatearBs, formatearFecha, formatearCantidad, aNumero, usdABs } from '@/lib/formato';
import { METODOS_PAGO } from '@/features/pos/metodosPago';

interface FilaCartera {
  cliente_id: number; nombre: string; documento: string | null; saldo_usd: string;
  por_vencer: string; d1_30: string; d31_60: string; d61_90: string; d90_mas: string;
}

interface Deuda {
  id: number; venta_id: number | null; documento: string | null;
  fecha_emision: string; fecha_vencimiento: string;
  monto_original_usd: string; saldo_usd: string; estado: string; dias_mora: number;
}

interface EstadoCuenta { creditos: Deuda[] }

interface DetalleVenta {
  venta: { numero: string; fecha: string; total_usd: string; tasa_cambio: string };
  renglones: Array<{
    linea: number; descripcion: string; cantidad: string;
    precio_venta_unitario: string; total_linea: string;
  }>;
}

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
  /**
   * Moneda en la que el cajero ESCRIBE el monto. Puede no ser la del método: el
   * cliente dice "te pago 2 dólares" y paga por Pago Móvil; se escribe en $ y el
   * sistema registra los Bs que entran de verdad.
   */
  const [monedaEntrada, setMonedaEntrada] = useState<'USD' | 'VES'>('VES');
  /** Deuda cuyo detalle de productos está desplegado. */
  const [verProductos, setVerProductos] = useState<number | null>(null);
  const [referencia, setReferencia] = useState('');
  const [busqueda, setBusqueda] = useState('');

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
  const enBs = monedaEntrada === 'VES';

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
  const montoBs = montoUsd * tasaNum;
  const excede = montoUsd > saldoObjetivo;

  /**
   * Lo que se envía al backend va SIEMPRE en la moneda del método de pago (es la
   * plata que entra a caja). Si se escribió en la otra moneda, se convierte acá.
   */
  const montoEnvio = metodo.moneda === 'VES'
    ? (enBs ? monto : techoCentavos(montoUsd * tasaNum).toFixed(2))
    : (enBs ? montoUsd.toFixed(2) : monto);
  const monedaDistinta = metodo.moneda !== monedaEntrada;

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
    setMonedaEntrada(metodo.moneda); setVerProductos(null);
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
      montoMoneda: montoEnvio,
      creditoIds: seleccion.length > 0 ? seleccion : undefined,
      referencia: referencia || undefined,
    }),
    onSuccess: () => {
      toast.exito('Abono registrado');
      qc.invalidateQueries({ queryKey: ['cartera'] });
      qc.invalidateQueries({ queryKey: ['estado-cuenta'] });
      // El abono puede saldar la venta: su badge en Ventas pasa a "Pagada".
      qc.invalidateQueries({ queryKey: ['ventas'] });
      qc.invalidateQueries({ queryKey: ['venta-detalle'] });
      // Baja el contador de "te deben" y sube lo cobrado del día en el dashboard.
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      setAbonar(null); setSeleccion([]); setMontoManual(null); setReferencia('');
    },
    onError: (e) => toast.error(e instanceof ErrorApi ? e.message : 'No se pudo registrar el abono'),
  });

  // La cartera llega completa del backend: el filtro por cliente es local.
  const filasCartera = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    if (!q) return cartera.data ?? [];
    return (cartera.data ?? []).filter(
      (c) => c.nombre.toLowerCase().includes(q) || (c.documento ?? '').toLowerCase().includes(q),
    );
  }, [cartera.data, busqueda]);

  const totalCartera = (cartera.data ?? []).reduce((a, c) => a + Number(c.saldo_usd), 0);
  const puedeRegistrar = montoUsd > 0 && !excede && !registrarAbono.isPending
    && (!metodo.requiereReferencia || Boolean(referencia))
    // Sin tasa del día no hay conversión posible en ninguno de los dos sentidos.
    && !((enBs || metodo.moneda === 'VES') && tasaNum <= 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Créditos y cartera</h1>
          {/* La deuda se valora a la tasa de HOY, no a la del día en que se fió. */}
          <p className="text-sm text-gray-500">
            Deuda total: {formatearUSD(totalCartera)}
            {tasaNum > 0
              ? <> · {formatearBs(usdABs(totalCartera, tasaNum))} <span className="text-xs text-gray-400">a la tasa de hoy</span></>
              : <span className="font-medium text-red-500"> · sin tasa de hoy, no se puede valorar en Bs</span>}
          </p>
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input value={busqueda} onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar cliente o cédula/RIF…"
            className="w-full rounded-lg border border-gray-300 py-2 pl-9 pr-3 text-sm focus:border-amber-500 focus:outline-none dark:border-gray-600 dark:bg-gray-800 sm:w-64" />
        </div>
      </div>

      <Card padding={false}>
        {cartera.isLoading ? <Cargando /> : filasCartera.length === 0 ? (
          <EmptyState titulo={busqueda ? 'Sin resultados' : 'Sin cartera pendiente'}
            descripcion={busqueda ? 'Ningún cliente con deuda coincide con la búsqueda.' : 'Ningún cliente tiene deuda.'}
            icono={<CreditCard className="h-12 w-12" />} />
        ) : (
          <>
            {/* Teléfono: tarjeta por cliente. La antigüedad va en dos filas de chips. */}
            <ul className="divide-y divide-gray-100 md:hidden dark:divide-gray-700">
              {filasCartera.map((c) => (
                <li key={c.cliente_id} className="space-y-2 p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{c.nombre}</p>
                      {c.documento && <p className="text-xs text-gray-400">{c.documento}</p>}
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="font-bold tabular-nums">{formatearUSD(c.saldo_usd)}</p>
                      <p className="text-xs tabular-nums text-gray-400">{tasaNum > 0 ? formatearBs(usdABs(c.saldo_usd, tasaNum)) : '—'}</p>
                    </div>
                  </div>
                  {/* Solo los tramos con deuda: ahorra espacio y resalta la mora. */}
                  <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs">
                    {([
                      ['Por vencer', c.por_vencer, 'text-gray-500'],
                      ['1-30', c.d1_30, 'text-gray-600 dark:text-gray-300'],
                      ['31-60', c.d31_60, 'text-amber-600'],
                      ['61-90', c.d61_90, 'text-orange-600'],
                      ['+90', c.d90_mas, 'text-red-600 font-semibold'],
                    ] as const).filter(([, monto]) => aNumero(monto) > 0).map(([etiqueta, monto, color]) => (
                      <span key={etiqueta} className={color}>
                        {etiqueta}: <span className="tabular-nums">{formatearUSD(monto, false)}</span>
                      </span>
                    ))}
                  </div>
                  <button onClick={() => abrir(c)} className="flex w-full items-center justify-center gap-1 rounded-lg bg-green-600 px-3 py-2 text-sm font-semibold text-white active:bg-green-700">
                    <HandCoins className="h-4 w-4" /> Abonar
                  </button>
                </li>
              ))}
            </ul>

            <div className="hidden overflow-x-auto md:block">
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
                {filasCartera.map((c) => (
                  <tr key={c.cliente_id} className="border-t border-gray-100 dark:border-gray-700">
                    <td className="p-3 font-medium">
                      {c.nombre}
                      {c.documento && <span className="block text-xs font-normal text-gray-400">{c.documento}</span>}
                    </td>
                    <td className="p-3 text-right tabular-nums text-gray-500">{formatearUSD(c.por_vencer, false)}</td>
                    <td className="p-3 text-right tabular-nums">{formatearUSD(c.d1_30, false)}</td>
                    <td className="p-3 text-right tabular-nums text-amber-600">{formatearUSD(c.d31_60, false)}</td>
                    <td className="p-3 text-right tabular-nums text-orange-600">{formatearUSD(c.d61_90, false)}</td>
                    <td className="p-3 text-right tabular-nums font-semibold text-red-600">{formatearUSD(c.d90_mas, false)}</td>
                    <td className="p-3 text-right tabular-nums font-bold">
                      {formatearUSD(c.saldo_usd)}
                      <span className="block text-xs font-normal text-gray-400">{tasaNum > 0 ? formatearBs(usdABs(c.saldo_usd, tasaNum)) : '—'}</span>
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
          </>
        )}
      </Card>

      <Modal abierto={Boolean(abonar)} onCerrar={() => setAbonar(null)} titulo={`Abono de ${abonar?.nombre ?? ''}`} ancho="lg"
        pie={
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-sm">
              <span className="text-gray-500">
                {seleccion.length > 0 ? `${seleccion.length} factura(s) marcada(s):` : 'Toda la deuda:'}
              </span>{' '}
              <span className="font-semibold">{formatearUSD(saldoObjetivo)}</span>
              {excede && <p className="text-xs font-medium text-red-500">El monto supera lo que se va a pagar</p>}
            </div>
            <button onClick={() => registrarAbono.mutate()} disabled={!puedeRegistrar}
              className="w-full shrink-0 rounded-lg bg-green-600 px-5 py-2 font-semibold text-white hover:bg-green-700 disabled:opacity-50 sm:w-auto">
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
              <div className="max-h-72 space-y-1 overflow-y-auto rounded-lg border border-gray-200 p-1 dark:border-gray-700">
                {deudas.map((d) => {
                  const marcada = seleccion.includes(d.id);
                  const aplica = aplicacion.get(d.id) ?? 0;
                  const saldo = aNumero(d.saldo_usd);
                  const queda = saldo - aplica;
                  const abierta = verProductos === d.id;
                  return (
                    <div key={d.id} className={`rounded-lg ${marcada ? 'bg-amber-50 dark:bg-amber-900/20' : ''}`}>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 p-2 text-sm hover:bg-gray-50 dark:hover:bg-gray-700/50">
                        {/* El label envuelve solo lo que debe marcar el checkbox, no el botón de ver. */}
                        <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-3">
                          <input type="checkbox" checked={marcada} onChange={() => alternar(d.id)}
                            className="h-4 w-4 rounded border-gray-300 text-amber-600 focus:ring-amber-500" />
                          <div className="min-w-0 flex-1">
                            <p className="truncate font-medium">{d.documento ?? `Crédito #${d.id}`}</p>
                            <p className="text-xs text-gray-400">
                              Vence {formatearFecha(d.fecha_vencimiento)}
                              {d.dias_mora > 0 && <span className="ml-1 text-red-500">· {d.dias_mora} d. de mora</span>}
                            </p>
                          </div>
                        </label>
                        {d.venta_id != null && (
                          <button onClick={() => setVerProductos(abierta ? null : d.id)}
                            title="Ver qué productos se llevó en esta factura"
                            className={`rounded-lg p-1.5 ${abierta ? 'bg-amber-500 text-white' : 'text-gray-400 hover:bg-gray-100 hover:text-amber-600 dark:hover:bg-gray-700'}`}>
                            <Eye className="h-4 w-4" />
                          </button>
                        )}
                        <div className="text-right tabular-nums">
                          <p className="font-semibold">{formatearUSD(saldo)}</p>
                          <p className="text-xs text-gray-400">{tasaNum > 0 ? formatearBs(usdABs(saldo, tasaNum)) : '—'}</p>
                        </div>
                        {/* En teléfono baja a su propia línea en vez de apretar la fila. */}
                        <div className="w-full text-right sm:w-24">
                          {aplica > 0 ? (
                            queda <= 0
                              ? <Badge color="verde">Se paga</Badge>
                              : <span className="text-xs text-amber-600">Abona {formatearUSD(aplica)}<br />queda {formatearUSD(queda)}</span>
                          ) : <span className="text-xs text-gray-300 dark:text-gray-600">—</span>}
                        </div>
                      </div>
                      {abierta && <ProductosDeVenta ventaId={d.venta_id!} tasaHoy={tasaNum} />}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-500">Método de pago</label>
              <select value={metodoId}
                onChange={(e) => {
                  const id = Number(e.target.value);
                  setMetodoId(id);
                  // El monto se escribe por defecto en la moneda del método elegido.
                  setMonedaEntrada(METODOS_PAGO.find((m) => m.id === id)?.moneda ?? 'VES');
                  setMontoManual(null);
                }} className={INP}>
                {METODOS_PAGO.filter((m) => !m.esCredito).map((m) => <option key={m.id} value={m.id}>{m.nombre} ({m.moneda})</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1 flex items-center justify-between text-xs font-medium text-gray-500">
                <span>Monto</span>
                {montoManual !== null && (
                  <button onClick={() => setMontoManual(null)} className="text-amber-600 hover:underline">Pagar completo</button>
                )}
              </label>
              <div className="flex gap-2">
                {/* Se puede escribir en $ o en Bs; abajo se ve siempre la conversión. */}
                <div className="flex overflow-hidden rounded-lg border border-gray-300 dark:border-gray-600">
                  {(['USD', 'VES'] as const).map((m) => (
                    <button key={m} onClick={() => { setMonedaEntrada(m); setMontoManual(null); }}
                      disabled={m === 'VES' && tasaNum <= 0}
                      className={`px-3 py-2 text-sm font-bold disabled:opacity-40 ${monedaEntrada === m ? 'bg-amber-500 text-white' : 'text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700'}`}>
                      {m === 'USD' ? '$' : 'Bs'}
                    </button>
                  ))}
                </div>
                <input type="number" step="0.01" min="0" value={monto}
                  onChange={(e) => setMontoManual(e.target.value)}
                  onFocus={(e) => e.currentTarget.select()}
                  className={`${INP} min-w-0 flex-1`} placeholder="0.00" />
              </div>
              <p className="mt-1 text-xs text-gray-400">
                {tasaNum > 0
                  ? `${formatearUSD(montoUsd)} · ${formatearBs(montoBs)} (tasa ${formatearBs(tasaNum)}/$)`
                  : 'No hay tasa registrada hoy'}
              </p>
              {monedaDistinta && tasaNum > 0 && montoUsd > 0 && (
                <p className="mt-1 text-xs text-amber-600">
                  Entra por {metodo.nombre}: se registra {metodo.moneda === 'VES' ? formatearBs(montoEnvio) : formatearUSD(montoEnvio)}
                </p>
              )}
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

/**
 * Productos que se llevó el cliente en la factura de esa deuda.
 * Los Bs van con la tasa CONGELADA de la venta (`tasa_cambio`), no con la de hoy:
 * es lo que costó ese día. La tasa de hoy solo se muestra si el documento no la trae.
 */
function ProductosDeVenta({ ventaId, tasaHoy }: { ventaId: number; tasaHoy: number }) {
  const venta = useQuery({
    queryKey: ['venta-detalle', ventaId],
    queryFn: () => obtener<DetalleVenta>(`/ventas/${ventaId}`),
  });

  if (venta.isLoading) return <div className="px-2 pb-2"><Cargando /></div>;
  if (venta.isError) {
    return (
      <p className="px-4 pb-2 text-xs text-gray-400">
        No se pudo cargar el detalle de la factura (¿permiso para ver ventas?).
      </p>
    );
  }
  if (!venta.data) return null;

  const tasa = aNumero(venta.data.venta.tasa_cambio) || tasaHoy;

  return (
    <div className="mx-2 mb-2 rounded-lg bg-gray-50 p-2 dark:bg-gray-900/40">
      <p className="mb-1 text-[11px] uppercase tracking-wide text-gray-400">
        Factura {venta.data.venta.numero} · {formatearFecha(venta.data.venta.fecha)}
      </p>
      <table className="w-full text-xs">
        <tbody>
          {venta.data.renglones.map((r) => (
            <tr key={r.linea} className="border-t border-gray-200 first:border-0 dark:border-gray-700">
              <td className="py-1 pr-2">
                <span className="font-medium">{r.descripcion}</span>
                <span className="ml-1 text-gray-400">
                  {formatearCantidad(r.cantidad)} × {formatearUSD(r.precio_venta_unitario)}
                </span>
              </td>
              <td className="py-1 text-right tabular-nums">
                {formatearUSD(r.total_linea)}
                <span className="block text-[11px] text-gray-400">{formatearBs(usdABs(r.total_linea, tasa))}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mt-1 flex justify-between border-t border-gray-200 pt-1 text-xs font-bold dark:border-gray-700">
        <span>Total de la factura</span>
        <span className="tabular-nums">
          {formatearUSD(venta.data.venta.total_usd)}
          <span className="ml-1 font-normal text-gray-400">{formatearBs(usdABs(venta.data.venta.total_usd, tasa))}</span>
        </span>
      </div>
    </div>
  );
}

const INP = 'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-amber-500 focus:outline-none dark:border-gray-600 dark:bg-gray-700';
