/** Placeholder para módulos cuyo backend aún está en construcción. */
import { Construction } from 'lucide-react';

export default function EnConstruccion({ titulo }: { titulo: string }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
      <Construction className="h-16 w-16 text-amber-400" />
      <div>
        <h1 className="text-2xl font-bold">{titulo}</h1>
        <p className="mt-1 max-w-md text-gray-500">
          Este módulo está en construcción. El núcleo del sistema (POS, ventas, productos,
          tasa y caja) ya funciona.
        </p>
      </div>
    </div>
  );
}
