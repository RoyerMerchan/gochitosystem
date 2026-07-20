import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { LogIn, Loader2 } from 'lucide-react';
import { iniciarSesion } from '@/lib/authApi';
import { ErrorApi } from '@/lib/errores';
import { toast } from '@/store/toastStore';

export default function LoginPage() {
  const [identificador, setIdentificador] = useState('admin');
  const [password, setPassword] = useState('');
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const navegar = useNavigate();
  const [params] = useSearchParams();

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setCargando(true);
    try {
      await iniciarSesion({ identificador: identificador.trim(), password });
      toast.exito('Bienvenido a Los Gochitos');
      const destino = params.get('redirigir');
      navegar(destino ? decodeURIComponent(destino) : '/', { replace: true });
    } catch (err) {
      const mensaje = err instanceof ErrorApi ? err.message : 'No se pudo iniciar sesión';
      setError(mensaje);
    } finally {
      setCargando(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-amber-50 to-gray-100 p-4 dark:from-gray-900 dark:to-gray-800">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-500 text-2xl font-bold text-white shadow-lg">
            G
          </div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Mini Market Los Gochitos</h1>
          <p className="text-sm text-gray-500">Punto de venta e inventario</p>
        </div>

        <form
          onSubmit={enviar}
          className="space-y-4 rounded-2xl border border-gray-200 bg-white p-6 shadow-xl dark:border-gray-700 dark:bg-gray-800"
        >
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
              Usuario o correo
            </label>
            <input
              type="text"
              value={identificador}
              onChange={(e) => setIdentificador(e.target.value)}
              autoFocus
              className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-200 dark:border-gray-600 dark:bg-gray-700"
              placeholder="admin"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
              Contraseña
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-200 dark:border-gray-600 dark:bg-gray-700"
              placeholder="••••••••"
            />
          </div>

          {error && (
            <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-900/30 dark:text-red-300">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={cargando || !password}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-amber-500 py-2.5 font-semibold text-white transition-colors hover:bg-amber-600 disabled:opacity-50"
          >
            {cargando ? <Loader2 className="h-5 w-5 animate-spin" /> : <LogIn className="h-5 w-5" />}
            Ingresar
          </button>
        </form>

        <p className="mt-4 text-center text-xs text-gray-400">
          Residencia Kimura, Torre 10 Apto. PBD · 0412-6837180
        </p>
      </div>
    </div>
  );
}
