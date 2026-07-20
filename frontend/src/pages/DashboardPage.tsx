/** Dashboard: KPIs del día y accesos rápidos. */
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ShoppingCart, Package, TrendingUp, Receipt } from 'lucide-react';
import { obtenerPaginado } from '@/lib/axios';
import { Card } from '@/components/ui/Feedback';
import { useAuthStore } from '@/store/authStore';
import { useTasaStore } from '@/store/tasaStore';
import { formatearUSD, formatearBs, formatearFechaHora, formatearNumero } from '@/lib/formato';

interface VentaResumen {
  id: number;
  numero: string;
  fecha: string;
  total_usd: string;
  total_bs: string;
  cliente: string;
  cajero: string;
}

const ACCESOS = [
  { a: '/pos', etiqueta: 'Punto de venta', icono: ShoppingCart, color: 'bg-green-500' },
  { a: '/productos', etiqueta: 'Productos', icono: Package, color: 'bg-blue-500' },
  { a: '/tasas-cambio', etiqueta: 'Tasa del día', icono: TrendingUp, color: 'bg-amber-500' },
  { a: '/ventas', etiqueta: 'Ventas', icono: Receipt, color: 'bg-purple-500' },
];

export default function DashboardPage() {
  const usuario = useAuthStore((s) => s.usuario);
  const tasa = useTasaStore((s) => s.tasa);

  const ventas = useQuery({
    queryKey: ['ventas', 'recientes'],
    queryFn: () => obtenerPaginado<VentaResumen>('/ventas?limite=8'),
  });

  const totalDia = (ventas.data?.datos ?? []).reduce((a, v) => a + Number(v.total_usd), 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Hola, {usuario?.nombreCompleto?.split(' ')[0]}</h1>
        <p className="text-sm text-gray-500">Resumen de Mini Market Los Gochitos</p>
      </div>

      {/* KPIs */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <p className="text-xs uppercase tracking-wide text-gray-500">Ventas recientes (USD)</p>
          <p className="mt-1 text-2xl font-bold tabular-nums">{formatearUSD(totalDia)}</p>
          <p className="text-xs text-gray-400">{formatearBs(totalDia * (tasa ? Number(tasa.tasa) : 0))}</p>
        </Card>
        <Card>
          <p className="text-xs uppercase tracking-wide text-gray-500">N.º de ventas</p>
          <p className="mt-1 text-2xl font-bold tabular-nums">{ventas.data?.meta.total ?? 0}</p>
        </Card>
        <Card>
          <p className="text-xs uppercase tracking-wide text-gray-500">Tasa del día</p>
          {tasa ? (
            <p className="mt-1 text-2xl font-bold tabular-nums">Bs {formatearNumero(tasa.tasa, 2)}</p>
          ) : (
            <p className="mt-1 text-sm font-medium text-red-500">Sin registrar</p>
          )}
        </Card>
        <Card>
          <p className="text-xs uppercase tracking-wide text-gray-500">Tu rol</p>
          <p className="mt-1 text-2xl font-bold">{usuario?.rolCodigo}</p>
        </Card>
      </div>

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
        )}
      </Card>
    </div>
  );
}
