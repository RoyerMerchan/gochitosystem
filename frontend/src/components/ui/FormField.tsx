import { useId, type ReactElement, type ReactNode, cloneElement } from 'react';
import { cn } from '@/lib/cn';

export interface PropsFormField {
  etiqueta?: ReactNode;
  /** Mensaje de error; si viene, tiene prioridad sobre la ayuda. */
  error?: string | undefined;
  ayuda?: ReactNode;
  requerido?: boolean;
  className?: string;
  /** Se clona para inyectarle id, aria-describedby y aria-invalid. */
  children: ReactElement<{
    id?: string;
    'aria-describedby'?: string;
    'aria-invalid'?: boolean;
    invalido?: boolean;
  }>;
}

/**
 * Envoltura de un control de formulario: etiqueta, mensaje de error y texto de
 * ayuda, con las relaciones de accesibilidad ya cableadas.
 */
export function FormField({
  etiqueta,
  error,
  ayuda,
  requerido = false,
  className,
  children,
}: PropsFormField) {
  const idGenerado = useId();
  const idCampo = children.props.id ?? idGenerado;
  const idError = `${idCampo}-error`;
  const idAyuda = `${idCampo}-ayuda`;

  const descrito = [error ? idError : null, ayuda && !error ? idAyuda : null]
    .filter(Boolean)
    .join(' ');

  const control = cloneElement(children, {
    id: idCampo,
    'aria-invalid': error ? true : undefined,
    'aria-describedby': descrito || undefined,
    invalido: Boolean(error),
  });

  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      {etiqueta && (
        <label htmlFor={idCampo} className="text-sm font-medium text-texto">
          {etiqueta}
          {requerido && (
            <span className="text-peligro ml-0.5" aria-hidden="true">
              *
            </span>
          )}
        </label>
      )}

      {control}

      {error ? (
        <p id={idError} role="alert" className="text-xs text-peligro">
          {error}
        </p>
      ) : ayuda ? (
        <p id={idAyuda} className="text-xs text-texto-tenue">
          {ayuda}
        </p>
      ) : null}
    </div>
  );
}
