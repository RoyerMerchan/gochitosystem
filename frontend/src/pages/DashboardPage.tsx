/** Dashboard: totales de venta por período, KPIs y accesos rápidos. */
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ShoppingCart, Package, TrendingUp, Receipt } from 'lucide-react';
import { obtenerPaginado, obtener } from '@/lib/axios';
import { Card } from '@/components/ui/Feedback';
import { cn } from '@/lib/cn';
import { useAuthStore } from '@/store/authStore';
import { useTasaStore } from '@/store/tasaStore';
import { formatearUSD, formatearBs, formatearFechaHora, formatearNumero, aNumero } from '@/lib/formato';

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

  const [periodo, setPeriodo] = useState<Periodo>('dia');

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

  const t = totales.data;
  const tickets = aNumero(t?.tickets ?? 0);
  const cobrado = aNumero(t?.cobrado_usd ?? 0);
  const promedio = tickets > 0 ? aNumero(t?.facturado_usd ?? 0) / tickets : 0;
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
          <p className="text-xs uppercase tracking-wide text-gray-500">Venta cobrada {leyenda}</p>
          <p className="mt-1 text-2xl font-bold tabular-nums">{formatearUSD(cobrado)}</p>
          {muestraBs && <p className="text-xs text-gray-400">{formatearBs(t?.cobrado_bs ?? 0)}</p>}
          <p className="mt-1 text-xs text-gray-400">
            Contado {formatearUSD(t?.contado_usd ?? 0)} · Abonos {formatearUSD(t?.abonos_usd ?? 0)}
          </p>
        </Card>
        <Card>
          <p className="text-xs uppercase tracking-wide text-gray-500">Salió a crédito</p>
          <p className="mt-1 text-2xl font-bold tabular-nums text-amber-600">{formatearUSD(t?.credito_usd ?? 0)}</p>
          <p className="mt-1 text-xs text-gray-400">
            {formatearNumero(aNumero(t?.tickets_credito ?? 0), 0)} venta(s) fiada(s) · no suma a lo cobrado
          </p>
        </Card>
        <Card>
          <p className="text-xs uppercase tracking-wide text-gray-500">N.º de ventas</p>
          <p className="mt-1 text-2xl font-bold tabular-nums">{formatearNumero(tickets, 0)}</p>
          <p className="mt-1 text-xs text-gray-400">
            Facturado {formatearUSD(t?.facturado_usd ?? 0)} · ticket {formatearUSD(promedio)}
          </p>
        </Card>
        <Card>
          <p className="text-xs uppercase tracking-wide text-gray-500">Utilidad</p>
          <p className="mt-1 text-2xl font-bold tabular-nums text-green-600">{formatearUSD(t?.utilidad_usd ?? 0)}</p>
          <p className="mt-1 text-xs text-gray-400">Venta sin IVA menos costo de la mercancía</p>
        </Card>
      </div>
      {!muestraBs && (
        <p className="-mt-2 text-xs text-gray-400">
          Los montos van solo en USD: cada día tiene su propia tasa y sumar bolívares de
          varios días no da una cifra real. Para ver Bs, usa el período «Hoy» o el reporte
          Cierre por día, que calcula cada día con su tasa.
        </p>
      )}

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
