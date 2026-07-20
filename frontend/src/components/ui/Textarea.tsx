import { forwardRef, type TextareaHTMLAttributes } from 'react';
import { cn } from '@/lib/cn';
import { CLASES_CAMPO } from './Input';

export interface PropsTextarea extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  invalido?: boolean;
  /** Muestra el contador de caracteres; requiere maxLength. */
  conContador?: boolean;
}

export const Textarea = forwardRef<HTMLTextAreaElement, PropsTextarea>(function Textarea(
  { invalido = false, conContador = false, className, maxLength, value, rows = 3, ...resto },
  ref,
) {
  const largo = typeof value === 'string' ? value.length : 0;

  return (
    <div className="relative">
      <textarea
        ref={ref}
        rows={rows}
        maxLength={maxLength}
        value={value}
        aria-invalid={invalido || undefined}
        className={cn(
          CLASES_CAMPO,
          'px-3 py-2 text-sm resize-y min-h-[72px] barra-fina',
          invalido && 'border-peligro focus:ring-peligro focus:border-peligro',
          conContador && maxLength && 'pb-6',
          className,
        )}
        {...resto}
      />
      {conContador && maxLength && (
        <span className="absolute bottom-2 right-3 text-[11px] text-texto-tenue tabular-nums pointer-events-none">
          {largo}/{maxLength}
        </span>
      )}
    </div>
  );
});
