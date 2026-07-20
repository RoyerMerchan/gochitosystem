import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { cn } from '@/lib/cn';

type PropsBase = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'onChange' | 'value' | 'type'>;

export interface PropsSwitch extends PropsBase {
  checked: boolean;
  onCheckedChange: (valor: boolean) => void;
  etiqueta?: ReactNode;
  descripcion?: ReactNode;
  tamano?: 'sm' | 'md';
}

export const Switch = forwardRef<HTMLButtonElement, PropsSwitch>(function Switch(
  { checked, onCheckedChange, etiqueta, descripcion, tamano = 'md', className, disabled, ...resto },
  ref,
) {
  const esPequeno = tamano === 'sm';

  const control = (
    <button
      ref={ref}
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onCheckedChange(!checked)}
      className={cn(
        'relative inline-flex shrink-0 items-center rounded-full transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-anillo focus-visible:ring-offset-2 focus-visible:ring-offset-fondo',
        'disabled:opacity-50 disabled:cursor-not-allowed',
        esPequeno ? 'h-5 w-9' : 'h-6 w-11',
        checked ? 'bg-primario' : 'bg-borde-fuerte',
        className,
      )}
      {...resto}
    >
      <span
        className={cn(
          'inline-block rounded-full bg-white shadow-sutil transition-transform',
          esPequeno ? 'size-4' : 'size-5',
          checked
            ? esPequeno
              ? 'translate-x-[18px]'
              : 'translate-x-[22px]'
            : 'translate-x-0.5',
        )}
        aria-hidden="true"
      />
    </button>
  );

  if (!etiqueta && !descripcion) return control;

  return (
    <div className="flex items-start justify-between gap-4">
      <div className="flex flex-col gap-0.5">
        {etiqueta && <span className="text-sm font-medium text-texto">{etiqueta}</span>}
        {descripcion && <span className="text-xs text-texto-tenue">{descripcion}</span>}
      </div>
      {control}
    </div>
  );
});
