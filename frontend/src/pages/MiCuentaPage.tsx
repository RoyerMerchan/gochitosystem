/** Mi cuenta: datos del usuario actual y cambio de contraseña propia. */
import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { UserCircle, KeyRound } from 'lucide-react';
import { cambiarPassword } from '@/lib/authApi';
import { ErrorApi } from '@/lib/errores';
import { Card } from '@/components/ui/Feedback';
import { toast } from '@/store/toastStore';
import { useAuthStore } from '@/store/authStore';

export default function MiCuentaPage() {
  const usuario = useAuthStore((s) => s.usuario);
  const [actual, setActual] = useState('');
  const [nueva, setNueva] = useState('');
  const [confirmar, setConfirmar] = useState('');

  const cambiar = useMutation({
    mutationFn: () => cambiarPassword({ passwordActual: actual, passwordNueva: nueva }),
    onSuccess: () => { toast.exito('Contraseña actualizada'); setActual(''); setNueva(''); setConfirmar(''); },
    onError: (e) => toast.error(e instanceof ErrorApi ? e.message : 'No se pudo cambiar'),
  });

  const coincide = nueva.length >= 8 && nueva === confirmar;

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <h1 className="text-2xl font-bold">Mi cuenta</h1>

      <Card>
        <div className="flex items-center gap-3">
          <UserCircle className="h-12 w-12 text-gray-400" />
          <div>
            <p className="font-semibold">{usuario?.nombreCompleto}</p>
            <p className="text-sm text-gray-500">{usuario?.usuario} · {usuario?.rolCodigo}</p>
          </div>
        </div>
      </Card>

      <Card>
        <h2 className="mb-3 flex items-center gap-2 font-semibold"><KeyRound className="h-5 w-5" /> Cambiar mi contraseña</h2>
        <div className="space-y-3">
          <div><label className="mb-1 block text-xs font-medium text-gray-500">Contraseña actual</label>
            <input type="password" value={actual} onChange={(e) => setActual(e.target.value)} className={INP} /></div>
          <div><label className="mb-1 block text-xs font-medium text-gray-500">Nueva contraseña (mín. 8 caracteres)</label>
            <input type="password" value={nueva} onChange={(e) => setNueva(e.target.value)} className={INP} /></div>
          <div><label className="mb-1 block text-xs font-medium text-gray-500">Confirmar nueva contraseña</label>
            <input type="password" value={confirmar} onChange={(e) => setConfirmar(e.target.value)} className={INP} />
            {confirmar && nueva !== confirmar && <p className="mt-1 text-xs text-red-500">No coinciden</p>}
          </div>
          <button onClick={() => cambiar.mutate()} disabled={!actual || !coincide || cambiar.isPending}
            className="w-full rounded-lg bg-amber-500 py-2.5 font-semibold text-white hover:bg-amber-600 disabled:opacity-50">Cambiar contraseña</button>
        </div>
      </Card>
    </div>
  );
}
const INP = 'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-amber-500 focus:outline-none dark:border-gray-600 dark:bg-gray-700';
