/**
 * Punto de venta. Buscador con scanner, carrito y cobro bimonetario.
 * Atajos: F2 buscar, F9 cobrar, Esc limpiar buscador.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Trash2, Plus, Minus, ShoppingCart, AlertTriangle } from 'lucide-react';
import { obtener, crear } from '@/lib/axios';
import { ErrorApi } from '@/lib/errores';
import { useCarrito } from '@/features/pos/carritoStore';
import { ModalCobro, type LineaPagoEnvio } from '@/features/pos/ModalCobro';
import { ModalCliente } from '@/features/pos/ModalCliente';
import { METODOS_PAGO } from '@/features/pos/metodosPago';
import { imprimirTicket } from '@/features/pos/ticket';
import { useTasaStore } from '@/store/tasaStore';
import { useAuthStore } from '@/store/authStore';
import { toast } from '@/store/toastStore';
import { formatearUSD, formatearBs, formatearCantidad } from '@/lib/formato';
import { useDebounce } from '@/hooks/useDebounce';
import type { Producto } from '@/lib/tipos';

const NEGOCIO = {
  nombre: 'MINI MARKET LOS GOCHITOS',
  direccion: 'Residencia Kimura, Torre 10 Apto. PBD',
  telefono: '0412-6837180',
  pie: 'Gracias por su compra',
};

interface RespuestaVenta {
  numero: string;
  total_usd: string;
  total_bs: string;
  vuelto_usd: string;
}

export default function PosPage() {
  const carrito = useCarrito();
  const tasa = useTasaStore((s) => s.tasa);
  const tasaNum = tasa ? Number(tasa.tasa) : 0;
  const navegar = useNavigate();

  const [termino, setTermino] = useState('');
  const terminoDebounced = useDebounce(termino, 250);
  const [resultados, setResultados] = useState<Producto[]>([]);
  const [buscando, setBuscando] = useState(false);
  const [cobrando, setCobrando] = useState(false);
  const [eligiendoCliente, setEligiendoCliente] = useState(false);
  const [procesando, setProcesando] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const totalUsd = carrito.totalUsd();
  const items = carrito.items;
  const conMayor = items.filter((i) => i.precioMayorista != null);
  const hayMayor = conMayor.length > 0;
  const todoMayor = hayMayor && conMayor.every((i) => i.esMayor);

  const impuestoTotal = useMemo(
    () =>
      items.reduce((acc, i) => {
        const base = (i.precioUnitario - i.descuentoUnitario) * i.cantidad;
        // Precio con IVA incluido: se desagrega para mostrar el impuesto.
        const factor = i.impuestoTasa / 100;
        const baseSinImp = factor > 0 ? base / (1 + factor) : base;
        return acc + (base - baseSinImp);
      }, 0),
    [items],
  );

  // Buscar productos al escribir.
  useEffect(() => {
    if (!terminoDebounced.trim()) {
      setResultados([]);
      return;
    }
    let activo = true;
    setBuscando(true);
    obtener<Producto[]>(`/productos/buscar?q=${encodeURIComponent(terminoDebounced)}`)
      .then((r) => {
        if (!activo) return;
        // Siempre mostrar la lista para que el usuario elija (no agregar solo).
        setResultados(r);
      })
      .catch(() => activo && setResultados([]))
      .finally(() => activo && setBuscando(false));
    return () => {
      activo = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [terminoDebounced]);

  // Atajos de teclado.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'F2') {
        e.preventDefault();
        inputRef.current?.focus();
      } else if (e.key === 'F3') {
        e.preventDefault();
        setEligiendoCliente(true);
      } else if (e.key === 'F9') {
        e.preventDefault();
        if (items.length > 0 && tasaNum > 0) setCobrando(true);
      } else if (e.key === 'Escape') {
        setTermino('');
        setResultados([]);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [items.length, tasaNum]);

  const onEnterBuscador = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && resultados.length > 0) {
      carrito.agregar(resultados[0]!);
      setTermino('');
      setResultados([]);
    }
  };

  const confirmarVenta = async (pagos: LineaPagoEnvio[], monedaVuelto: 'USD' | 'VES') => {
    setProcesando(true);
    // Se captura el estado del carrito antes de limpiarlo, para el ticket.
    const itemsTicket = items.map((i) => ({
      nombre: i.nombre,
      cantidad: i.cantidad,
      precioUnitario: i.precioUnitario,
      total: (i.precioUnitario - i.descuentoUnitario) * i.cantidad,
    }));
    const clienteNombre = carrito.clienteNombre;
    try {
      const venta = await crear<RespuestaVenta>('/pos/ventas', {
        clienteId: carrito.clienteId,
        renglones: items.map((i) => ({
          productoId: i.productoId,
          cantidad: String(i.cantidad),
          precioUnitario: String(i.precioUnitario),
          descuentoUnitario: i.descuentoUnitario ? String(i.descuentoUnitario) : undefined,
        })),
        pagos,
        monedaVuelto,
      });
      toast.exito(`Venta ${venta.numero} registrada · ${formatearUSD(venta.total_usd)}`);
      if (Number(venta.vuelto_usd) > 0) {
        toast.info(`Vuelto: ${formatearUSD(venta.vuelto_usd)}`);
      }
      // Imprime el ticket.
      imprimirTicket({
        negocio: NEGOCIO,
        numero: venta.numero,
        fecha: new Date(),
        cajero: useAuthStore.getState().usuario?.nombreCompleto ?? '',
        cliente: clienteNombre,
        items: itemsTicket,
        totalUsd: Number(venta.total_usd),
        totalBs: Number(venta.total_bs),
        tasa: tasaNum,
        pagos: pagos.map((p) => {
          const m = METODOS_PAGO.find((x) => x.id === p.metodoPagoId);
          return { metodo: m?.nombre ?? 'Pago', moneda: m?.moneda ?? 'USD', monto: Number(p.montoMoneda) };
        }),
        vueltoUsd: Number(venta.vuelto_usd),
      });
      carrito.limpiar();
      setCobrando(false);
      inputRef.current?.focus();
    } catch (err) {
      const msg = err instanceof ErrorApi ? err.message : 'No se pudo registrar la venta';
      toast.error(msg);
    } finally {
      setProcesando(false);
    }
  };

  if (!tasa) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
        <AlertTriangle className="h-16 w-16 text-red-400" />
        <h2 className="text-xl font-bold">No hay tasa de cambio registrada hoy</h2>
        <p className="max-w-md text-gray-500">
          Para poder facturar, registre la tasa del día. El sistema bloquea las ventas sin tasa
          para no descuadrar los reportes.
        </p>
        <button
          onClick={() => navegar('/tasas-cambio')}
          className="rounded-lg bg-amber-500 px-5 py-2.5 font-semibold text-white hover:bg-amber-600"
        >
          Registrar tasa del día
        </button>
      </div>
    );
  }

  return (
    <div className="grid h-full grid-cols-1 gap-4 lg:grid-cols-[1fr_380px]">
      {/* Columna izquierda: buscador + carrito */}
      <div className="flex flex-col gap-4 overflow-hidden">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
          <input
            ref={inputRef}
            autoFocus
            value={termino}
            onChange={(e) => setTermino(e.target.value)}
            onKeyDown={onEnterBuscador}
            placeholder="Escanear código o buscar producto (F2)"
            className="w-full rounded-xl border border-gray-300 py-3 pl-11 pr-4 text-lg focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-200 dark:border-gray-600 dark:bg-gray-800"
          />
          {buscando && <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs text-gray-400">…</span>}
        </div>

        {/* Resultados de búsqueda */}
        {resultados.length > 0 && (
          <div className="max-h-48 overflow-y-auto rounded-xl border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">
            {resultados.map((p) => (
              <button
                key={p.id}
                onClick={() => {
                  carrito.agregar(p);
                  setTermino('');
                  setResultados([]);
                  inputRef.current?.focus();
                }}
                className="flex w-full items-center justify-between border-b border-gray-100 px-4 py-2 text-left last:border-0 hover:bg-amber-50 dark:border-gray-700 dark:hover:bg-amber-900/20"
              >
                <div>
                  <p className="font-medium">{p.nombre}</p>
                  <p className="text-xs text-gray-400">{p.sku} · stock {formatearCantidad(p.cantidad)}</p>
                </div>
                <div className="text-right">
                  <p className="font-semibold">{formatearUSD(p.precio_venta)}</p>
                  <p className="text-xs text-gray-400">{formatearBs(p.precio_venta_bs)}</p>
                </div>
              </button>
            ))}
          </div>
        )}

        {/* Carrito */}
        <div className="flex-1 overflow-y-auto rounded-xl border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">
          {items.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-2 text-gray-400">
              <ShoppingCart className="h-12 w-12" />
              <p>Carrito vacío</p>
              <p className="text-xs">Escanee o busque un producto para empezar</p>
            </div>
          ) : (
            <table className="w-full">
              <thead className="sticky top-0 bg-gray-50 text-xs uppercase text-gray-500 dark:bg-gray-700/50">
                <tr>
                  <th className="p-3 text-left">Producto</th>
                  <th className="p-3 text-center">Cant.</th>
                  <th className="p-3 text-right">Precio</th>
                  <th className="p-3 text-right">Total</th>
                  <th className="p-3"></th>
                </tr>
              </thead>
              <tbody>
                {items.map((i) => (
                  <tr key={i.productoId} className="border-t border-gray-100 dark:border-gray-700">
                    <td className="p-3">
                      <p className="font-medium">{i.nombre}</p>
                      <p className="text-xs text-gray-400">{i.sku}</p>
                    </td>
                    <td className="p-3">
                      <div className="flex items-center justify-center gap-1">
                        <button
                          onClick={() => carrito.cambiarCantidad(i.productoId, i.cantidad - 1)}
                          className="rounded bg-gray-100 p-1 hover:bg-gray-200 dark:bg-gray-700"
                        >
                          <Minus className="h-3 w-3" />
                        </button>
                        <CantidadInput
                          value={i.cantidad}
                          pesable={i.esPesable}
                          onChange={(n) => carrito.cambiarCantidad(i.productoId, n)}
                        />
                        <button
                          onClick={() => carrito.cambiarCantidad(i.productoId, i.cantidad + 1)}
                          className="rounded bg-gray-100 p-1 hover:bg-gray-200 dark:bg-gray-700"
                        >
                          <Plus className="h-3 w-3" />
                        </button>
                      </div>
                    </td>
                    <td className="p-3 text-right tabular-nums">
                      <div>{formatearUSD(i.precioUnitario)}</div>
                      {i.precioMayorista != null && (
                        <button
                          onClick={() => carrito.alternarMayor(i.productoId)}
                          className={`mt-1 rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${i.esMayor ? 'bg-amber-500 text-white' : 'bg-gray-100 text-gray-500 hover:bg-amber-100 dark:bg-gray-700'}`}
                          title={i.esMayor ? 'Cobrando al mayor · toca para volver a detal' : `Cobrar al mayor (${formatearUSD(i.precioMayorista)})`}
                        >
                          {i.esMayor ? 'Mayor' : 'Detal'}
                        </button>
                      )}
                    </td>
                    <td className="p-3 text-right font-semibold tabular-nums">
                      {formatearUSD((i.precioUnitario - i.descuentoUnitario) * i.cantidad)}
                    </td>
                    <td className="p-3">
                      <button
                        onClick={() => carrito.quitar(i.productoId)}
                        className="text-gray-400 hover:text-red-500"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Columna derecha: totales + cobrar */}
      <div className="flex flex-col gap-4">
        <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
          <button onClick={() => setEligiendoCliente(true)}
            className="mb-3 flex w-full items-center justify-between rounded-lg border border-dashed border-gray-300 px-3 py-2 text-sm hover:border-amber-400 hover:bg-amber-50 dark:border-gray-600 dark:hover:bg-amber-900/20">
            <span className="text-gray-500">Cliente (F3)</span>
            <span className="font-medium">{carrito.clienteNombre}</span>
          </button>

          {items.length > 0 && (
            <button
              onClick={() => {
                if (!hayMayor) { toast.info('Ningún producto del carrito tiene precio al mayor. Configúralo en Productos (campo "Precio al mayor").'); return; }
                carrito.aplicarMayorTodo(!todoMayor);
              }}
              className={`mb-3 flex w-full items-center justify-between rounded-lg border px-3 py-2 text-sm ${todoMayor ? 'border-amber-500 bg-amber-50 text-amber-700 dark:bg-amber-900/20' : 'border-gray-300 dark:border-gray-600'}`}>
              <span>Precios al mayor</span>
              <span className="font-semibold">{!hayMayor ? 'Sin configurar' : todoMayor ? 'Activado' : 'Aplicar a todo'}</span>
            </button>
          )}
          <div className="space-y-2 border-t border-gray-100 pt-3 text-sm dark:border-gray-700">
            <div className="flex justify-between text-gray-500">
              <span>Artículos</span>
              <span>{formatearCantidad(carrito.totalItems())}</span>
            </div>
            <div className="flex justify-between text-gray-500">
              <span>IVA incluido</span>
              <span>{formatearUSD(impuestoTotal)}</span>
            </div>
          </div>
          <div className="mt-3 border-t border-gray-200 pt-3 dark:border-gray-700">
            <div className="flex items-end justify-between">
              <span className="text-sm text-gray-500">TOTAL</span>
              <div className="text-right">
                <p className="text-3xl font-bold tabular-nums">{formatearUSD(totalUsd)}</p>
                <p className="text-sm text-gray-500">{formatearBs(totalUsd * tasaNum)}</p>
              </div>
            </div>
          </div>
        </div>

        <button
          onClick={() => setCobrando(true)}
          disabled={items.length === 0}
          className="rounded-xl bg-green-600 py-4 text-lg font-bold text-white shadow-lg transition-colors hover:bg-green-700 disabled:opacity-40"
        >
          COBRAR (F9)
        </button>

        {items.length > 0 && (
          <button
            onClick={() => carrito.limpiar()}
            className="rounded-xl border border-gray-300 py-2 text-sm text-gray-600 hover:bg-gray-100 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
          >
            Cancelar venta
          </button>
        )}
      </div>

      <ModalCobro
        abierto={cobrando}
        totalUsd={totalUsd}
        tasa={tasaNum}
        onCerrar={() => setCobrando(false)}
        onConfirmar={confirmarVenta}
        procesando={procesando}
      />

      <ModalCliente
        abierto={eligiendoCliente}
        onCerrar={() => setEligiendoCliente(false)}
        onSeleccionar={(id, nombre) => carrito.fijarCliente(id, nombre)}
      />
    </div>
  );
}

/**
 * Input de cantidad que admite decimales (para productos por kg/litro). Acepta coma
 * o punto. Mientras se edita mantiene el texto local; commitea solo valores > 0 para
 * no borrar el renglón al escribir "0.".
 */
function CantidadInput({ value, pesable, onChange }: { value: number; pesable: boolean; onChange: (n: number) => void }) {
  const [texto, setTexto] = useState(String(value));
  const [editando, setEditando] = useState(false);

  useEffect(() => {
    if (!editando) setTexto(String(value));
  }, [value, editando]);

  return (
    <input
      inputMode="decimal"
      value={editando ? texto : String(value)}
      onFocus={(e) => { setEditando(true); setTexto(String(value)); e.currentTarget.select(); }}
      onChange={(e) => {
        const t = e.target.value.replace(',', '.');
        // Pesable: admite decimales. No pesable: solo enteros.
        const patron = pesable ? /^\d*\.?\d*$/ : /^\d*$/;
        if (!patron.test(t)) return;
        setTexto(t);
        const n = Number(t);
        if (n > 0) onChange(n);
      }}
      onBlur={() => {
        setEditando(false);
        const n = Number(texto.replace(',', '.'));
        onChange(n > 0 ? n : value);
      }}
      className="w-16 rounded border border-gray-200 px-1 py-0.5 text-center text-sm dark:border-gray-600 dark:bg-gray-700"
    />
  );
}
