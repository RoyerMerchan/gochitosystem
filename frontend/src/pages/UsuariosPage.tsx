/** Usuarios: crear cajeros, editar, activar/desactivar y restablecer contraseña. */
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { UserCog, Plus, Pencil, KeyRound } from 'lucide-react';
import { obtener, crear, reemplazar } from '@/lib/axios';
import { ErrorApi } from '@/lib/errores';
import { Card, Cargando, Badge, EmptyState } from '@/components/ui/Feedback';
import { Modal } from '@/components/ui/Modal';
import { toast } from '@/store/toastStore';
import { formatearRelativo } from '@/lib/formato';

interface Usuario {
  id: number; usuario: string; email: string | null; nombre_completo: string;
  rol_id: number; rol_nombre: string; esta_activo: number; ultimo_acceso_en: string | null;
}
interface Rol { id: number; nombre: string; }

export default function UsuariosPage() {
  const qc = useQueryClient();
  const [modal, setModal] = useState(false);
  const [editando, setEditando] = useState<Usuario | null>(null);
  const [form, setForm] = useState({ usuario: '', nombreCompleto: '', email: '', password: '', rolId: 1 });
  const [resetear, setResetear] = useState<Usuario | null>(null);
  const [nuevaClave, setNuevaClave] = useState('');

  const usuarios = useQuery({ queryKey: ['usuarios'], queryFn: () => obtener<Usuario[]>('/usuarios') });
  const roles = useQuery({ queryKey: ['roles'], queryFn: () => obtener<Rol[]>('/roles') });

  const guardar = useMutation({
    mutationFn: () => editando
      ? reemplazar(`/usuarios/${editando.id}`, { nombreCompleto: form.nombreCompleto, email: form.email, rolId: form.rolId })
      : crear('/usuarios', { usuario: form.usuario, nombreCompleto: form.nombreCompleto, email: form.email, password: form.password, rolId: form.rolId }),
    onSuccess: () => { toast.exito(editando ? 'Usuario actualizado' : 'Usuario creado'); qc.invalidateQueries({ queryKey: ['usuarios'] }); setModal(false); },
    onError: (e) => toast.error(e instanceof ErrorApi ? e.message : 'No se pudo guardar'),
  });

  const cambiarClave = useMutation({
    mutationFn: () => crear(`/usuarios/${resetear!.id}/password`, { password: nuevaClave }),
    onSuccess: () => { toast.exito('Contraseña restablecida'); setResetear(null); setNuevaClave(''); },
    onError: (e) => toast.error(e instanceof ErrorApi ? e.message : 'No se pudo restablecer'),
  });

  const abrirNuevo = () => { setEditando(null); setForm({ usuario: '', nombreCompleto: '', email: '', password: '', rolId: roles.data?.[0]?.id ?? 1 }); setModal(true); };
  const abrirEditar = (u: Usuario) => { setEditando(u); setForm({ usuario: u.usuario, nombreCompleto: u.nombre_completo, email: u.email ?? '', password: '', rolId: u.rol_id }); setModal(true); };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-bold">Usuarios</h1><p className="text-sm text-gray-500">Cada venta queda asociada al usuario que la registra</p></div>
        <button onClick={abrirNuevo} className="flex items-center gap-2 rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-600"><Plus className="h-4 w-4" /> Nuevo usuario</button>
      </div>

      <Card padding={false}>
        {usuarios.isLoading ? <Cargando /> : (usuarios.data ?? []).length === 0 ? (
          <EmptyState titulo="Sin usuarios" icono={<UserCog className="h-12 w-12" />} />
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs uppercase text-gray-500 dark:bg-gray-700/50"><tr>
              <th className="p-3 text-left">Usuario</th><th className="p-3 text-left">Nombre</th><th className="p-3 text-left">Rol</th>
              <th className="p-3 text-left">Último acceso</th><th className="p-3"></th></tr></thead>
            <tbody>
              {usuarios.data!.map((u) => (
                <tr key={u.id} className="border-t border-gray-100 dark:border-gray-700">
                  <td className="p-3 font-mono text-xs">{u.usuario}</td>
                  <td className="p-3 font-medium">{u.nombre_completo}</td>
                  <td className="p-3"><Badge color="azul">{u.rol_nombre}</Badge></td>
                  <td className="p-3 text-gray-500">{u.ultimo_acceso_en ? formatearRelativo(u.ultimo_acceso_en) : 'nunca'}</td>
                  <td className="p-3">
                    <div className="flex justify-end gap-1">
                      <button onClick={() => abrirEditar(u)} className="text-gray-400 hover:text-amber-600" title="Editar"><Pencil className="h-4 w-4" /></button>
                      <button onClick={() => { setResetear(u); setNuevaClave(''); }} className="text-gray-400 hover:text-blue-600" title="Restablecer contraseña"><KeyRound className="h-4 w-4" /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      {/* Crear / editar */}
      <Modal abierto={modal} onCerrar={() => setModal(false)} titulo={editando ? 'Editar usuario' : 'Nuevo usuario'}
        pie={<div className="flex justify-end gap-2"><button onClick={() => setModal(false)} className="rounded-lg border border-gray-300 px-4 py-2 text-sm dark:border-gray-600">Cancelar</button>
          <button onClick={() => guardar.mutate()} disabled={!form.nombreCompleto || (!editando && (!form.usuario || form.password.length < 8)) || guardar.isPending} className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-600 disabled:opacity-50">Guardar</button></div>}>
        <div className="space-y-3">
          {!editando && (
            <div><label className="mb-1 block text-xs font-medium text-gray-500">Nombre de usuario *</label>
              <input value={form.usuario} onChange={(e) => setForm({ ...form, usuario: e.target.value })} className={INP} placeholder="ej: maria" /></div>
          )}
          <div><label className="mb-1 block text-xs font-medium text-gray-500">Nombre completo *</label>
            <input value={form.nombreCompleto} onChange={(e) => setForm({ ...form, nombreCompleto: e.target.value })} className={INP} /></div>
          <div><label className="mb-1 block text-xs font-medium text-gray-500">Correo</label>
            <input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className={INP} /></div>
          <div><label className="mb-1 block text-xs font-medium text-gray-500">Rol</label>
            <select value={form.rolId} onChange={(e) => setForm({ ...form, rolId: Number(e.target.value) })} className={INP}>
              {(roles.data ?? []).map((r) => <option key={r.id} value={r.id}>{r.nombre}</option>)}
            </select></div>
          {!editando && (
            <div><label className="mb-1 block text-xs font-medium text-gray-500">Contraseña * (mín. 8 caracteres)</label>
              <input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} className={INP} /></div>
          )}
        </div>
      </Modal>

      {/* Restablecer contraseña */}
      <Modal abierto={Boolean(resetear)} onCerrar={() => setResetear(null)} titulo={`Restablecer contraseña de ${resetear?.nombre_completo ?? ''}`}
        pie={<div className="flex justify-end gap-2"><button onClick={() => setResetear(null)} className="rounded-lg border border-gray-300 px-4 py-2 text-sm dark:border-gray-600">Cancelar</button>
          <button onClick={() => cambiarClave.mutate()} disabled={nuevaClave.length < 8 || cambiarClave.isPending} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50">Restablecer</button></div>}>
        <p className="mb-3 text-sm text-gray-500">Se le pondrá una contraseña nueva y se cerrará su sesión actual.</p>
        <label className="mb-1 block text-xs font-medium text-gray-500">Nueva contraseña (mín. 8 caracteres)</label>
        <input type="password" value={nuevaClave} onChange={(e) => setNuevaClave(e.target.value)} autoFocus className={INP} />
      </Modal>
    </div>
  );
}
const INP = 'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-amber-500 focus:outline-none dark:border-gray-600 dark:bg-gray-700';
