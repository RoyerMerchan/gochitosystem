/** Componentes de estado: Spinner, Card, Badge, EmptyState, ErrorState. */
import type { ReactNode } from 'react';
import { Loader2, Inbox, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/cn';

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cn('animate-spin', className)} aria-label="Cargando" />;
}

export function Cargando({ texto = 'Cargando...' }: { texto?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 text-gray-500">
      <Spinner className="h-8 w-8" />
      <span className="text-sm">{texto}</span>
    </div>
  );
}

export function Card({
  children,
  className,
  padding = true,
}: {
  children: ReactNode;
  className?: string;
  padding?: boolean;
}) {
  return (
    <div
      className={cn(
        'rounded-xl border border-gray-200 bg-white shadow-sm',
        'dark:border-gray-700 dark:bg-gray-800',
        padding && 'p-4',
        className,
      )}
    >
      {children}
    </div>
  );
}

const COLORES_BADGE = {
  gris: 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-200',
  verde: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300',
  rojo: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300',
  amarillo: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
  azul: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300',
} as const;

export function Badge({
  children,
  color = 'gris',
  className,
}: {
  children: ReactNode;
  color?: keyof typeof COLORES_BADGE;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium',
        COLORES_BADGE[color],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function EmptyState({
  titulo = 'Sin datos',
  descripcion,
  icono,
  accion,
}: {
  titulo?: string;
  descripcion?: string;
  icono?: ReactNode;
  accion?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
      <div className="text-gray-300 dark:text-gray-600">{icono ?? <Inbox className="h-12 w-12" />}</div>
      <p className="font-medium text-gray-700 dark:text-gray-200">{titulo}</p>
      {descripcion && <p className="max-w-sm text-sm text-gray-500">{descripcion}</p>}
      {accion}
    </div>
  );
}

export function ErrorState({
  titulo = 'Ocurrio un error',
  descripcion,
  accion,
}: {
  titulo?: string;
  descripcion?: string;
  accion?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
      <AlertTriangle className="h-12 w-12 text-red-400" />
      <p className="font-medium text-gray-700 dark:text-gray-200">{titulo}</p>
      {descripcion && <p className="max-w-sm text-sm text-gray-500">{descripcion}</p>}
      {accion}
    </div>
  );
}
