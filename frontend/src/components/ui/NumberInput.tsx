import { forwardRef, useCallback, type InputHTMLAttributes } from 'react';
import { Minus, Plus } from 'lucide-react';
import { cn } from '@/lib/cn';
import { CLASES_CAMPO, TAMANOS_CAMPO, type TamanoCampo } from './Input';

type PropsBase = Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'size'>;

export interface PropsNumberInput extends PropsBase {
  value: number | null;
  onChange: (valor: number | null) => void;
  tamano?: TamanoCampo;
  invalido?: boolean;
  min?: number;
  max?: number;
  /** Incremento de los botones + y −. */
  paso?: number;
  /** Decimales permitidos. Cantidades de inventario usan 3 (DECIMAL(14,3)). */
  decimales?: number;
  /** Muestra los botones de incremento a los lados. */
  conBotones?: boolean;
  sufijo?: string;
}

/**
 * Campo numerico controlado. Permite el estado vacio (null) para que un
 * formulario pueda distinguir "sin valor" de "cero".
 */
export const NumberInput = forwardRef<HTMLInputElement, PropsNumberInput>(function NumberInput(
  {
    value,
    onChange,
    tamano = 'md',
    invalido = false,
    min,
    max,
    paso = 1,
    decimales = 0,
    conBotones = false,
    sufijo,
    className,
    disabled,
    ...resto
  },
  ref,
) {
  const acotar = useCallback(
    (n: number): number => {
      let salida = n;
      if (typeof min === 'number' && salida < min) salida = min;
      if (typeof max === 'number' && salida > max) salida = max;
      const factor = 10 ** decimales;
      return Math.round(salida * factor) / factor;
    },
    [min, max, decimales],
  );

  const alEscribir = (texto: string) => {
    if (texto.trim() === '') {
      onChange(null);
      return;
    }
    // Acepta coma o punto como separador decimal (teclado numerico es-CO).
    const normalizado = texto.replace(',', '.');
    if (!/^-?\d*\.?\d*$/.test(normalizado)) return;
    const n = Number(normalizado);
    if (!Number.isFinite(n)) return;
    onChange(n);
  };

  const ajustar = (delta: number) => {
    onChange(acotar((value ?? 0) + delta));
  };

  const alSalir = () => {
    if (value === null) return;
    const acotado = acotar(value);
    if (acotado !== value) onChange(acotado);
  };

  const campo = (
    <input
      ref={ref}
      type="text"
      inputMode={decimales > 0 ? 'decimal' : 'numeric'}
      value={value === null ? '' : String(value)}
      onChange={(e) => alEscribir(e.target.value)}
      onBlur={alSalir}
      disabled={disabled}
      aria-invalid={invalido || undefined}
      className={cn(
        CLASES_CAMPO,
        TAMANOS_CAMPO[tamano],
        'cifra text-right',
        invalido && 'border-peligro focus:ring-peligro focus:border-peligro',
        conBotones && 'rounded-none border-x-0 text-center',
        sufijo && !conBotones && 'pr-10',
        className,
      )}
      {...resto}
    />
  );

  if (!conBotones) {
    if (!sufijo) return campo;
    return (
      <div className="relative">
        {campo}
        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-texto-tenue pointer-events-none">
          {sufijo}
        </span>
      </div>
    );
  }

  const claseBoton = cn(
    'inline-flex items-center justify-center shrink-0 border border-borde bg-superficie-alt',
    'text-texto-suave hover:bg-borde hover:text-texto transition-colors',
    'disabled:opacity-50 disabled:cursor-not-allowed',
    tamano === 'sm' ? 'size-8' : tamano === 'lg' ? 'size-11' : 'size-10',
  );

  return (
    <div className="flex items-stretch">
      <button
        type="button"
        aria-label="Disminuir"
        onClick={() => ajustar(-paso)}
        disabled={disabled || (typeof min === 'number' && (value ?? 0) <= min)}
        className={cn(claseBoton, 'rounded-l-md')}
      >
        <Minus className="size-4" aria-hidden="true" />
      </button>
      {campo}
      <button
        type="button"
        aria-label="Aumentar"
        onClick={() => ajustar(paso)}
        disabled={disabled || (typeof max === 'number' && (value ?? 0) >= max)}
        className={cn(claseBoton, 'rounded-r-md')}
      >
        <Plus className="size-4" aria-hidden="true" />
      </button>
    </div>
  );
});
