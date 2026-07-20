/** Muestra la tasa vigente en la barra superior; en rojo si no hay tasa hoy. */
import { Link } from 'react-router-dom';
import { TrendingUp, AlertTriangle } from 'lucide-react';
import { useTasaStore } from '@/store/tasaStore';
import { formatearNumero } from '@/lib/formato';

export function TasaBadge() {
  const tasa = useTasaStore((s) => s.tasa);
  const cargando = useTasaStore((s) => s.cargando);

  if (cargando) {
    return <span className="text-xs text-gray-400">Tasa…</span>;
  }

  if (!tasa) {
    return (
      <Link
        to="/tasas-cambio"
        className="flex items-center gap-1.5 rounded-lg bg-red-100 px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-200 dark:bg-red-900/40 dark:text-red-300"
      >
        <AlertTriangle className="h-4 w-4" />
        Sin tasa hoy
      </Link>
    );
  }

  return (
    <Link
      to="/tasas-cambio"
      className="flex items-center gap-1.5 rounded-lg bg-green-100 px-3 py-1.5 text-sm font-medium text-green-800 hover:bg-green-200 dark:bg-green-900/40 dark:text-green-300"
      title={`Tasa del ${tasa.fecha}`}
    >
      <TrendingUp className="h-4 w-4" />
      Bs {formatearNumero(tasa.tasa, 2)} / $
    </Link>
  );
}
