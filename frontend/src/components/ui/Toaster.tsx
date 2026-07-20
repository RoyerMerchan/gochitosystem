/** Contenedor de notificaciones toast (esquina inferior derecha). */
import { CheckCircle2, XCircle, Info, X } from 'lucide-react';
import { useToastStore, type TipoToast } from '@/store/toastStore';
import { cn } from '@/lib/cn';

const ESTILOS: Record<TipoToast, { icono: typeof Info; clase: string }> = {
  exito: { icono: CheckCircle2, clase: 'border-green-500 bg-green-50 text-green-900 dark:bg-green-950 dark:text-green-100' },
  error: { icono: XCircle, clase: 'border-red-500 bg-red-50 text-red-900 dark:bg-red-950 dark:text-red-100' },
  info: { icono: Info, clase: 'border-blue-500 bg-blue-50 text-blue-900 dark:bg-blue-950 dark:text-blue-100' },
};

export function Toaster() {
  const toasts = useToastStore((s) => s.toasts);
  const quitar = useToastStore((s) => s.quitar);

  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-[100] flex w-full max-w-sm flex-col gap-2">
      {toasts.map((t) => {
        const { icono: Icono, clase } = ESTILOS[t.tipo];
        return (
          <div
            key={t.id}
            className={cn(
              'pointer-events-auto flex items-start gap-3 rounded-lg border-l-4 p-3 shadow-lg',
              clase,
            )}
          >
            <Icono className="mt-0.5 h-5 w-5 shrink-0" />
            <p className="flex-1 text-sm">{t.mensaje}</p>
            <button onClick={() => quitar(t.id)} className="opacity-60 hover:opacity-100">
              <X className="h-4 w-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
