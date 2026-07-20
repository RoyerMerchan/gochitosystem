/**
 * Botones rápidos de período: Hoy · Últimos 7 días · Último mes · Todo.
 * Setea el rango de fechas (desde/hasta) del filtro que lo use.
 */
import { dayjs } from '@/lib/formato';
import { cn } from '@/lib/cn';

interface Props {
  desde: string;
  hasta: string;
  onCambiar: (desde: string, hasta: string) => void;
}

const HOY = () => dayjs().format('YYYY-MM-DD');

const PRESETS: { clave: string; etiqueta: string; rango: () => [string, string] }[] = [
  { clave: 'hoy', etiqueta: 'Hoy', rango: () => [HOY(), HOY()] },
  { clave: '7d', etiqueta: 'Últimos 7 días', rango: () => [dayjs().subtract(6, 'day').format('YYYY-MM-DD'), HOY()] },
  { clave: 'mes', etiqueta: 'Último mes', rango: () => [dayjs().subtract(29, 'day').format('YYYY-MM-DD'), HOY()] },
  { clave: 'todo', etiqueta: 'Todo', rango: () => ['', ''] },
];

export function FiltroPeriodo({ desde, hasta, onCambiar }: Props) {
  // Determina cuál preset coincide con el rango actual (para resaltarlo).
  const activo = PRESETS.find((p) => {
    const [d, h] = p.rango();
    return d === desde && h === hasta;
  })?.clave ?? (!desde && !hasta ? 'todo' : '');

  return (
    <div className="inline-flex rounded-lg border border-gray-200 bg-white p-0.5 dark:border-gray-700 dark:bg-gray-800">
      {PRESETS.map((p) => (
        <button
          key={p.clave}
          onClick={() => {
            const [d, h] = p.rango();
            onCambiar(d, h);
          }}
          className={cn(
            'rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
            activo === p.clave
              ? 'bg-amber-500 text-white shadow-sm'
              : 'text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700',
          )}
        >
          {p.etiqueta}
        </button>
      ))}
    </div>
  );
}
