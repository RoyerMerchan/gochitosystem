/** Categorías de productos: listar, crear, editar y borrar. */
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Tags, Plus, Pencil, Trash2 } from 'lucide-react';
import { obtener, crear, reemplazar, eliminar } from '@/lib/axios';
import { ErrorApi } from '@/lib/errores';
import { Card, Cargando, EmptyState } from '@/components/ui/Feedback';
import { Modal } from '@/components/ui/Modal';
import { useConfirm } from '@/hooks/useConfirm';
import { toast } from '@/store/toastStore';

interface Categoria { id: number; nombre: string; descripcion: string | null; productos: number; }

export default function CategoriasPage() {
  const qc = useQueryClient();
  const confirm = useConfirm();
  const [modal, setModal] = useState(false);
  const [editando, setEditando] = useState<number | null>(null);
  const [nombre, setNombre] = useState('');
  const [descripcion, setDescripcion] = useState('');

  const cats = useQuery({ queryKey: ['categorias'], queryFn: () => obtener<Categoria[]>('/categorias') });

  const guardar = useMutation({
    mutationFn: () => editando ? reemplazar(`/categorias/${editando}`, { nombre, descripcion }) : crear('/categorias', { nombre, descripcion }),
    onSuccess: () => { toast.exito(editando ? 'Categoría actualizada' : 'Categoría creada'); qc.invalidateQueries({ queryKey: ['categorias'] }); setModal(false); },
    onError: (e) => toast.error(e instanceof ErrorApi ? e.message : 'No se pudo guardar'),
  });

  const borrar = useMutation({
    mutationFn: (id: number) => eliminar(`/categorias/${id}`),
    onSuccess: () => { toast.exito('Categoría eliminada'); qc.invalidateQueries({ queryKey: ['categorias'] }); },
    onError: (e) => toast.error(e instanceof ErrorApi ? e.message : 'No se pudo eliminar (¿tiene productos?)'),
  });

  const abrirNuevo = () => { setEditando(null); setNombre(''); setDescripcion(''); setModal(true); };
  const abrirEditar = (c: Categoria) => { setEditando(c.id); setNombre(c.nombre); setDescripcion(c.descripcion ?? ''); setModal(true); };
  const pedirBorrar = async (c: Categoria) => {
    if (c.productos > 0) { toast.error(`No se puede eliminar: tiene ${c.productos} producto(s)`); return; }
    if (await confirm({ titulo: 'Eliminar categoría', mensaje: `¿Eliminar "${c.nombre}"?`, confirmar: 'Eliminar', peligro: true })) borrar.mutate(c.id);
  };

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-bold">Categorías</h1><p className="text-sm text-gray-500">Rubros de tus productos</p></div>
        <button onClick={abrirNuevo} className="flex items-center gap-2 rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-600"><Plus className="h-4 w-4" /> Nueva</button>
      </div>

      <Card padding={false}>
        {cats.isLoading ? <Cargando /> : (cats.data ?? []).length === 0 ? (
          <EmptyState titulo="Sin categorías" icono={<Tags className="h-12 w-12" />} />
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs uppercase text-gray-500 dark:bg-gray-700/50"><tr>
              <th className="p-3 text-left">Categoría</th><th className="p-3 text-left">Descripción</th>
              <th className="p-3 text-right">Productos</th><th className="p-3"></th></tr></thead>
            <tbody>
              {cats.data!.map((c) => (
                <tr key={c.id} className="border-t border-gray-100 dark:border-gray-700">
                  <td className="p-3 font-medium">{c.nombre}</td>
                  <td className="p-3 text-gray-500">{c.descripcion ?? '—'}</td>
                  <td className="p-3 text-right tabular-nums text-gray-500">{c.productos}</td>
                  <td className="p-3">
                    <div className="flex justify-end gap-1">
                      <button onClick={() => abrirEditar(c)} className="text-gray-400 hover:text-amber-600"><Pencil className="h-4 w-4" /></button>
                      <button onClick={() => pedirBorrar(c)} className="text-gray-400 hover:text-red-500"><Trash2 className="h-4 w-4" /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <Modal abierto={modal} onCerrar={() => setModal(false)} titulo={editando ? 'Editar categoría' : 'Nueva categoría'}
        pie={<div className="flex justify-end gap-2"><button onClick={() => setModal(false)} className="rounded-lg border border-gray-300 px-4 py-2 text-sm dark:border-gray-600">Cancelar</button>
          <button onClick={() => guardar.mutate()} disabled={!nombre || guardar.isPending} className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-600 disabled:opacity-50">Guardar</button></div>}>
        <div className="space-y-3">
          <div><label className="mb-1 block text-xs font-medium text-gray-500">Nombre *</label>
            <input value={nombre} onChange={(e) => setNombre(e.target.value)} autoFocus className={INP} /></div>
          <div><label className="mb-1 block text-xs font-medium text-gray-500">Descripción</label>
            <input value={descripcion} onChange={(e) => setDescripcion(e.target.value)} className={INP} /></div>
        </div>
      </Modal>
    </div>
  );
}
const INP = 'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-amber-500 focus:outline-none dark:border-gray-600 dark:bg-gray-700';
