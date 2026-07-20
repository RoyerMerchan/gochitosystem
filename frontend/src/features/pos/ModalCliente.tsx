/**
 * Selector de cliente para el POS: busca por cédula/RIF o nombre y muestra la lista.
 * También permite crear un cliente nuevo al vuelo (útil cuando llega alguien a fiar).
 */
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Search, User, UserCheck, UserPlus, ArrowLeft } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { obtenerPaginado, crear } from '@/lib/axios';
import { ErrorApi } from '@/lib/errores';
import { useDebounce } from '@/hooks/useDebounce';
import { toast } from '@/store/toastStore';
import { formatearUSD } from '@/lib/formato';

interface ClienteFila {
  id: number; nombre: string; documento: string | null; saldo_actual: string; es_permite_credito: number;
}

interface Props {
  abierto: boolean;
  onCerrar: () => void;
  onSeleccionar: (id: number | null, nombre: string) => void;
}

const NUEVO_VACIO = { nombre: '', documento: '', telefono: '', cupoCredito: '0', esPermiteCredito: false };

export function ModalCliente({ abierto, onCerrar, onSeleccionar }: Props) {
  const qc = useQueryClient();
  const [busqueda, setBusqueda] = useState('');
  const [creando, setCreando] = useState(false);
  const [nuevo, setNuevo] = useState(NUEVO_VACIO);
  const q = useDebounce(busqueda, 250);

  const clientes = useQuery({
    queryKey: ['clientes-pos', q],
    queryFn: () => obtenerPaginado<ClienteFila>(`/clientes?limite=30${q ? `&busqueda=${encodeURIComponent(q)}` : ''}`),
    enabled: abierto && !creando,
  });

  const crearCliente = useMutation({
    mutationFn: () => crear<ClienteFila>('/clientes', {
      nombre: nuevo.nombre, documento: nuevo.documento || null, telefono: nuevo.telefono || null,
      cupoCredito: nuevo.cupoCredito, esPermiteCredito: nuevo.esPermiteCredito,
    }),
    onSuccess: (c) => {
      toast.exito('Cliente creado');
      qc.invalidateQueries({ queryKey: ['clientes'] });
      elegir(c.id, c.nombre);
      setCreando(false); setNuevo(NUEVO_VACIO);
    },
    onError: (e) => toast.error(e instanceof ErrorApi ? e.message : 'No se pudo crear el cliente'),
  });

  const elegir = (id: number | null, nombre: string) => {
    onSeleccionar(id, nombre);
    setBusqueda('');
    onCerrar();
  };

  const cerrar = () => { setCreando(false); setNuevo(NUEVO_VACIO); onCerrar(); };

  // --- Modo crear cliente ---
  if (creando) {
    return (
      <Modal abierto={abierto} onCerrar={cerrar} titulo="Nuevo cliente" ancho="md"
        pie={
          <div className="flex justify-between">
            <button onClick={() => setCreando(false)} className="flex items-center gap-1 rounded-lg border border-gray-300 px-4 py-2 text-sm dark:border-gray-600">
              <ArrowLeft className="h-4 w-4" /> Volver
            </button>
            <button onClick={() => crearCliente.mutate()} disabled={!nuevo.nombre || crearCliente.isPending}
              className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-600 disabled:opacity-50">
              Crear y seleccionar
            </button>
          </div>
        }>
        <div className="space-y-3">
          <div><label className="mb-1 block text-xs font-medium text-gray-500">Nombre *</label>
            <input value={nuevo.nombre} onChange={(e) => setNuevo({ ...nuevo, nombre: e.target.value })} autoFocus className={INP} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="mb-1 block text-xs font-medium text-gray-500">Cédula / RIF</label>
              <input value={nuevo.documento} onChange={(e) => setNuevo({ ...nuevo, documento: e.target.value })} className={INP} placeholder="V-12345678" /></div>
            <div><label className="mb-1 block text-xs font-medium text-gray-500">Teléfono</label>
              <input value={nuevo.telefono} onChange={(e) => setNuevo({ ...nuevo, telefono: e.target.value })} className={INP} /></div>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={nuevo.esPermiteCredito} onChange={(e) => setNuevo({ ...nuevo, esPermiteCredito: e.target.checked })} />
            Permitir ventas a crédito (fiado)
          </label>
          {nuevo.esPermiteCredito && (
            <div><label className="mb-1 block text-xs font-medium text-gray-500">Cupo de crédito (USD)</label>
              <input type="number" step="0.01" value={nuevo.cupoCredito} onChange={(e) => setNuevo({ ...nuevo, cupoCredito: e.target.value })} className={INP} /></div>
          )}
        </div>
      </Modal>
    );
  }

  // --- Modo seleccionar ---
  return (
    <Modal abierto={abierto} onCerrar={cerrar} titulo="Seleccionar cliente" ancho="md">
      <div className="space-y-3">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input autoFocus value={busqueda} onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar por cédula/RIF o nombre…"
              className="w-full rounded-lg border border-gray-300 py-2 pl-9 pr-3 text-sm focus:border-amber-500 focus:outline-none dark:border-gray-600 dark:bg-gray-700" />
          </div>
          <button onClick={() => { setNuevo({ ...NUEVO_VACIO, nombre: busqueda }); setCreando(true); }}
            className="flex items-center gap-1 rounded-lg bg-amber-500 px-3 py-2 text-sm font-semibold text-white hover:bg-amber-600 whitespace-nowrap">
            <UserPlus className="h-4 w-4" /> Nuevo
          </button>
        </div>

        <button onClick={() => elegir(null, 'CONSUMIDOR FINAL')}
          className="flex w-full items-center gap-3 rounded-lg border border-gray-200 p-3 text-left hover:border-amber-400 hover:bg-amber-50 dark:border-gray-600 dark:hover:bg-amber-900/20">
          <User className="h-5 w-5 text-gray-400" />
          <span className="font-medium">Consumidor final</span>
          <span className="ml-auto text-xs text-gray-400">venta rápida sin cliente</span>
        </button>

        <div className="max-h-72 space-y-1 overflow-y-auto">
          {clientes.isLoading ? (
            <p className="py-4 text-center text-sm text-gray-400">Buscando…</p>
          ) : (clientes.data?.datos ?? []).filter((c) => c.id !== 1).length === 0 ? (
            <p className="py-4 text-center text-sm text-gray-400">Sin resultados. Usa "Nuevo" para crear un cliente.</p>
          ) : (
            clientes.data!.datos.filter((c) => c.id !== 1).map((c) => (
              <button key={c.id} onClick={() => elegir(c.id, c.nombre)}
                className="flex w-full items-center gap-3 rounded-lg border border-gray-100 p-3 text-left hover:border-amber-400 hover:bg-amber-50 dark:border-gray-700 dark:hover:bg-amber-900/20">
                <UserCheck className="h-5 w-5 text-amber-500" />
                <div>
                  <p className="font-medium">{c.nombre}</p>
                  <p className="text-xs text-gray-400">{c.documento ?? 'sin documento'}</p>
                </div>
                {Number(c.saldo_actual) > 0 && (
                  <span className="ml-auto text-xs font-medium text-red-500">debe {formatearUSD(c.saldo_actual)}</span>
                )}
              </button>
            ))
          )}
        </div>
      </div>
    </Modal>
  );
}
const INP = 'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-amber-500 focus:outline-none dark:border-gray-600 dark:bg-gray-700';
