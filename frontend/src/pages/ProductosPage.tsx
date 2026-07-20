/** Productos: listado con búsqueda, crear, editar y borrar. */
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Search, Package, AlertTriangle, Plus, Pencil, Trash2 } from 'lucide-react';
import { obtenerPaginado, obtener, crear, reemplazar, eliminar } from '@/lib/axios';
import { ErrorApi } from '@/lib/errores';
import { Card, Cargando, EmptyState } from '@/components/ui/Feedback';
import { Modal } from '@/components/ui/Modal';
import { useConfirm } from '@/hooks/useConfirm';
import { toast } from '@/store/toastStore';
import { useDebounce } from '@/hooks/useDebounce';
import { formatearUSD, formatearBs, formatearCantidad } from '@/lib/formato';
import type { Producto } from '@/lib/tipos';

interface Cat { id: number; nombre: string; }
interface Uni { id: number; codigo: string; nombre: string; }
interface Imp { id: number; nombre: string; tasa: string; }

const VACIO = {
  sku: '', nombre: '', descripcion: '', categoriaId: 0, unidadMedidaId: 0, impuestoId: 0,
  precioVenta: '', costoInicial: '0', stockMinimo: '0', esPesable: false, esFavoritoPos: true, codigoBarras: '',
};

export default function ProductosPage() {
  const qc = useQueryClient();
  const confirm = useConfirm();
  const [busqueda, setBusqueda] = useState('');
  const [soloStockBajo, setSoloStockBajo] = useState(false);
  const [modal, setModal] = useState(false);
  const [editando, setEditando] = useState<number | null>(null);
  const [form, setForm] = useState(VACIO);
  const q = useDebounce(busqueda, 300);

  const productos = useQuery({
    queryKey: ['productos', q, soloStockBajo],
    queryFn: () => obtenerPaginado<Producto>(`/productos?limite=200${q ? `&busqueda=${encodeURIComponent(q)}` : ''}${soloStockBajo ? '&stockBajo=true' : ''}`),
  });
  const cats = useQuery({ queryKey: ['categorias'], queryFn: () => obtener<Cat[]>('/categorias') });
  const unis = useQuery({ queryKey: ['unidades'], queryFn: () => obtener<Uni[]>('/unidades-medida') });
  const imps = useQuery({ queryKey: ['impuestos'], queryFn: () => obtener<Imp[]>('/impuestos') });

  const guardar = useMutation({
    mutationFn: (d: typeof VACIO) => editando ? reemplazar(`/productos/${editando}`, d) : crear('/productos', d),
    onSuccess: () => { toast.exito(editando ? 'Producto actualizado' : 'Producto creado'); qc.invalidateQueries({ queryKey: ['productos'] }); setModal(false); },
    onError: (e) => toast.error(e instanceof ErrorApi ? e.message : 'No se pudo guardar'),
  });

  const borrar = useMutation({
    mutationFn: (id: number) => eliminar(`/productos/${id}`),
    onSuccess: () => { toast.exito('Producto eliminado'); qc.invalidateQueries({ queryKey: ['productos'] }); },
    onError: (e) => toast.error(e instanceof ErrorApi ? e.message : 'No se pudo eliminar'),
  });

  const abrirNuevo = () => {
    setEditando(null);
    setForm({ ...VACIO, categoriaId: cats.data?.[0]?.id ?? 0, unidadMedidaId: unis.data?.[0]?.id ?? 0, impuestoId: imps.data?.find((i) => i.tasa === '0.000')?.id ?? imps.data?.[0]?.id ?? 0 });
    setModal(true);
  };
  const abrirEditar = (p: Producto) => {
    setEditando(p.id);
    setForm({ sku: p.sku, nombre: p.nombre, descripcion: '', categoriaId: p.categoria_id, unidadMedidaId: 0, impuestoId: p.impuesto_id, precioVenta: p.precio_venta, costoInicial: p.costo_promedio, stockMinimo: p.stock_minimo, esPesable: p.es_pesable === 1, esFavoritoPos: p.es_favorito_pos === 1, codigoBarras: '' });
    // La unidad no viene en el listado; se deja la primera si no se sabe.
    setForm((f) => ({ ...f, unidadMedidaId: unis.data?.[0]?.id ?? 0 }));
    setModal(true);
  };
  const pedirBorrar = async (p: Producto) => {
    if (await confirm({ titulo: 'Eliminar producto', mensaje: `¿Eliminar "${p.nombre}"? Dejará de aparecer en el catálogo.`, confirmar: 'Eliminar', peligro: true })) {
      borrar.mutate(p.id);
    }
  };

  const filas = productos.data?.datos ?? [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h1 className="text-2xl font-bold">Productos</h1><p className="text-sm text-gray-500">{productos.data?.meta.total ?? 0} productos · precios en USD</p></div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Buscar…" className="rounded-lg border border-gray-300 py-2 pl-9 pr-3 text-sm dark:border-gray-600 dark:bg-gray-800" />
          </div>
          <button onClick={() => setSoloStockBajo((v) => !v)} className={`rounded-lg border px-3 py-2 text-sm ${soloStockBajo ? 'border-amber-500 bg-amber-50 text-amber-700 dark:bg-amber-900/20' : 'border-gray-300 dark:border-gray-600'}`}>Stock bajo</button>
          <button onClick={abrirNuevo} className="flex items-center gap-2 rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-600"><Plus className="h-4 w-4" /> Nuevo</button>
        </div>
      </div>

      <Card padding={false}>
        {productos.isLoading ? <Cargando /> : filas.length === 0 ? (
          <EmptyState titulo="Sin productos" icono={<Package className="h-12 w-12" />} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs uppercase text-gray-500 dark:bg-gray-700/50"><tr>
                <th className="p-3 text-left">SKU</th><th className="p-3 text-left">Producto</th><th className="p-3 text-left">Categoría</th>
                <th className="p-3 text-right">Precio USD</th><th className="p-3 text-right">Precio Bs</th><th className="p-3 text-right">Stock</th><th className="p-3"></th>
              </tr></thead>
              <tbody>
                {filas.map((p) => {
                  const stockBajo = Number(p.cantidad) <= Number(p.stock_minimo);
                  return (
                    <tr key={p.id} className="border-t border-gray-100 dark:border-gray-700">
                      <td className="p-3 font-mono text-xs text-gray-500">{p.sku}</td>
                      <td className="p-3 font-medium">{p.nombre}</td>
                      <td className="p-3 text-gray-500">{p.categoria_nombre}</td>
                      <td className="p-3 text-right tabular-nums">{formatearUSD(p.precio_venta)}</td>
                      <td className="p-3 text-right tabular-nums text-gray-500">{formatearBs(p.precio_venta_bs)}</td>
                      <td className="p-3 text-right"><span className={stockBajo ? 'font-semibold text-red-600' : ''}>{formatearCantidad(p.cantidad)}</span>{stockBajo && <AlertTriangle className="ml-1 inline h-3.5 w-3.5 text-red-500" />}</td>
                      <td className="p-3">
                        <div className="flex justify-end gap-1">
                          <button onClick={() => abrirEditar(p)} className="text-gray-400 hover:text-amber-600"><Pencil className="h-4 w-4" /></button>
                          <button onClick={() => pedirBorrar(p)} className="text-gray-400 hover:text-red-500"><Trash2 className="h-4 w-4" /></button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Modal abierto={modal} onCerrar={() => setModal(false)} titulo={editando ? 'Editar producto' : 'Nuevo producto'} ancho="lg"
        pie={<div className="flex justify-end gap-2"><button onClick={() => setModal(false)} className="rounded-lg border border-gray-300 px-4 py-2 text-sm dark:border-gray-600">Cancelar</button>
          <button onClick={() => guardar.mutate(form)} disabled={!form.sku || !form.nombre || !form.precioVenta || guardar.isPending} className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-600 disabled:opacity-50">Guardar</button></div>}>
        <div className="grid grid-cols-2 gap-3">
          <Campo label="Código / SKU *"><input value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} className={INP} /></Campo>
          <Campo label="Código de barras"><input value={form.codigoBarras} onChange={(e) => setForm({ ...form, codigoBarras: e.target.value })} className={INP} placeholder="Opcional" /></Campo>
          <Campo label="Nombre *" className="col-span-2"><input value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} className={INP} /></Campo>
          <Campo label="Categoría"><select value={form.categoriaId} onChange={(e) => setForm({ ...form, categoriaId: Number(e.target.value) })} className={INP}>{(cats.data ?? []).map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}</select></Campo>
          <Campo label="Unidad"><select value={form.unidadMedidaId} onChange={(e) => setForm({ ...form, unidadMedidaId: Number(e.target.value) })} className={INP}>{(unis.data ?? []).map((u) => <option key={u.id} value={u.id}>{u.nombre}</option>)}</select></Campo>
          <Campo label="Impuesto"><select value={form.impuestoId} onChange={(e) => setForm({ ...form, impuestoId: Number(e.target.value) })} className={INP}>{(imps.data ?? []).map((i) => <option key={i.id} value={i.id}>{i.nombre}</option>)}</select></Campo>
          <Campo label="Precio de venta (USD) *"><input type="number" step="0.01" value={form.precioVenta} onChange={(e) => setForm({ ...form, precioVenta: e.target.value })} className={INP} /></Campo>
          {!editando && <Campo label="Costo inicial (USD)"><input type="number" step="0.0001" value={form.costoInicial} onChange={(e) => setForm({ ...form, costoInicial: e.target.value })} className={INP} /></Campo>}
          <label className="col-span-2 flex items-center gap-4 text-sm">
            <span className="flex items-center gap-2"><input type="checkbox" checked={form.esFavoritoPos} onChange={(e) => setForm({ ...form, esFavoritoPos: e.target.checked })} /> Favorito en POS</span>
            <span className="flex items-center gap-2"><input type="checkbox" checked={form.esPesable} onChange={(e) => setForm({ ...form, esPesable: e.target.checked })} /> Se vende por peso</span>
          </label>
        </div>
      </Modal>
    </div>
  );
}
const INP = 'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-amber-500 focus:outline-none dark:border-gray-600 dark:bg-gray-700';
function Campo({ label, children, className = '' }: { label: string; children: React.ReactNode; className?: string }) {
  return <div className={className}><label className="mb-1 block text-xs font-medium text-gray-500">{label}</label>{children}</div>;
}
