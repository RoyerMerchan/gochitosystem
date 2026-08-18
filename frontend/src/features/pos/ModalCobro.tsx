/**
 * Modal de cobro bimonetario. El cajero agrega lineas de pago (cada metodo tiene
 * su moneda); se calcula en vivo lo pagado en USD, el faltante y las vueltas.
 */
import { useEffect, useMemo, useState } from 'react';
import { Plus, Trash2, Banknote } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { formatearUSD, formatearBs, aNumero, usdABs, redondearCentavos } from '@/lib/formato';
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

  /**
   * Cada apertura arranca en cero.
   *
   * El componente nunca se desmonta (el padre solo cambia `abierto`), y tras una
   * venta exitosa el POS cierra el modal sin pasar por `reiniciar()`. Sin esto,
   * las lineas de pago de la venta anterior reaparecen en la venta siguiente y el
   * cajero cobra el monto viejo.
   */
  useEffect(() => {
    if (abierto) {
      setLineas([]);
      setMonedaVuelto('VES');
    }
  }, [abierto]);

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
  /** El mismo vuelto en bolívares: el cajero paga con lo que tenga en la gaveta. */
  const vueltoBs = usdABs(vuelto, tasa);
  const hayVuelto = vuelto > 0.005;
  /**
   * El fiado se guarda en dolares (la deuda no se devalua), pero el cliente
   * pregunta "cuanto quedo debiendo" en bolivares: se muestran los dos, a la
   * tasa del ticket, para no tener que sacar la calculadora.
   */
  const creditoBs = usdABs(creditoUsd, tasa);
  const hayCredito = creditoUsd > 0.005;
  const faltanteBs = usdABs(faltante, tasa);

  const agregarLinea = (metodo: MetodoPago) => {
    // Por defecto, el monto sugerido cubre el faltante en la moneda del metodo.
    // Los Bs salen del faltante ya redondeado a centavos: es la plata que el
    // cajero va a cobrar de verdad y tiene que coincidir con el ticket.
    const faltanteMoneda = metodo.moneda === 'USD' ? redondearCentavos(faltante) : usdABs(faltante, tasa);
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
              <span className="font-medium text-amber-600">
                Faltan {formatearUSD(faltante)} · {formatearBs(faltanteBs)}
              </span>
            ) : hayVuelto ? (
              // Los dos montos, y en negrita el que se va a entregar de verdad.
              <span className="text-blue-600">
                Vuelto{' '}
                <span className={monedaVuelto === 'USD' ? 'font-bold' : ''}>{formatearUSD(vuelto)}</span>
                {' / '}
                <span className={monedaVuelto === 'VES' ? 'font-bold' : ''}>{formatearBs(vueltoBs)}</span>
              </span>
            ) : hayCredito ? (
              <span className="font-medium text-green-600">
                Pago completo · queda debiendo{' '}
                <span className="text-amber-600">
                  {formatearUSD(creditoUsd)} · {formatearBs(creditoBs)}
                </span>
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
        <p className="text-sm text-gray-500">{formatearBs(usdABs(totalUsd, tasa))} · tasa {tasa.toFixed(2)}</p>
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
            {/* El equivalente en la otra moneda: lo que se tecleo ya esta a la vista. */}
            <span className="ml-auto text-xs text-gray-400">
              ≈{' '}
              {l.metodo.moneda === 'USD'
                ? formatearBs(usdABs(aNumero(l.monto), tasa))
                : formatearUSD(lineaEnUsd(l, tasa))}
            </span>
            <button onClick={() => quitar(idx)} className="text-gray-400 hover:text-red-500">
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>

      {/*
        Vuelto: el mismo monto en las dos monedas, siempre a la vista. Son $ 0,83 o
        Bs 152,40 y el cajero elige con qué se lo devuelve; lo que toque es lo que
        sale de la gaveta y lo que descuenta el arqueo.
      */}
      {hayVuelto && (
        <div className="mt-3 rounded-lg border border-blue-300 bg-blue-50 p-3 dark:border-blue-800 dark:bg-blue-900/20">
          <div className="flex flex-wrap items-baseline justify-between gap-x-4">
            <span className="text-xs font-medium uppercase tracking-wide text-blue-700 dark:text-blue-300">
              Vuelto a entregar
            </span>
            <span className="text-xl font-bold tabular-nums text-blue-700 dark:text-blue-300">
              {monedaVuelto === 'USD' ? formatearUSD(vuelto) : formatearBs(vueltoBs)}
            </span>
          </div>
          <div className="mt-2 grid grid-cols-2 gap-2">
            {([
              ['USD', 'En dólares', formatearUSD(vuelto)],
              ['VES', 'En bolívares', formatearBs(vueltoBs)],
            ] as const).map(([m, etiqueta, monto]) => (
              <button key={m} onClick={() => setMonedaVuelto(m)}
                className={`rounded-lg border px-3 py-2 text-left ${monedaVuelto === m
                  ? 'border-blue-500 bg-white shadow-sm dark:bg-gray-800'
                  : 'border-gray-200 bg-white/50 opacity-70 hover:opacity-100 dark:border-gray-700 dark:bg-gray-800/40'}`}>
                <span className="block text-[11px] uppercase tracking-wide text-gray-500">
                  {etiqueta}{monedaVuelto === m && ' · se entrega'}
                </span>
                <span className="block text-base font-bold tabular-nums">{monto}</span>
              </button>
            ))}
          </div>
        </div>
      )}
      {/*
        Fiado: la deuda se registra en dolares, pero aqui se ve tambien en
        bolivares a la tasa del ticket. Es la respuesta al "y cuanto quedo
        debiendo?" en el mostrador, sin ir a la calculadora.
      */}
      {hayCredito && (
        <div className="mt-3 rounded-lg border border-amber-300 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-900/20">
          <div className="flex flex-wrap items-baseline justify-between gap-x-4">
            <span className="text-xs font-medium uppercase tracking-wide text-amber-700 dark:text-amber-300">
              Queda debiendo
            </span>
            <span className="text-xl font-bold tabular-nums text-amber-700 dark:text-amber-300">
              {formatearUSD(creditoUsd)}
            </span>
          </div>
          <div className="mt-1 flex flex-wrap items-baseline justify-between gap-x-4">
            <span className="text-[11px] text-amber-700/70 dark:text-amber-300/70">
              a tasa {tasa.toFixed(2)}
            </span>
            <span className="text-base font-semibold tabular-nums text-amber-700 dark:text-amber-300">
              {formatearBs(creditoBs)}
            </span>
          </div>
        </div>
      )}
    </Modal>
  );
}
