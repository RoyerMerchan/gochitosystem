/** Clientes: listado, crear y editar. */
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Users, Plus, Pencil, Trash2, Search } from 'lucide-react';
import { obtenerPaginado, crear, reemplazar, eliminar } from '@/lib/axios';
import { ErrorApi } from '@/lib/errores';
import { Card, Cargando, Badge, EmptyState } from '@/components/ui/Feedback';
import { Modal } from '@/components/ui/Modal';
import { useConfirm } from '@/hooks/useConfirm';
import { toast } from '@/store/toastStore';
import { useDebounce } from '@/hooks/useDebounce';
import { formatearUSD } from '@/lib/formato';

interface Cliente {
  id: number; tipo_documento: string; documento: string | null; nombre: string;
  telefono: string | null; email: string | null; cupo_credito: string;
  dias_plazo: number; saldo_actual: string; es_permite_credito: number; esta_activo: number;
}

const VACIO = { nombre: '', documento: '', telefono: '', email: '', cupoCredito: '0', diasPlazo: 15, esPermiteCredito: false };

export default function ClientesPage() {
  const qc = useQueryClient();
  const confirm = useConfirm();
  const [busqueda, setBusqueda] = useState('');
  const q = useDebounce(busqueda, 300);
  const [modal, setModal] = useState(false);
  const [editando, setEditando] = useState<number | null>(null);
  const [form, setForm] = useState(VACIO);

  const clientes = useQuery({
    queryKey: ['clientes', q],
    queryFn: () => obtenerPaginado<Cliente>(`/clientes?limite=100${q ? `&busqueda=${encodeURIComponent(q)}` : ''}`),
  });

  const guardar = useMutation({
    mutationFn: (datos: typeof VACIO) =>
      editando ? reemplazar(`/clientes/${editando}`, datos) : crear('/clientes', datos),
    onSuccess: () => {
      toast.exito(editando ? 'Cliente actualizado' : 'Cliente creado');
      qc.invalidateQueries({ queryKey: ['clientes'] });
      setModal(false);
    },
    onError: (e) => toast.error(e instanceof ErrorApi ? e.message : 'No se pudo guardar'),
  });

  const borrar = useMutation({
    mutationFn: (id: number) => eliminar(`/clientes/${id}`),
    onSuccess: () => { toast.exito('Cliente eliminado'); qc.invalidateQueries({ queryKey: ['clientes'] }); },
    onError: (e) => toast.error(e instanceof ErrorApi ? e.message : 'No se pudo eliminar (¿tiene deuda?)'),
  });

  const pedirBorrar = async (c: Cliente) => {
    if (await confirm({ titulo: 'Eliminar cliente', mensaje: `¿Eliminar a "${c.nombre}"?`, confirmar: 'Eliminar', peligro: true })) {
      borrar.mutate(c.id);
    }
  };

  const abrirNuevo = () => { setEditando(null); setForm(VACIO); setModal(true); };
  const abrirEditar = (c: Cliente) => {
    setEditando(c.id);
    setForm({ nombre: c.nombre, documento: c.documento ?? '', telefono: c.telefono ?? '', email: c.email ?? '', cupoCredito: c.cupo_credito, diasPlazo: c.dias_plazo, esPermiteCredito: c.es_permite_credito === 1 });
    setModal(true);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Clientes</h1>
          <p className="text-sm text-gray-500">{clientes.data?.meta.total ?? 0} clientes</p>
        </div>
        <div className="flex gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Buscar…"
              className="rounded-lg border border-gray-300 py-2 pl-9 pr-3 text-sm dark:border-gray-600 dark:bg-gray-800" />
          </div>
          <button onClick={abrirNuevo} className="flex items-center gap-2 rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-600">
            <Plus className="h-4 w-4" /> Nuevo
          </button>
        </div>
      </div>

      <Card padding={false}>
        {clientes.isLoading ? <Cargando /> : (clientes.data?.datos ?? []).length === 0 ? (
          <EmptyState titulo="Sin clientes" icono={<Users className="h-12 w-12" />} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs uppercase text-gray-500 dark:bg-gray-700/50">
                <tr>
                  <th className="p-3 text-left">Documento</th><th className="p-3 text-left">Nombre</th>
                  <th className="p-3 text-left">Teléfono</th><th className="p-3 text-right">Cupo</th>
                  <th className="p-3 text-right">Saldo (deuda)</th><th className="p-3 text-center">Crédito</th><th className="p-3"></th>
                </tr>
              </thead>
              <tbody>
                {clientes.data!.datos.map((c) => (
                  <tr key={c.id} className="border-t border-gray-100 dark:border-gray-700">
                    <td className="p-3 font-mono text-xs text-gray-500">{c.documento ?? '—'}</td>
                    <td className="p-3 font-medium">{c.nombre}</td>
                    <td className="p-3 text-gray-500">{c.telefono ?? '—'}</td>
                    <td className="p-3 text-right tabular-nums">{formatearUSD(c.cupo_credito)}</td>
                    <td className="p-3 text-right tabular-nums font-medium text-red-600">{Number(c.saldo_actual) > 0 ? formatearUSD(c.saldo_actual) : '—'}</td>
                    <td className="p-3 text-center">{c.es_permite_credito === 1 ? <Badge color="verde">Sí</Badge> : <Badge color="gris">No</Badge>}</td>
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
          </div>
        )}
      </Card>

      <Modal abierto={modal} onCerrar={() => setModal(false)} titulo={editando ? 'Editar cliente' : 'Nuevo cliente'}
        pie={
          <div className="flex justify-end gap-2">
            <button onClick={() => setModal(false)} className="rounded-lg border border-gray-300 px-4 py-2 text-sm dark:border-gray-600">Cancelar</button>
            <button onClick={() => guardar.mutate(form)} disabled={!form.nombre || guardar.isPending}
              className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-600 disabled:opacity-50">Guardar</button>
          </div>
        }>
        <div className="grid grid-cols-2 gap-3">
          <Campo label="Nombre *" className="col-span-2"><input value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} className={INP} /></Campo>
          <Campo label="Documento (cédula/RIF)"><input value={form.documento} onChange={(e) => setForm({ ...form, documento: e.target.value })} className={INP} /></Campo>
          <Campo label="Teléfono"><input value={form.telefono} onChange={(e) => setForm({ ...form, telefono: e.target.value })} className={INP} /></Campo>
          <Campo label="Correo" className="col-span-2"><input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className={INP} /></Campo>
          <Campo label="Cupo de crédito (USD)"><input type="number" value={form.cupoCredito} onChange={(e) => setForm({ ...form, cupoCredito: e.target.value })} className={INP} /></Campo>
          <Campo label="Días de plazo"><input type="number" value={form.diasPlazo} onChange={(e) => setForm({ ...form, diasPlazo: Number(e.target.value) })} className={INP} /></Campo>
          <label className="col-span-2 flex items-center gap-2 text-sm">
            <input type="checkbox" checked={form.esPermiteCredito} onChange={(e) => setForm({ ...form, esPermiteCredito: e.target.checked })} />
            Permitir ventas a crédito
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
