import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/cn';

export type VarianteBoton =
  | 'primario'
  | 'secundario'
  | 'contorno'
  | 'fantasma'
  | 'peligro'
  | 'exito'
  | 'enlace';

export type TamanoBoton = 'sm' | 'md' | 'lg' | 'xl';

const VARIANTES: Record<VarianteBoton, string> = {
  primario:
    'bg-primario text-primario-texto hover:bg-primario-fuerte shadow-sutil disabled:hover:bg-primario',
  secundario:
    'bg-superficie-alt text-texto hover:bg-borde border border-borde disabled:hover:bg-superficie-alt',
  contorno:
    'bg-transparent text-texto border border-borde-fuerte hover:bg-superficie-alt disabled:hover:bg-transparent',
  fantasma: 'bg-transparent text-texto-suave hover:bg-superficie-alt hover:text-texto',
  peligro: 'bg-peligro text-white hover:brightness-110 shadow-sutil',
  exito: 'bg-exito text-white hover:brightness-110 shadow-sutil',
  enlace: 'bg-transparent text-primario hover:underline underline-offset-4 p-0 h-auto',
};

const TAMANOS: Record<TamanoBoton, string> = {
  sm: 'h-8 px-3 text-xs gap-1.5 rounded-md',
  md: 'h-10 px-4 text-sm gap-2 rounded-md',
  lg: 'h-11 px-5 text-sm gap-2 rounded-lg',
  xl: 'h-14 px-6 text-base gap-2.5 rounded-lg font-semibold',
};

export interface PropsBoton extends ButtonHTMLAttributes<HTMLButtonElement> {
  variante?: VarianteBoton;
  tamano?: TamanoBoton;
  cargando?: boolean;
  iconoIzquierda?: ReactNode;
  iconoDerecha?: ReactNode;
  /** Ocupa todo el ancho disponible. */
  bloque?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, PropsBoton>(function Button(
  {
    variante = 'primario',
    tamano = 'md',
    cargando = false,
    iconoIzquierda,
    iconoDerecha,
    bloque = false,
    className,
    disabled,
    children,
    type = 'button',
    ...resto
  },
  ref,
) {
  const inhabilitado = disabled || cargando;

  return (
    <button
      ref={ref}
      type={type}
      disabled={inhabilitado}
      aria-busy={cargando || undefined}
      className={cn(
        'inline-flex items-center justify-center font-medium transition-colors select-none',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-anillo focus-visible:ring-offset-2 focus-visible:ring-offset-fondo',
        'disabled:opacity-50 disabled:cursor-not-allowed',
        VARIANTES[variante],
        variante !== 'enlace' && TAMANOS[tamano],
        bloque && 'w-full',
        className,
      )}
      {...resto}
    >
      {cargando ? (
        <Loader2 className="size-4 animate-spin shrink-0" aria-hidden="true" />
      ) : (
        iconoIzquierda
      )}
      {children}
      {!cargando && iconoDerecha}
    </button>
  );
});
