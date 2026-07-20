import { forwardRef, useEffect, useRef, type InputHTMLAttributes, type ReactNode } from 'react';
import { Check, Minus } from 'lucide-react';
import { cn } from '@/lib/cn';

export interface PropsCheckbox extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  etiqueta?: ReactNode;
  descripcion?: ReactNode;
  /** Estado intermedio: usado en la casilla "seleccionar todo" de las tablas. */
  indeterminado?: boolean;
  invalido?: boolean;
}

export const Checkbox = forwardRef<HTMLInputElement, PropsCheckbox>(function Checkbox(
  { etiqueta, descripcion, indeterminado = false, invalido = false, className, ...resto },
  refExterna,
) {
  const refInterna = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (refInterna.current) refInterna.current.indeterminate = indeterminado;
  }, [indeterminado]);

  const asignarRef = (nodo: HTMLInputElement | null) => {
    refInterna.current = nodo;
    if (typeof refExterna === 'function') refExterna(nodo);
    else if (refExterna) refExterna.current = nodo;
  };

  const control = (
    <span className="relative inline-flex shrink-0 items-center justify-center">
      <input
        ref={asignarRef}
        type="checkbox"
        aria-invalid={invalido || undefined}
        className={cn(
          'peer size-4 appearance-none rounded-sm border border-borde-fuerte bg-superficie',
          'checked:bg-primario checked:border-primario indeterminate:bg-primario indeterminate:border-primario',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-anillo focus-visible:ring-offset-2 focus-visible:ring-offset-fondo',
          'disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer transition-colors',
          invalido && 'border-peligro',
          className,
        )}
        {...resto}
      />
      <span className="pointer-events-none absolute text-primario-texto opacity-0 peer-checked:opacity-100 peer-indeterminate:opacity-0">
        <Check className="size-3" strokeWidth={3.5} aria-hidden="true" />
      </span>
      <span className="pointer-events-none absolute text-primario-texto opacity-0 peer-indeterminate:opacity-100">
        <Minus className="size-3" strokeWidth={3.5} aria-hidden="true" />
      </span>
    </span>
  );

  if (!etiqueta && !descripcion) return control;

  return (
    <label className="flex items-start gap-2.5 cursor-pointer select-none">
      <span className="mt-0.5">{control}</span>
      <span className="flex flex-col gap-0.5">
        {etiqueta && <span className="text-sm text-texto leading-tight">{etiqueta}</span>}
        {descripcion && <span className="text-xs text-texto-tenue">{descripcion}</span>}
      </span>
    </label>
  );
});
