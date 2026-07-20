/**
 * Muestra un monto en las dos monedas: "$ 2,50 / Bs 91,25".
 * Recibe el monto en USD y la tasa; calcula el equivalente en Bs.
 */
import { formatearUSD, formatearBs, usdABs } from '@/lib/formato';
import { cn } from '@/lib/cn';

interface MoneyDualProps {
  usd: unknown;
  tasa: unknown;
  /** Cual moneda va con enfasis (grande). */
  principal?: 'USD' | 'VES';
  tamano?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
}

const TAMANOS = {
  sm: 'text-sm',
  md: 'text-base',
  lg: 'text-xl',
  xl: 'text-3xl',
} as const;

export function MoneyDual({ usd, tasa, principal = 'USD', tamano = 'md', className }: MoneyDualProps) {
  const bs = usdABs(usd, tasa);
  const claseGrande = cn(TAMANOS[tamano], 'font-bold tabular-nums');
  const claseChica = 'text-xs text-gray-500 dark:text-gray-400 tabular-nums';

  if (principal === 'VES') {
    return (
      <div className={cn('flex flex-col leading-tight', className)}>
        <span className={claseGrande}>{formatearBs(bs)}</span>
        <span className={claseChica}>{formatearUSD(usd)}</span>
      </div>
    );
  }
  return (
    <div className={cn('flex flex-col leading-tight', className)}>
      <span className={claseGrande}>{formatearUSD(usd)}</span>
      <span className={claseChica}>{formatearBs(bs)}</span>
    </div>
  );
}
