/**
 * Modal de cobro bimonetario. El cajero agrega lineas de pago (cada metodo tiene
 * su moneda); se calcula en vivo lo pagado en USD, el faltante y las vueltas.
 */
import { useMemo, useState } from 'react';
import { Plus, Trash2, Banknote } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { formatearUSD, formatearBs, aNumero } from '@/lib/formato';
import { METODOS_PAGO, type MetodoPago } from './metodosPago';

export interface LineaPagoEnvio {
  metodoPagoId: number;
  montoMoneda: string;
  referencia?: string;
}

interface LineaPago {
  metodo: MetodoPago;
  monto: string;
  referencia: string;
}

interface Props {
  abierto: boolean;
  totalUsd: number;
  tasa: number;
  onCerrar: () => void;
  onConfirmar: (pagos: LineaPagoEnvio[], monedaVuelto: 'USD' | 'VES') => void;
  procesando: boolean;
}

/** Convierte una linea a su equivalente en USD. */
function lineaEnUsd(l: LineaPago, tasa: number): number {
  const monto = aNumero(l.monto);
  if (l.metodo.moneda === 'USD') return monto;
  return tasa > 0 ? monto / tasa : 0;
}

export function ModalCobro({ abierto, totalUsd, tasa, onCerrar, onConfirmar, procesando }: Props) {
  const [lineas, setLineas] = useState<LineaPago[]>([]);
  const [monedaVuelto, setMonedaVuelto] = useState<'USD' | 'VES'>('VES');

  const pagadoUsd = useMemo(
    () => lineas.filter((l) => !l.metodo.esCredito).reduce((a, l) => a + lineaEnUsd(l, tasa), 0),
    [lineas, tasa],
  );
  const creditoUsd = useMemo(
    () => lineas.filter((l) => l.metodo.esCredito).reduce((a, l) => a + lineaEnUsd(l, tasa), 0),
    [lineas, tasa],
  );
  const cubierto = pagadoUsd + creditoUsd;
  const faltante = Math.max(0, totalUsd - cubierto);
  const vuelto = Math.max(0, pagadoUsd - (totalUsd - creditoUsd));

  const agregarLinea = (metodo: MetodoPago) => {
    // Por defecto, el monto sugerido cubre el faltante en la moneda del metodo.
    const faltanteMoneda = metodo.moneda === 'USD' ? faltante : faltante * tasa;
    setLineas((ls) => [
      ...ls,
      { metodo, monto: faltanteMoneda > 0 ? faltanteMoneda.toFixed(2) : '', referencia: '' },
    ]);
  };

  const actualizar = (idx: number, campo: 'monto' | 'referencia', valor: string) =>
    setLineas((ls) => ls.map((l, i) => (i === idx ? { ...l, [campo]: valor } : l)));

  const quitar = (idx: number) => setLineas((ls) => ls.filter((_, i) => i !== idx));

  const puedeConfirmar =
    lineas.length > 0 &&
    faltante < 0.005 &&
    lineas.every((l) => aNumero(l.monto) > 0 && (!l.metodo.requiereReferencia || l.referencia.trim()));

  const confirmar = () => {
    if (!puedeConfirmar || procesando) return;
    onConfirmar(
      lineas.map((l) => ({
        metodoPagoId: l.metodo.id,
        montoMoneda: aNumero(l.monto).toFixed(4),
        referencia: l.referencia.trim() || undefined,
      })),
      monedaVuelto,
    );
  };

  const reiniciar = () => {
    setLineas([]);
    onCerrar();
  };

  return (
    <Modal
      abierto={abierto}
      onCerrar={reiniciar}
      titulo="Cobrar"
      ancho="lg"
      pie={
        <div className="flex items-center justify-between gap-3">
          <div className="text-sm">
            {faltante > 0.005 ? (
              <span className="font-medium text-amber-600">Faltan {formatearUSD(faltante)}</span>
            ) : vuelto > 0.005 ? (
              <span className="font-medium text-blue-600">
                Vuelto {formatearUSD(vuelto)} / {formatearBs(vuelto * tasa)}
              </span>
            ) : (
              <span className="font-medium text-green-600">Pago completo</span>
            )}
          </div>
          <button
            onClick={confirmar}
            disabled={!puedeConfirmar || procesando}
            className="rounded-lg bg-green-600 px-6 py-2.5 font-semibold text-white hover:bg-green-700 disabled:opacity-40"
          >
            {procesando ? 'Procesando…' : 'Confirmar venta (F9)'}
          </button>
        </div>
      }
    >
      {/* Total a cobrar */}
      <div className="mb-4 rounded-lg bg-gray-50 p-4 text-center dark:bg-gray-700/50">
        <p className="text-xs uppercase tracking-wide text-gray-500">Total a cobrar</p>
        <p className="text-3xl font-bold tabular-nums">{formatearUSD(totalUsd)}</p>
        <p className="text-sm text-gray-500">{formatearBs(totalUsd * tasa)} · tasa {tasa.toFixed(2)}</p>
      </div>

      {/* Botones de metodo */}
      <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {METODOS_PAGO.map((m) => (
          <button
            key={m.id}
            onClick={() => agregarLinea(m)}
            className="flex items-center justify-center gap-1 rounded-lg border border-gray-200 px-2 py-2 text-xs font-medium hover:border-amber-400 hover:bg-amber-50 dark:border-gray-600 dark:hover:bg-amber-900/20"
          >
            <Plus className="h-3 w-3" />
            {m.nombre}
          </button>
        ))}
      </div>

      {/* Lineas de pago */}
      <div className="space-y-2">
        {lineas.length === 0 && (
          <p className="py-6 text-center text-sm text-gray-400">
            <Banknote className="mx-auto mb-2 h-8 w-8" />
            Agregue un método de pago
          </p>
        )}
        {lineas.map((l, idx) => (
          <div key={idx} className="flex flex-wrap items-center gap-2 rounded-lg border border-gray-200 p-2 dark:border-gray-600">
            <span className="w-28 shrink-0 text-sm font-medium">{l.metodo.nombre}</span>
            <div className="flex items-center gap-1">
              <span className="text-xs text-gray-400">{l.metodo.moneda === 'USD' ? '$' : 'Bs'}</span>
              <input
                type="number"
                step="0.01"
                value={l.monto}
                onChange={(e) => actualizar(idx, 'monto', e.target.value)}
                className="w-28 rounded border border-gray-300 px-2 py-1 text-right text-sm dark:border-gray-600 dark:bg-gray-700"
                placeholder="0.00"
              />
            </div>
            {l.metodo.requiereReferencia && (
              <input
                type="text"
                value={l.referencia}
                onChange={(e) => actualizar(idx, 'referencia', e.target.value)}
                className="flex-1 rounded border border-gray-300 px-2 py-1 text-sm dark:border-gray-600 dark:bg-gray-700"
                placeholder="Referencia"
              />
            )}
            <span className="ml-auto text-xs text-gray-400">≈ {formatearUSD(lineaEnUsd(l, tasa))}</span>
            <button onClick={() => quitar(idx)} className="text-gray-400 hover:text-red-500">
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>

      {vuelto > 0.005 && (
        <div className="mt-3 flex items-center gap-2 text-sm">
          <span className="text-gray-500">Dar vuelto en:</span>
          <button
            onClick={() => setMonedaVuelto('VES')}
            className={`rounded px-3 py-1 ${monedaVuelto === 'VES' ? 'bg-amber-500 text-white' : 'bg-gray-100 dark:bg-gray-700'}`}
          >
            Bs
          </button>
          <button
            onClick={() => setMonedaVuelto('USD')}
            className={`rounded px-3 py-1 ${monedaVuelto === 'USD' ? 'bg-amber-500 text-white' : 'bg-gray-100 dark:bg-gray-700'}`}
          >
            USD
          </button>
        </div>
      )}
    </Modal>
  );
}
