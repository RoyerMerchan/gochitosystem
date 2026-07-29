/** Dashboard: totales de venta por período, KPIs y accesos rápidos. */
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  ShoppingCart, Package, TrendingUp, Receipt, Info, ChevronDown, ChevronUp,
  CreditCard, ArrowDown,
} from 'lucide-react';
import { obtenerPaginado, obtener } from '@/lib/axios';
import { Card } from '@/components/ui/Feedback';
import { cn } from '@/lib/cn';
import { useAuthStore } from '@/store/authStore';
import { useTasaStore } from '@/store/tasaStore';
import {
  formatearUSD, formatearBs, formatearFechaHora, formatearNumero, formatearPorcentaje,
  calcularMargen, aNumero, usdABs,
} from '@/lib/formato';

interface VentaResumen {
  id: number;
  numero: string;
  fecha: string;
  total_usd: string;
  total_bs: string;
  cliente: string;
  cajero: string;
}

type Periodo = 'dia' | 'semana' | 'mes' | 'total';

interface TotalesVenta {
  tickets: string;
  tickets_credito: string;
  facturado_usd: string;
  contado_usd: string;
  abonos_usd: string;
  /** Contado del período + abonos recibidos. Esto es "la venta del día". */
  cobrado_usd: string;
  cobrado_bs: string;
  credito_usd: string;
  utilidad_usd: string;
}

interface Cartera {
  deuda_usd: string;
  clientes: string;
  documentos: string;
  vencido_usd: string;
  documentos_vencidos: string;
  abonado_hoy_usd: string;
  abonos_hoy: string;
  /** Espejo desnormalizado en clientes.saldo_actual; sirve para detectar descuadre. */
  saldo_clientes_usd: string;
}

const PERIODOS: { clave: Periodo; etiqueta: string; leyenda: string }[] = [
  { clave: 'dia', etiqueta: 'Hoy', leyenda: 'de hoy' },
  { clave: 'semana', etiqueta: '7 días', leyenda: 'de los últimos 7 días' },
  { clave: 'mes', etiqueta: '30 días', leyenda: 'de los últimos 30 días' },
  { clave: 'total', etiqueta: 'Todo', leyenda: 'históricas' },
];

const ACCESOS = [
  { a: '/pos', etiqueta: 'Punto de venta', icono: ShoppingCart, color: 'bg-green-500' },
  { a: '/productos', etiqueta: 'Productos', icono: Package, color: 'bg-blue-500' },
  { a: '/tasas-cambio', etiqueta: 'Tasa del día', icono: TrendingUp, color: 'bg-amber-500' },
  { a: '/ventas', etiqueta: 'Ventas', icono: Receipt, color: 'bg-purple-500' },
];

