/**
 * Ventas en espera: la gaveta de carritos aparcados del POS.
 *
 * El cliente arma su compra, se queda pensando y detrás hay cola. Aquí el cajero
 * guarda ese carrito con un nombre, atiende al siguiente y lo retoma después.
 *
 * Viven en el servidor, no en el navegador: sobreviven a un refresco y se pueden
 * retomar desde otra caja de la misma sucursal.
 */
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { PauseCircle, Play, Trash2, Clock } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { obtener, crear, eliminar } from '@/lib/axios';
import { ErrorApi } from '@/lib/errores';
import { toast } from '@/store/toastStore';
import { useCarrito, type ItemCarrito } from '@/features/pos/carritoStore';
import { formatearUSD, formatearFechaHora } from '@/lib/formato';

interface EsperaFila {
  id: number;
  nombre: string;
  nota: string | null;
  cliente_id: number | null;
  cliente_nombre: string | null;
  total_usd: string;
  renglones: number;
  creado_en: string;
  cajero: string;
}

interface EsperaRetomada {
  id: number;
  nombre: string;
  clienteId: number | null;
  clienteNombre: string | null;
  items: ItemCarrito[];
  descartados: Array<{ nombre: string; motivo: string }>;
  avisos: string[];
}

interface Props {
  abierto: boolean;
  onCerrar: () => void;
}

