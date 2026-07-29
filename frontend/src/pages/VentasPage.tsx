/** Historial de ventas con método de pago, filtros y anulación. */
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Receipt, Ban, Filter, X, Eye, Search } from 'lucide-react';
import { obtenerPaginado, obtener, crear } from '@/lib/axios';
import { ErrorApi } from '@/lib/errores';
import { Card, Cargando, Badge, EmptyState } from '@/components/ui/Feedback';
import { Modal } from '@/components/ui/Modal';
import { FiltroPeriodo } from '@/components/ui/FiltroPeriodo';
import { useDebounce } from '@/hooks/useDebounce';
import { toast } from '@/store/toastStore';
import { useAuthStore } from '@/store/authStore';
import { METODOS_PAGO } from '@/features/pos/metodosPago';
import { formatearUSD, formatearBs, formatearFechaHora, aNumero, usdABs } from '@/lib/formato';

interface VentaFila {
  id: number; numero: string; fecha: string; total_usd: string; total_bs: string;
  utilidad_total: string; estado: string; es_credito: boolean; cliente: string; cajero: string;
  metodos_pago: string | null;
  /** Estado de cobro derivado del saldo del crédito: ANULADA | CREDITO | PAGADA. */
  estado_pago: 'ANULADA' | 'CREDITO' | 'PAGADA';
}
interface DetalleVenta {
  venta: {
    numero: string; fecha: string; cliente_nombre: string; cajero: string; estado: string;
    total_usd: string; total_bs: string; tasa_cambio: string; impuesto_total: string;
    es_credito: boolean; total_credito: string; saldo_credito: string;
    estado_pago: 'ANULADA' | 'CREDITO' | 'PAGADA';
  };
  renglones: Array<{
    linea: number; descripcion: string; cantidad: string;
    precio_venta_unitario: string; descuento_unitario: string; total_linea: string;
  }>;
  pagos: Array<{ metodo_nombre: string; moneda: string; monto_moneda: string; monto_usd: string }>;
}

