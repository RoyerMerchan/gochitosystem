/** Inventario: existencias valorizadas en USD y verificación de reconciliación. */
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Boxes, CheckCircle2, AlertTriangle, Search } from 'lucide-react';
import { obtenerPaginado, obtener } from '@/lib/axios';
import { Card, Cargando, EmptyState } from '@/components/ui/Feedback';
import { toast } from '@/store/toastStore';
import { useDebounce } from '@/hooks/useDebounce';
import { formatearUSD, formatearCantidad } from '@/lib/formato';

interface Existencia {
  id: number; sku: string; nombre: string; categoria: string;
  cantidad: string; stock_minimo: string; costo_promedio: string; valor_usd: string;
}

export default function InventarioPage() {
  const [busqueda, setBusqueda] = useState('');
  const [soloBajo, setSoloBajo] = useState(false);
  const q = useDebounce(busqueda, 300);

  const existencias = useQuery({
    queryKey: ['existencias', q, soloBajo],
    queryFn: () => obtenerPaginado<Existencia>(`/inventario/existencias?limite=200${q ? `&busqueda=${encodeURIComponent(q)}` : ''}${soloBajo ? '&stockBajo=true' : ''}`),
  });

  const reconciliar = async () => {
    try {
      const r = await obtener<{ diferencias: unknown[]; cuadrado: boolean }>('/inventario/reconciliacion');
      if (r.cuadrado) toast.exito('Inventario cuadrado: stock = ledger, sin diferencias');
      else toast.error(`${r.diferencias.length} producto(s) con diferencia entre stock y ledger`);
    } catch {
      toast.error('No se pudo reconciliar');
    }
  };

  const filas = existencias.data?.datos ?? [];
  const valorTotal = filas.reduce((a, e) => a + Number(e.valor_usd), 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Inventario</h1>
          <p className="text-sm text-gray-500">Valor total: {formatearUSD(valorTotal)}</p>
        </div>
        <div className="flex gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Buscar…"
              className="rounded-lg border border-gray-300 py-2 pl-9 pr-3 text-sm dark:border-gray-600 dark:bg-gray-800" />
          </div>
          <button onClick={() => setSoloBajo((v) => !v)} className={`rounded-lg border px-3 py-2 text-sm ${soloBajo ? 'border-amber-500 bg-amber-50 text-amber-700 dark:bg-amber-900/20' : 'border-gray-300 dark:border-gray-600'}`}>Stock bajo</button>
          <button onClick={reconciliar} className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700">
            <CheckCircle2 className="h-4 w-4" /> Reconciliar
          </button>
        </div>
      </div>

      <Card padding={false}>
        {existencias.isLoading ? <Cargando /> : filas.length === 0 ? (
          <EmptyState titulo="Sin existencias" icono={<Boxes className="h-12 w-12" />} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs uppercase text-gray-500 dark:bg-gray-700/50">
                <tr>
                  <th className="p-3 text-left">SKU</th><th className="p-3 text-left">Producto</th>
                  <th className="p-3 text-left">Categoría</th><th className="p-3 text-right">Stock</th>
                  <th className="p-3 text-right">Mínimo</th><th className="p-3 text-right">Costo prom.</th>
                  <th className="p-3 text-right">Valor USD</th>
                </tr>
              </thead>
              <tbody>
                {filas.map((e) => {
                  const bajo = Number(e.cantidad) <= Number(e.stock_minimo);
                  return (
                    <tr key={e.id} className="border-t border-gray-100 dark:border-gray-700">
                      <td className="p-3 font-mono text-xs text-gray-500">{e.sku}</td>
                      <td className="p-3 font-medium">{e.nombre}</td>
                      <td className="p-3 text-gray-500">{e.categoria}</td>
                      <td className="p-3 text-right">
                        <span className={bajo ? 'font-semibold text-red-600' : ''}>{formatearCantidad(e.cantidad)}</span>
                        {bajo && <AlertTriangle className="ml-1 inline h-3.5 w-3.5 text-red-500" />}
                      </td>
                      <td className="p-3 text-right text-gray-400">{formatearCantidad(e.stock_minimo)}</td>
                      <td className="p-3 text-right tabular-nums text-gray-500">{formatearUSD(e.costo_promedio)}</td>
                      <td className="p-3 text-right tabular-nums font-medium">{formatearUSD(e.valor_usd)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