export function ModalEspera({ abierto, onCerrar }: Props) {
  const qc = useQueryClient();
  const carrito = useCarrito();
  const [nombre, setNombre] = useState('');
  const [nota, setNota] = useState('');

  const hayCarrito = carrito.items.length > 0;

  const lista = useQuery({
    queryKey: ['ventas-espera'],
    queryFn: () => obtener<EsperaFila[]>('/pos/espera'),
    enabled: abierto,
  });

  const refrescar = () => qc.invalidateQueries({ queryKey: ['ventas-espera'] });

  const guardar = useMutation({
    mutationFn: () => crear<{ id: number }>('/pos/espera', {
      // Sin nombre escrito se usa el del cliente: en la mayoría de los casos es el
      // dato que el cajero ya seleccionó y no tiene por qué teclearlo dos veces.
      nombre: nombre.trim() || carrito.clienteNombre,
      clienteId: carrito.clienteId,
      nota: nota.trim() || undefined,
      totalUsd: carrito.totalUsd().toFixed(2),
      items: carrito.items,
    }),
    onSuccess: () => {
      toast.exito('Venta guardada en espera');
      carrito.limpiar();
      setNombre(''); setNota('');
      refrescar();
      onCerrar();
    },
    onError: (e) => toast.error(e instanceof ErrorApi ? e.message : 'No se pudo guardar la venta'),
  });

  const retomar = useMutation({
    mutationFn: (id: number) => crear<EsperaRetomada>(`/pos/espera/${id}/retomar`, {}),
    onSuccess: (v) => {
      carrito.cargar(v.items, v.clienteId, v.clienteNombre ?? 'CONSUMIDOR FINAL');
      toast.exito(`Venta de ${v.nombre} retomada`);
      // Precio que subió o existencia que ya no alcanza: el cajero tiene que verlo
      // ANTES de cobrar, no descubrirlo en el cierre.
      v.descartados.forEach((d) => toast.error(`${d.nombre}: ${d.motivo}, se quitó del carrito`));
      v.avisos.forEach((a) => toast.info(a));
      refrescar();
      onCerrar();
    },
    onError: (e) => { refrescar(); toast.error(e instanceof ErrorApi ? e.message : 'No se pudo retomar la venta'); },
  });

  const descartar = useMutation({
    mutationFn: (id: number) => eliminar(`/pos/espera/${id}`),
    onSuccess: () => { toast.info('Venta en espera descartada'); refrescar(); },
    onError: (e) => { refrescar(); toast.error(e instanceof ErrorApi ? e.message : 'No se pudo descartar'); },
  });

  const ocupado = guardar.isPending || retomar.isPending || descartar.isPending;
  const filas = lista.data ?? [];

  return (
    <Modal abierto={abierto} onCerrar={onCerrar} titulo="Ventas en espera" ancho="lg">
      <div className="space-y-4">
        {/* Guardar la venta que está en pantalla */}
        {hayCarrito ? (
          <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 dark:border-amber-700 dark:bg-amber-900/20">
            <p className="mb-2 text-sm font-semibold">
              Guardar la venta actual · {carrito.items.length} renglón(es) ·{' '}
              {formatearUSD(carrito.totalUsd())}
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
              <input
                autoFocus
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !ocupado) guardar.mutate(); }}
                maxLength={80}
                placeholder={`Nombre (por defecto: ${carrito.clienteNombre})`}
                className={INP}
              />
              <input
                value={nota}
                onChange={(e) => setNota(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !ocupado) guardar.mutate(); }}
                maxLength={200}
                placeholder="Nota (opcional): el de la camisa azul…"
                className={INP}
              />
            </div>
            <button
              onClick={() => guardar.mutate()}
              disabled={ocupado}
              className="mt-2 flex w-full items-center justify-center gap-2 rounded-lg bg-amber-500 py-2 text-sm font-semibold text-white hover:bg-amber-600 disabled:opacity-50"
            >
              <PauseCircle className="h-4 w-4" />
              {guardar.isPending ? 'Guardando…' : 'Dejar en espera y vaciar el carrito'}
            </button>
          </div>
        ) : (
          <p className="rounded-lg bg-gray-50 p-3 text-sm text-gray-500 dark:bg-gray-700/40">
            El carrito está vacío. Aquí abajo puedes retomar una venta guardada.
          </p>
        )}

        {/* Gaveta */}
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
            Guardadas ({filas.length})
          </p>
          {lista.isLoading ? (
            <p className="py-6 text-center text-sm text-gray-400">Cargando…</p>
          ) : filas.length === 0 ? (
            <p className="py-6 text-center text-sm text-gray-400">No hay ventas en espera.</p>
          ) : (
            <div className="max-h-72 space-y-1 overflow-y-auto">
              {filas.map((f) => (
                <div
                  key={f.id}
                  className="flex items-center gap-3 rounded-lg border border-gray-100 p-3 dark:border-gray-700"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{f.nombre}</p>
                    <p className="truncate text-xs text-gray-400">
                      {f.renglones} renglón(es) · {f.cajero}
                      {f.nota && <> · {f.nota}</>}
                    </p>
                    <p className="flex items-center gap-1 text-xs text-gray-400">
                      <Clock className="h-3 w-3" /> {formatearFechaHora(f.creado_en)}
                    </p>
                  </div>
                  <span className="whitespace-nowrap font-semibold tabular-nums">
                    {formatearUSD(f.total_usd)}
                  </span>
                  <button
                    onClick={() => {
                      // Retomar PISA el carrito actual: mezclarlo le cobraría a esta
                      // persona lo que llevaba la otra.
                      if (hayCarrito && !window.confirm(
                        'El carrito actual se reemplazará por esta venta. ¿Continuar?',
                      )) return;
                      retomar.mutate(f.id);
                    }}
                    disabled={ocupado}
                    title="Retomar esta venta"
                    className="rounded-lg bg-green-600 px-3 py-2 text-white hover:bg-green-700 disabled:opacity-50"
                  >
                    <Play className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => {
                      if (window.confirm(`¿Descartar la venta de ${f.nombre}?`)) descartar.mutate(f.id);
                    }}
                    disabled={ocupado}
                    title="Descartar"
                    className="rounded-lg border border-gray-300 px-3 py-2 text-gray-400 hover:border-red-400 hover:text-red-500 disabled:opacity-50 dark:border-gray-600"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}

const INP = 'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-amber-500 focus:outline-none dark:border-gray-600 dark:bg-gray-700';