export default function VentasPage() {
  const qc = useQueryClient();
  const puedeAnular = useAuthStore((s) => s.permisos.includes('ventas.anular'));
  const [anular, setAnular] = useState<VentaFila | null>(null);
  const [motivo, setMotivo] = useState('');
  const [verId, setVerId] = useState<number | null>(null);

  const detalle = useQuery({
    queryKey: ['venta-detalle', verId],
    queryFn: () => obtener<DetalleVenta>(`/ventas/${verId}`),
    enabled: verId !== null,
  });
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');
  const [metodoPagoId, setMetodoPagoId] = useState('');
  const [busqueda, setBusqueda] = useState('');
  const q = useDebounce(busqueda.trim(), 300);

  const params = new URLSearchParams({ limite: '100' });
  if (desde) params.set('desde', desde);
  if (hasta) params.set('hasta', hasta);
  if (metodoPagoId) params.set('metodoPagoId', metodoPagoId);
  if (q) params.set('busqueda', q);

  const ventas = useQuery({
    queryKey: ['ventas', 'lista', desde, hasta, metodoPagoId, q],
    queryFn: () => obtenerPaginado<VentaFila>(`/ventas?${params.toString()}`),
  });

  const anularVenta = useMutation({
    mutationFn: () => crear(`/ventas/${anular!.id}/anular`, { motivo }),
    onSuccess: () => {
      toast.exito('Venta anulada · stock reingresado');
      qc.invalidateQueries({ queryKey: ['ventas'] });
      // Anular revierte la deuda: la cartera queda desactualizada si no se refresca.
      qc.invalidateQueries({ queryKey: ['cartera'] });
      setAnular(null); setMotivo('');
    },
    onError: (e) => toast.error(e instanceof ErrorApi ? e.message : 'No se pudo anular'),
  });

  const limpiarFiltros = () => { setDesde(''); setHasta(''); setMetodoPagoId(''); setBusqueda(''); };
  const hayFiltros = desde || hasta || metodoPagoId || q;
  const filas = ventas.data?.datos ?? [];

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Ventas</h1>
        <p className="text-sm text-gray-500">{ventas.data?.meta.total ?? 0} ventas{hayFiltros ? ' (filtradas)' : ' registradas'}</p>
      </div>

      {/* Filtros */}
      <Card>
        <FiltroPeriodo desde={desde} hasta={hasta} onCambiar={(d, h) => { setDesde(d); setHasta(h); }} />
        {/* Grilla: 1 columna en teléfono, 2 en tablet, 4 en escritorio. */}
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="sm:col-span-2 lg:col-span-4">
            <label className="mb-1 block text-xs font-medium text-gray-500">Cliente o n.º de venta</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input value={busqueda} onChange={(e) => setBusqueda(e.target.value)}
                placeholder="Buscar por cliente, cédula/RIF o n.º…"
                className={`${INP} w-full pl-9`} />
            </div>
          </div>
          <div>
            <label className="mb-1 flex items-center gap-1 text-xs font-medium text-gray-500"><Filter className="h-3.5 w-3.5" /> Desde</label>
            <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} className={`${INP} w-full`} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-500">Hasta</label>
            <input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} className={`${INP} w-full`} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-500">Método de pago</label>
            <select value={metodoPagoId} onChange={(e) => setMetodoPagoId(e.target.value)} className={`${INP} w-full`}>
              <option value="">Todos</option>
              {METODOS_PAGO.map((m) => <option key={m.id} value={m.id}>{m.nombre}</option>)}
            </select>
          </div>
          {hayFiltros && (
            <button onClick={limpiarFiltros} className="flex items-center justify-center gap-1 self-end rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-600 hover:bg-gray-100 dark:border-gray-600 dark:hover:bg-gray-700">
              <X className="h-4 w-4" /> Limpiar
            </button>
          )}
        </div>
      </Card>

      <Card padding={false}>
        {ventas.isLoading ? <Cargando /> : filas.length === 0 ? (
          <EmptyState titulo="Sin ventas" descripcion={hayFiltros ? 'Ninguna venta coincide con los filtros.' : 'Aún no hay ventas.'} icono={<Receipt className="h-12 w-12" />} />
        ) : (
          <>
            {/* Teléfono: una tarjeta por venta. La tabla de 9 columnas no cabe. */}
            <ul className="divide-y divide-gray-100 md:hidden dark:divide-gray-700">
              {filas.map((v) => (
                <li key={v.id} className="space-y-2 p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{v.cliente}</p>
                      <p className="text-xs text-gray-500">{v.numero} · {formatearFechaHora(v.fecha)}</p>
                    </div>
                    <BadgeEstado estado={v.estado_pago} />
                  </div>
                  <p className="truncate text-xs text-gray-600 dark:text-gray-300">{metodoTexto(v)}</p>
                  <div className="flex items-end justify-between gap-2">
                    <div>
                      <p className="font-semibold tabular-nums">{formatearUSD(v.total_usd)}</p>
                      <p className="text-xs tabular-nums text-gray-500">{formatearBs(v.total_bs)}</p>
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="mr-1 text-xs tabular-nums text-green-600">Ut. {formatearUSD(v.utilidad_total)}</span>
                      {/* p-2: área táctil mínima cómoda en pantalla pequeña. */}
                      <button onClick={() => setVerId(v.id)} className="p-2 text-gray-400 active:text-amber-600" title="Ver detalle">
                        <Eye className="h-5 w-5" />
                      </button>
                      {puedeAnular && v.estado !== 'ANULADA' && (
                        <button onClick={() => { setAnular(v); setMotivo(''); }} className="p-2 text-gray-400 active:text-red-500" title="Anular venta">
                          <Ban className="h-5 w-5" />
                        </button>
                      )}
                    </div>
                  </div>
                </li>
              ))}
            </ul>

            <div className="hidden overflow-x-auto md:block">
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
                      <td className="whitespace-nowrap p-3 text-gray-500">{formatearFechaHora(v.fecha)}</td>
                      <td className="p-3">{v.cliente}</td>
                      <td className="p-3 text-gray-600 dark:text-gray-300">{metodoTexto(v)}</td>
                      <td className="p-3 text-right tabular-nums">{formatearUSD(v.total_usd)}</td>
                      <td className="p-3 text-right tabular-nums text-gray-500">{formatearBs(v.total_bs)}</td>
                      <td className="p-3 text-right tabular-nums text-green-600">{formatearUSD(v.utilidad_total)}</td>
                      <td className="p-3 text-center"><BadgeEstado estado={v.estado_pago} /></td>
                      <td className="p-3 text-right">
                        <div className="flex justify-end gap-2">
                          <button onClick={() => setVerId(v.id)} className="text-gray-400 hover:text-amber-600" title="Ver detalle">
                            <Eye className="h-4 w-4" />
                          </button>
                          {puedeAnular && v.estado !== 'ANULADA' && (
                            <button onClick={() => { setAnular(v); setMotivo(''); }} className="text-gray-400 hover:text-red-500" title="Anular venta">
                              <Ban className="h-4 w-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
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

      {/* Detalle de la venta: qué se vendió */}
      <Modal abierto={verId !== null} onCerrar={() => setVerId(null)} titulo={`Detalle de venta ${detalle.data?.venta.numero ?? ''}`} ancho="lg">
        {detalle.isLoading ? <Cargando /> : detalle.data && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
              <div><span className="text-gray-500">Fecha:</span> <span className="font-medium">{formatearFechaHora(detalle.data.venta.fecha)}</span></div>
              <div><span className="text-gray-500">Cliente:</span> <span className="font-medium">{detalle.data.venta.cliente_nombre}</span></div>
              <div><span className="text-gray-500">Cajero:</span> <span className="font-medium">{detalle.data.venta.cajero}</span></div>
              <div>
                <span className="text-gray-500">Estado:</span>{' '}
                <BadgeEstado estado={detalle.data.venta.estado_pago} />
              </div>
            </div>

            <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-xs uppercase text-gray-500 dark:bg-gray-700/50">
                  <tr>
                    <th className="p-2 text-left">Producto</th><th className="p-2 text-right">Cant.</th>
                    <th className="p-2 text-right">Precio $</th><th className="p-2 text-right">Precio Bs</th><th className="p-2 text-right">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {/* Bs con la tasa congelada de la venta, nunca la de hoy (ADR del modelo bimonetario). */}
                  {detalle.data.renglones.map((r) => {
                    const tasaVenta = aNumero(detalle.data!.venta.tasa_cambio);
                    return (
                      <tr key={r.linea} className="border-t border-gray-100 dark:border-gray-700">
                        <td className="p-2 font-medium">{r.descripcion}</td>
                        <td className="p-2 text-right tabular-nums">{r.cantidad}</td>
                        <td className="p-2 text-right tabular-nums">{formatearUSD(r.precio_venta_unitario)}</td>
                        <td className="p-2 text-right tabular-nums text-gray-500">{formatearBs(aNumero(r.precio_venta_unitario) * tasaVenta)}</td>
                        <td className="p-2 text-right tabular-nums font-medium">
                          {formatearUSD(r.total_linea)}
                          <span className="block text-xs font-normal text-gray-400">{formatearBs(usdABs(r.total_linea, tasaVenta))}</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="flex flex-col gap-1 text-sm">
              <div className="flex justify-between"><span className="text-gray-500">IVA incluido</span><span>{formatearUSD(detalle.data.venta.impuesto_total)}</span></div>
              <div className="flex justify-between text-base font-bold"><span>TOTAL</span><span className="tabular-nums">{formatearUSD(detalle.data.venta.total_usd)} · {formatearBs(detalle.data.venta.total_bs)}</span></div>
            </div>

            {detalle.data.pagos.length > 0 && (
              <div className="rounded-lg border border-gray-200 p-3 text-sm dark:border-gray-700">
                <p className="mb-1 font-medium">Pagos</p>
                {detalle.data.pagos.map((p, i) => (
                  <div key={i} className="flex justify-between text-gray-600 dark:text-gray-300">
                    <span>{p.metodo_nombre}</span>
                    <span className="tabular-nums">{p.moneda === 'VES' ? formatearBs(p.monto_moneda) : formatearUSD(p.monto_moneda)} ({formatearUSD(p.monto_usd)})</span>
                  </div>
                ))}
              </div>
            )}

            {/* Lo financiado al emitir la venta, y lo que aún se debe hoy. */}
            {detalle.data.venta.es_credito && (() => {
              const saldo = aNumero(detalle.data!.venta.saldo_credito);
              const saldado = saldo <= 0;
              return (
                <div className={`space-y-1 rounded-lg border p-3 text-sm ${saldado
                  ? 'border-green-300 bg-green-50 text-green-800 dark:border-green-700 dark:bg-green-900/20 dark:text-green-300'
                  : 'border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-700 dark:bg-amber-900/20 dark:text-amber-300'}`}>
                  <div className="flex justify-between">
                    <span>Quedó a crédito</span>
                    <span className="tabular-nums">{formatearUSD(detalle.data!.venta.total_credito)}</span>
                  </div>
                  <div className="flex justify-between font-semibold">
                    <span>{saldado ? 'Crédito saldado' : 'Saldo pendiente'}</span>
                    <span className="tabular-nums">{saldado ? '—' : formatearUSD(saldo)}</span>
                  </div>
                </div>
              );
            })()}
          </div>
        )}
      </Modal>
    </div>
  );
}
const INP = 'rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-amber-500 focus:outline-none dark:border-gray-600 dark:bg-gray-700';

/** estado_pago lo calcula el backend contra el saldo vivo del crédito, no contra es_credito. */
function BadgeEstado({ estado }: { estado: VentaFila['estado_pago'] }) {
  if (estado === 'ANULADA') return <Badge color="rojo">Anulada</Badge>;
  if (estado === 'CREDITO') return <Badge color="amarillo">Crédito</Badge>;
  return <Badge color="verde">Pagada</Badge>;
}

/** Una venta a crédito puede llevar abono inicial: se listan los dos métodos. */
function metodoTexto(v: VentaFila): string {
  if (v.es_credito) return v.metodos_pago ? `${v.metodos_pago} + Crédito` : 'Crédito';
  return v.metodos_pago ?? '—';
}