export default function DashboardPage() {
  const usuario = useAuthStore((s) => s.usuario);
  const tasa = useTasaStore((s) => s.tasa);
  const tasaNum = tasa ? Number(tasa.tasa) : 0;

  const [periodo, setPeriodo] = useState<Periodo>('dia');
  const [verCuentas, setVerCuentas] = useState(false);

  const ventas = useQuery({
    queryKey: ['ventas', 'recientes'],
    queryFn: () => obtenerPaginado<VentaResumen>('/ventas?limite=8'),
  });

  /**
   * Los totales los suma el backend en SQL sobre TODAS las ventas del período.
   * Antes se sumaban las 8 filas de "últimas ventas", así que el monto y el
   * conteo hablaban de universos distintos.
   */
  const totales = useQuery({
    queryKey: ['dashboard', 'totales', periodo],
    queryFn: () => obtener<TotalesVenta>(`/reportes/dashboard/ventas?periodo=${periodo}`),
  });

  /**
   * Cartera: saldo vivo, NO depende del período. Por eso va en su propia consulta
   * (cambiar de «Hoy» a «30 días» no la vuelve a pedir) y fuera de la grilla de
   * KPIs, para que no parezca que el número cambia con el filtro.
   */
  const cartera = useQuery({
    queryKey: ['dashboard', 'cartera'],
    queryFn: () => obtener<Cartera>('/reportes/dashboard/cartera'),
  });

  const t = totales.data;
  const tickets = aNumero(t?.tickets ?? 0);
  const creditos = aNumero(t?.tickets_credito ?? 0);
  const cobrado = aNumero(t?.cobrado_usd ?? 0);
  const facturado = aNumero(t?.facturado_usd ?? 0);
  const utilidad = aNumero(t?.utilidad_usd ?? 0);
  const promedio = tickets > 0 ? facturado / tickets : 0;
  const leyenda = PERIODOS.find((p) => p.clave === periodo)!.leyenda;
  /**
   * Los Bs solo tienen sentido en un período de UN día: cada día tiene su tasa y
   * sumar Bs de varios días con tasas distintas no da una cifra que signifique
   * nada. Para semana / mes / total se muestra únicamente el USD.
   */
  const muestraBs = periodo === 'dia';

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Hola, {usuario?.nombreCompleto?.split(' ')[0]}</h1>
        <p className="text-sm text-gray-500">
          Resumen de Mini Market Los Gochitos
          {tasa
            ? <> · tasa de hoy <span className="font-medium text-gray-600 dark:text-gray-300">Bs {formatearNumero(tasa.tasa, 2)}</span></>
            : <span className="font-medium text-red-500"> · sin tasa registrada hoy</span>}
        </p>
      </div>

      {/* Cartera: fuera de la grilla porque NO responde al filtro de período. */}
      {(() => {
        const c = cartera.data;
        const deuda = aNumero(c?.deuda_usd ?? 0);
        const vencido = aNumero(c?.vencido_usd ?? 0);
        const abonadoHoy = aNumero(c?.abonado_hoy_usd ?? 0);
        const espejo = aNumero(c?.saldo_clientes_usd ?? 0);
        const descuadre = Math.abs(deuda - espejo) > 0.01;
        return (
          <Card className={cn(cartera.isFetching && 'opacity-60')}>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="flex items-center gap-1.5 text-xs uppercase tracking-wide text-gray-500">
                  <CreditCard className="h-3.5 w-3.5" /> Te deben en total
                </p>
                <p className="mt-1 text-3xl font-bold tabular-nums text-amber-600">{formatearUSD(deuda)}</p>
                {/* La deuda se valora SIEMPRE a la tasa de HOY: es un pago futuro,
                    no un hecho pasado. La tasa congelada es solo para lo ya ocurrido. */}
                {tasaNum > 0 ? (
                  <p className="text-sm tabular-nums text-gray-500">
                    {formatearBs(usdABs(deuda, tasaNum))}
                    <span className="ml-1 text-xs text-gray-400">a la tasa de hoy</span>
                  </p>
                ) : (
                  <p className="text-xs font-medium text-red-500">Sin tasa de hoy: no se puede valorar en Bs</p>
                )}
                <p className="text-xs text-gray-400">
                  {formatearNumero(aNumero(c?.clientes ?? 0), 0)} cliente(s) ·{' '}
                  {formatearNumero(aNumero(c?.documentos ?? 0), 0)} factura(s) sin saldar
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-6">
                <div>
                  <p className="text-xs uppercase tracking-wide text-gray-500">Vencido</p>
                  <p className={cn('mt-1 text-xl font-bold tabular-nums', vencido > 0 ? 'text-red-500' : 'text-gray-400')}>
                    {formatearUSD(vencido)}
                  </p>
                  <p className="text-xs text-gray-400">
                    {formatearNumero(aNumero(c?.documentos_vencidos ?? 0), 0)} factura(s) pasadas de fecha
                  </p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wide text-gray-500">Cobrado hoy</p>
                  <p className={cn('mt-1 flex items-center gap-1 text-xl font-bold tabular-nums',
                    abonadoHoy > 0 ? 'text-green-600' : 'text-gray-400')}>
                    {abonadoHoy > 0 && <ArrowDown className="h-4 w-4" />}
                    {formatearUSD(abonadoHoy)}
                  </p>
                  <p className="text-xs text-gray-400">
                    {formatearNumero(aNumero(c?.abonos_hoy ?? 0), 0)} abono(s) · ya descontado
                  </p>
                </div>
                <Link to="/creditos"
                  className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-600">
                  Ir a cartera
                </Link>
              </div>
            </div>

            {descuadre && (
              <p className="mt-3 rounded-lg bg-red-50 p-2 text-xs text-red-700 dark:bg-red-900/20 dark:text-red-300">
                <strong>Descuadre en la cartera.</strong> El libro de créditos suma {formatearUSD(deuda)} pero
                el saldo acumulado de los clientes dice {formatearUSD(espejo)}. Manda el libro de créditos,
                que es el que se muestra arriba; el otro quedó desfasado y conviene revisarlo.
              </p>
            )}
          </Card>
        );
      })()}

      {/* Período de los KPIs */}
      <div className="flex flex-wrap gap-0.5 rounded-lg border border-gray-200 bg-white p-0.5 dark:border-gray-700 dark:bg-gray-800 sm:inline-flex">
        {PERIODOS.map((p) => (
          <button key={p.clave} onClick={() => setPeriodo(p.clave)}
            className={cn(
              'flex-1 whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium transition-colors sm:flex-none',
              periodo === p.clave
                ? 'bg-amber-500 text-white shadow-sm'
                : 'text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700',
            )}>
            {p.etiqueta}
          </button>
        ))}
      </div>

      {/* KPIs */}
      <div className={cn('grid gap-4 sm:grid-cols-2 lg:grid-cols-4', totales.isFetching && 'opacity-60')}>
        {/* Base cobrada: lo fiado NO entra aquí, entra el día que el cliente abona. */}
        <Card>
          <p className="text-xs uppercase tracking-wide text-gray-500">Entró en caja {leyenda}</p>
          <p className="mt-1 text-2xl font-bold tabular-nums">{formatearUSD(cobrado)}</p>
          {muestraBs && <p className="text-xs text-gray-400">{formatearBs(t?.cobrado_bs ?? 0)}</p>}
          <div className="mt-2 space-y-0.5 border-t border-gray-100 pt-2 text-xs dark:border-gray-700">
            <p className="flex justify-between text-gray-500">
              <span>Ventas de contado</span>
              <span className="tabular-nums">{formatearUSD(t?.contado_usd ?? 0)}</span>
            </p>
            <p className="flex justify-between text-gray-500">
              <span>Abonos de fiado</span>
              <span className="tabular-nums">{formatearUSD(t?.abonos_usd ?? 0)}</span>
            </p>
          </div>
        </Card>

        <Card>
          <p className="text-xs uppercase tracking-wide text-gray-500">Fiado {leyenda}</p>
          <p className="mt-1 text-2xl font-bold tabular-nums text-amber-600">{formatearUSD(t?.credito_usd ?? 0)}</p>
          <p className="text-xs text-amber-600/80">no entró plata</p>
          <div className="mt-2 space-y-0.5 border-t border-gray-100 pt-2 text-xs dark:border-gray-700">
            <p className="flex justify-between text-gray-500">
              <span>Ventas a crédito</span>
              <span className="tabular-nums">{formatearNumero(creditos, 0)} de {formatearNumero(tickets, 0)}</span>
            </p>
            <p className="flex justify-between text-gray-500">
              <span>Cobra en cartera</span>
              <span className="tabular-nums">
                <Link to="/creditos" className="text-amber-600 hover:underline">ver cartera</Link>
              </span>
            </p>
          </div>
        </Card>

        <Card>
          <p className="text-xs uppercase tracking-wide text-gray-500">Facturado {leyenda}</p>
          <p className="mt-1 text-2xl font-bold tabular-nums">{formatearUSD(facturado)}</p>
          <p className="text-xs text-gray-400">todo lo vendido, cobrado o no</p>
          <div className="mt-2 space-y-0.5 border-t border-gray-100 pt-2 text-xs dark:border-gray-700">
            <p className="flex justify-between text-gray-500">
              <span>N.º de ventas</span>
              <span className="tabular-nums">{formatearNumero(tickets, 0)}</span>
            </p>
            <p className="flex justify-between text-gray-500">
              <span>Ticket promedio</span>
              <span className="tabular-nums">{formatearUSD(promedio)}</span>
            </p>
          </div>
        </Card>

        <Card>
          <p className="text-xs uppercase tracking-wide text-gray-500">Utilidad {leyenda}</p>
          <p className="mt-1 text-2xl font-bold tabular-nums text-green-600">{formatearUSD(utilidad)}</p>
          <p className="text-xs text-gray-400">margen {formatearPorcentaje(calcularMargen(utilidad, facturado))}</p>
          <div className="mt-2 space-y-0.5 border-t border-gray-100 pt-2 text-xs dark:border-gray-700">
            <p className="text-gray-500">Sobre lo <strong>facturado</strong>, no sobre lo cobrado.</p>
            {aNumero(t?.credito_usd ?? 0) > 0 && (
              <p className="text-amber-600">Incluye la ganancia de lo fiado, que aún no cobras.</p>
            )}
          </div>
        </Card>
      </div>

      {/* Cómo se arman los números, con las cifras reales del período. */}
      <Card>
        <button onClick={() => setVerCuentas((v) => !v)}
          className="flex w-full items-center justify-between text-left text-sm font-semibold">
          <span className="flex items-center gap-2">
            <Info className="h-4 w-4 text-amber-500" /> ¿Cómo se calculan estos números?
          </span>
          {verCuentas ? <ChevronUp className="h-4 w-4 text-gray-400" /> : <ChevronDown className="h-4 w-4 text-gray-400" />}
        </button>

        {verCuentas && (
          <div className="mt-4 space-y-4 text-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                  <tr>
                    <td className="py-2 pr-3 align-top">
                      <p className="font-semibold">Facturado</p>
                      <p className="text-xs text-gray-500">Todo lo que vendiste, se haya cobrado o no.</p>
                    </td>
                    <td className="py-2 text-right tabular-nums">
                      <p>{formatearUSD(t?.contado_usd ?? 0)} <span className="text-xs text-gray-400">contado</span></p>
                      <p>+ {formatearUSD(t?.credito_usd ?? 0)} <span className="text-xs text-gray-400">fiado</span></p>
                      <p className="border-t border-gray-200 font-bold dark:border-gray-600">{formatearUSD(facturado)}</p>
                    </td>
                  </tr>
                  <tr>
                    <td className="py-2 pr-3 align-top">
                      <p className="font-semibold">Entró en caja</p>
                      <p className="text-xs text-gray-500">
                        Plata real. Lo fiado NO cuenta aquí: cuenta el día que el cliente paga.
                      </p>
                    </td>
                    <td className="py-2 text-right tabular-nums">
                      <p>{formatearUSD(t?.contado_usd ?? 0)} <span className="text-xs text-gray-400">contado</span></p>
                      <p>+ {formatearUSD(t?.abonos_usd ?? 0)} <span className="text-xs text-gray-400">abonos de fiado viejo</span></p>
                      <p className="border-t border-gray-200 font-bold dark:border-gray-600">{formatearUSD(cobrado)}</p>
                    </td>
                  </tr>
                  <tr>
                    <td className="py-2 pr-3 align-top">
                      <p className="font-semibold">Utilidad</p>
                      <p className="text-xs text-gray-500">
                        Precio de venta sin IVA menos el costo de la mercancía, con el costo
                        congelado al momento de cada venta.
                      </p>
                    </td>
                    <td className="py-2 text-right tabular-nums">
                      <p className="font-bold">{formatearUSD(utilidad)}</p>
                      <p className="text-xs text-gray-400">{formatearPorcentaje(calcularMargen(utilidad, facturado))} de lo facturado</p>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div className="rounded-lg bg-amber-50 p-3 text-xs text-amber-800 dark:bg-amber-900/20 dark:text-amber-300">
              <p className="font-semibold">Ojo con dos cosas</p>
              <ul className="mt-1 list-disc space-y-1 pl-4">
                <li>
                  <strong>Facturado y Entró en caja no son comparables.</strong> El primero mide
                  lo que vendiste; el segundo, la plata que tocaste. La diferencia es el fiado
                  que diste hoy menos el que te pagaron.
                </li>
                <li>
                  <strong>La utilidad va sobre lo facturado</strong>, así que incluye la ganancia
                  de las ventas fiadas que todavía no cobras. Es tu ganancia real del período,
                  pero no es plata que ya tengas en la mano.
                </li>
                {!muestraBs && (
                  <li>
                    <strong>No hay montos en Bs</strong> porque el período abarca varios días y
                    cada uno tiene su tasa: sumarlos no daría una cifra real. Usa «Hoy», o el
                    reporte Cierre por día, que calcula cada día con la suya.
                  </li>
                )}
                {aNumero(t?.utilidad_usd ?? 0) > 0 && calcularMargen(utilidad, facturado) > 60 && (
                  <li>
                    <strong>Margen muy alto ({formatearPorcentaje(calcularMargen(utilidad, facturado))}).</strong> Suele
                    significar que hay productos con costo en cero, que nunca entraron por
                    Compras. El sistema los toma como gratis e infla la ganancia.
                  </li>
                )}
              </ul>
            </div>
          </div>
        )}
      </Card>

      {/* Accesos rápidos */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {ACCESOS.map((a) => (
          <Link
            key={a.a}
            to={a.a}
            className="flex flex-col items-center gap-2 rounded-xl border border-gray-200 bg-white p-6 text-center transition-shadow hover:shadow-md dark:border-gray-700 dark:bg-gray-800"
          >
            <div className={`flex h-12 w-12 items-center justify-center rounded-xl ${a.color} text-white`}>
              <a.icono className="h-6 w-6" />
            </div>
            <span className="text-sm font-medium">{a.etiqueta}</span>
          </Link>
        ))}
      </div>

      {/* Últimas ventas */}
      <Card padding={false}>
        <div className="border-b border-gray-100 p-4 dark:border-gray-700">
          <h2 className="font-semibold">Últimas ventas</h2>
        </div>
        {(ventas.data?.datos ?? []).length === 0 ? (
          <p className="p-8 text-center text-sm text-gray-400">Aún no hay ventas registradas.</p>
        ) : (
          <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs uppercase text-gray-500 dark:bg-gray-700/50">
              <tr>
                <th className="p-3 text-left">N.º</th>
                <th className="p-3 text-left">Fecha</th>
                <th className="p-3 text-left">Cliente</th>
                <th className="p-3 text-right">Total USD</th>
                <th className="p-3 text-right">Total Bs</th>
              </tr>
            </thead>
            <tbody>
              {ventas.data!.datos.map((v) => (
                <tr key={v.id} className="border-t border-gray-100 dark:border-gray-700">
                  <td className="p-3 font-medium">{v.numero}</td>
                  <td className="p-3 text-gray-500">{formatearFechaHora(v.fecha)}</td>
                  <td className="p-3">{v.cliente}</td>
                  <td className="p-3 text-right tabular-nums">{formatearUSD(v.total_usd)}</td>
                  <td className="p-3 text-right tabular-nums text-gray-500">{formatearBs(v.total_bs)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}
      </Card>
    </div>
  );
}
