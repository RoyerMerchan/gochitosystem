/** Modal accesible con backdrop. Cierra con Esc y clic fuera. */
import { useEffect, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { cn } from '@/lib/cn';

interface ModalProps {
  abierto: boolean;
  onCerrar: () => void;
  titulo?: string;
  children: ReactNode;
  pie?: ReactNode;
  ancho?: 'sm' | 'md' | 'lg' | 'xl';
}

const ANCHOS = { sm: 'max-w-sm', md: 'max-w-md', lg: 'max-w-2xl', xl: 'max-w-4xl' } as const;

export function Modal({ abierto, onCerrar, titulo, children, pie, ancho = 'md' }: ModalProps) {
  useEffect(() => {
    if (!abierto) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCerrar();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [abierto, onCerrar]);

  if (!abierto) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onCerrar} />
      <div
        className={cn(
          'relative z-10 flex max-h-[90vh] w-full flex-col rounded-xl bg-white shadow-2xl dark:bg-gray-800',
          ANCHOS[ancho],
        )}
      >
        {titulo && (
          <div className="flex items-center justify-between border-b border-gray-200 p-4 dark:border-gray-700">
            <h3 className="text-lg font-semibold">{titulo}</h3>
            <button onClick={onCerrar} className="text-gray-400 hover:text-gray-600">
              <X className="h-5 w-5" />
            </button>
          </div>
        )}
        <div className="flex-1 overflow-y-auto p-4">{children}</div>
        {pie && <div className="border-t border-gray-200 p-4 dark:border-gray-700">{pie}</div>}
      </div>
    </div>
  );
}
