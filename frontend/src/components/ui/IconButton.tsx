import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/cn';
import type { VarianteBoton } from './Button';

const VARIANTES: Record<VarianteBoton, string> = {
  primario: 'bg-primario text-primario-texto hover:bg-primario-fuerte',
  secundario: 'bg-superficie-alt text-texto border border-borde hover:bg-borde',
  contorno: 'border border-borde-fuerte text-texto hover:bg-superficie-alt',
  fantasma: 'text-texto-suave hover:bg-superficie-alt hover:text-texto',
  peligro: 'bg-peligro text-white hover:brightness-110',
  exito: 'bg-exito text-white hover:brightness-110',
  enlace: 'text-primario hover:underline',
};

const TAMANOS = {
  sm: 'size-8 rounded-md [&_svg]:size-4',
  md: 'size-10 rounded-md [&_svg]:size-[18px]',
  lg: 'size-11 rounded-lg [&_svg]:size-5',
} as const;

export interface PropsIconButton extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Obligatorio: el boton no tiene texto visible. */
  etiqueta: string;
  icono: ReactNode;
  variante?: VarianteBoton;
  tamano?: keyof typeof TAMANOS;
  cargando?: boolean;
}

export const IconButton = forwardRef<HTMLButtonElement, PropsIconButton>(function IconButton(
  {
    etiqueta,
    icono,
    variante = 'fantasma',
    tamano = 'md',
    cargando = false,
    className,
    disabled,
    type = 'button',
    ...resto
  },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      aria-label={etiqueta}
      title={etiqueta}
      disabled={disabled || cargando}
      className={cn(
        'inline-flex items-center justify-center transition-colors shrink-0',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-anillo focus-visible:ring-offset-2 focus-visible:ring-offset-fondo',
        'disabled:opacity-50 disabled:cursor-not-allowed',
        VARIANTES[variante],
        TAMANOS[tamano],
        className,
      )}
      {...resto}
    >
      {cargando ? <Loader2 className="animate-spin" aria-hidden="true" /> : icono}
    </button>
  );
});
