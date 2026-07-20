import { forwardRef, type SelectHTMLAttributes } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/cn';
import { CLASES_CAMPO, TAMANOS_CAMPO, type TamanoCampo } from './Input';

export interface OpcionSelect {
  valor: string | number;
  etiqueta: string;
  inhabilitada?: boolean;
}

export interface PropsSelect extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'size'> {
  opciones: readonly OpcionSelect[];
  tamano?: TamanoCampo;
  invalido?: boolean;
  /** Texto de la opcion vacia inicial. */
  marcador?: string;
}

export const Select = forwardRef<HTMLSelectElement, PropsSelect>(function Select(
  { opciones, tamano = 'md', invalido = false, marcador, className, ...resto },
  ref,
) {
  return (
    <div className="relative">
      <select
        ref={ref}
        aria-invalid={invalido || undefined}
        className={cn(
          CLASES_CAMPO,
          TAMANOS_CAMPO[tamano],
          'appearance-none pr-9 cursor-pointer',
          invalido && 'border-peligro focus:ring-peligro focus:border-peligro',
          className,
        )}
        {...resto}
      >
        {marcador && <option value="">{marcador}</option>}
        {opciones.map((o) => (
          <option key={o.valor} value={o.valor} disabled={o.inhabilitada}>
            {o.etiqueta}
          </option>
        ))}
      </select>
      <ChevronDown
        className="absolute right-3 top-1/2 -translate-y-1/2 size-4 text-texto-tenue pointer-events-none"
        aria-hidden="true"
      />
    </div>
  );
});
