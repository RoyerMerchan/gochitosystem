import { forwardRef, useEffect, useState, type InputHTMLAttributes } from 'react';
import { cn } from '@/lib/cn';
import { formatearMonedaSinSimbolo, parsearMoneda } from '@/lib/formato';
import { CLASES_CAMPO, TAMANOS_CAMPO, type TamanoCampo } from './Input';

type PropsBase = Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'size'>;

export interface PropsCurrencyInput extends PropsBase {
  value: number | null;
  onChange: (valor: number | null) => void;
  tamano?: TamanoCampo;
  invalido?: boolean;
  min?: number;
  max?: number;
  /** Permite valores negativos (notas credito, ajustes de caja). */
  permitirNegativo?: boolean;
}

/**
 * Campo de dinero en pesos colombianos. Trabaja SIEMPRE con enteros: el peso
 * no maneja centavos en la interfaz. Muestra el valor con separador de miles
 * mientras se escribe.
 */
export const CurrencyInput = forwardRef<HTMLInputElement, PropsCurrencyInput>(
  function CurrencyInput(
    {
      value,
      onChange,
      tamano = 'md',
      invalido = false,
      min,
      max,
      permitirNegativo = false,
      className,
      disabled,
      ...resto
    },
    ref,
  ) {
    const [texto, setTexto] = useState<string>(
      value === null ? '' : formatearMonedaSinSimbolo(value),
    );

    // Resincroniza cuando el valor cambia desde afuera (reset de formulario).
    useEffect(() => {
      const actual = parsearMoneda(texto);
      if (value === null && texto !== '') setTexto('');
      else if (value !== null && value !== actual) setTexto(formatearMonedaSinSimbolo(value));
      // Solo debe reaccionar al valor externo.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [value]);

    const alEscribir = (entrada: string) => {
      if (entrada.trim() === '') {
        setTexto('');
        onChange(null);
        return;
      }

      const negativo = permitirNegativo && entrada.trim().startsWith('-');
      const digitos = entrada.replace(/\D/g, '');

      if (digitos === '') {
        setTexto(negativo ? '-' : '');
        onChange(null);
        return;
      }

      let numero = Number(digitos);
      if (negativo) numero = -numero;
      if (typeof min === 'number' && numero < min) numero = min;
      if (typeof max === 'number' && numero > max) numero = max;

      setTexto(formatearMonedaSinSimbolo(numero));
      onChange(numero);
    };

    return (
      <div className="relative">
        <span
          className="absolute left-3 top-1/2 -translate-y-1/2 text-texto-tenue text-sm pointer-events-none"
          aria-hidden="true"
        >
          $
        </span>
        <input
          ref={ref}
          type="text"
          inputMode="numeric"
          autoComplete="off"
          value={texto}
          onChange={(e) => alEscribir(e.target.value)}
          disabled={disabled}
          aria-invalid={invalido || undefined}
          className={cn(
            CLASES_CAMPO,
            TAMANOS_CAMPO[tamano],
            'cifra text-right pl-7',
            invalido && 'border-peligro focus:ring-peligro focus:border-peligro',
            className,
          )}
          {...resto}
        />
      </div>
    );
  },
);
