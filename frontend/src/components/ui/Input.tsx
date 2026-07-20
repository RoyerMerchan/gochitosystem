import { forwardRef, type InputHTMLAttributes, type ReactNode } from 'react';
import { cn } from '@/lib/cn';

export const CLASES_CAMPO = cn(
  'w-full bg-superficie text-texto placeholder:text-texto-tenue',
  'border border-borde rounded-md transition-colors',
  'focus:outline-none focus:ring-2 focus:ring-anillo focus:ring-offset-0 focus:border-primario',
  'disabled:opacity-60 disabled:cursor-not-allowed disabled:bg-superficie-alt',
  'read-only:bg-superficie-alt',
);

export const TAMANOS_CAMPO = {
  sm: 'h-8 px-2.5 text-xs',
  md: 'h-10 px-3 text-sm',
  lg: 'h-11 px-3.5 text-base',
} as const;

export type TamanoCampo = keyof typeof TAMANOS_CAMPO;

export interface PropsInput extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> {
  tamano?: TamanoCampo;
  /** Marca visual de error; el mensaje lo pinta FormField. */
  invalido?: boolean;
  iconoIzquierda?: ReactNode;
  iconoDerecha?: ReactNode;
}

export const Input = forwardRef<HTMLInputElement, PropsInput>(function Input(
  { tamano = 'md', invalido = false, iconoIzquierda, iconoDerecha, className, ...resto },
  ref,
) {
  const campo = (
    <input
      ref={ref}
      aria-invalid={invalido || undefined}
      className={cn(
        CLASES_CAMPO,
        TAMANOS_CAMPO[tamano],
        invalido && 'border-peligro focus:ring-peligro focus:border-peligro',
        iconoIzquierda && 'pl-9',
        iconoDerecha && 'pr-9',
        className,
      )}
      {...resto}
    />
  );

  if (!iconoIzquierda && !iconoDerecha) return campo;

  return (
    <div className="relative">
      {iconoIzquierda && (
        <span
          className="absolute left-3 top-1/2 -translate-y-1/2 text-texto-tenue pointer-events-none [&_svg]:size-4"
          aria-hidden="true"
        >
          {iconoIzquierda}
        </span>
      )}
      {campo}
      {iconoDerecha && (
        <span
          className="absolute right-3 top-1/2 -translate-y-1/2 text-texto-tenue [&_svg]:size-4"
          aria-hidden="true"
        >
          {iconoDerecha}
        </span>
      )}
    </div>
  );
});
