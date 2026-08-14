/** Cartera: clientes con deuda, antigüedad de saldos y registro de abonos. */
import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { CreditCard, HandCoins, Eye, Search, FileText } from 'lucide-react';
import { obtener, crear } from '@/lib/axios';
import { ErrorApi, mensajeDeError } from '@/lib/errores';
import { Card, Cargando, EmptyState, Badge } from '@/components/ui/Feedback';
import { Modal } from '@/components/ui/Modal';
import { toast } from '@/store/toastStore';
import { useTasaStore } from '@/store/tasaStore';
import { useAuthStore } from '@/store/authStore';
import { formatearUSD, formatearBs, formatearFecha, formatearCantidad, aNumero, usdABs } from '@/lib/formato';
import { METODOS_PAGO } from '@/features/pos/metodosPago';
import { NEGOCIO } from '@/config/negocio';
import { imprimirEstadoCuenta, abrirVentanaImpresion } from '@/features/creditos/estadoCuentaImpreso';

interface FilaCartera {
  cliente_id: number; nombre: string; documento: string | null;
  /** Cuenta única de la persona: la suma de TODOS sus créditos vivos. */
  saldo_usd: string;
  /** Cuántas facturas componen esa deuda. */
  documentos: string;
  por_vencer: string; d1_30: string; d31_60: string; d61_90: string; d90_mas: string;
}

interface Deuda {
  id: number; venta_id: number | null; documento: string | null;
  fecha_emision: string; fecha_vencimiento: string;
  monto_original_usd: string; saldo_usd: string; estado: string; dias_mora: number;
}

/** Deuda consolidada de la persona, calculada en el backend sobre sus créditos. */
interface ResumenCuenta {
  deuda_usd: string; documentos: string;
  vencido_usd: string; documentos_vencidos: string;
  deuda_desde: string | null;
}

interface Abono {
  id: number; numero: string; fecha: string; moneda: string;
  monto_moneda: string; tasa_aplicada: string; monto_usd: string; estado: string;
  /** Vuelto devuelto en ese abono. Null en los históricos. */
  cambio_moneda: string | null;
  /** Moneda en la que se entregó ese vuelto; puede no ser la del abono. */
  cambio_moneda_codigo: 'USD' | 'VES' | null;
}

/** Producto de una compra fiada, atado al crédito que la representa. */
interface RenglonDeuda {
  credito_id: number; linea: number; descripcion: string;
  cantidad: string; precio_venta_unitario: string; total_linea: string;
}

interface EstadoCuenta {
  resumen: ResumenCuenta; creditos: Deuda[]; renglones: RenglonDeuda[]; abonos: Abono[];
}

interface DetalleVenta {
  venta: { numero: string; fecha: string; total_usd: string; tasa_cambio: string };
  renglones: Array<{
    linea: number; descripcion: string; cantidad: string;
    precio_venta_unitario: string; total_linea: string;
  }>;
}

const ESTADOS_VIVOS = ['PENDIENTE', 'PARCIAL', 'VENCIDO'];

/** Centavos hacia abajo: el backend convierte Bs -> USD truncando, aquí igual. */
const pisoCentavos = (n: number) => Math.floor(n * 100 + 1e-9) / 100;
/** Centavos hacia arriba: Bs mínimos que cubren un saldo en USD sin quedar corto. */
const techoCentavos = (n: number) => Math.ceil(n * 100 - 1e-9) / 100;
/**
 * Resta en centavos enteros. `10 - 9.5` en punto flotante da 0.4999999999999996 y
 * el vuelto se enviaría con basura decimal, rompiendo la cuenta recibido = abono +
 * vuelto que el backend valida.
 */
const restarCentavos = (a: number, b: number) => Math.round(a * 100 - b * 100) / 100;
/** Formatea un monto en la moneda en la que se entrega de verdad. */
const formatearMoneda = (v: number | string, moneda: 'USD' | 'VES') =>
  (moneda === 'VES' ? formatearBs(v) : formatearUSD(v));

export default function CreditosPage() {
  const qc = useQueryClient();
  const tasa = useTasaStore((s) => s.tasa);
  const tasaNum = tasa ? Number(tasa.tasa) : 0;
  const usuario = useAuthStore((s) => s.usuario);

  const [abonar, setAbonar] = useState<FilaCartera | null>(null);
  const [metodoId, setMetodoId] = useState(3);
  /** Facturas marcadas. Vacío = abonar a toda la deuda (FIFO). */
  const [seleccion, setSeleccion] = useState<number[]>([]);
  /** null = el monto lo manda la selección; string = el usuario escribió otro monto. */
  const [montoManual, setMontoManual] = useState<string | null>(null);
  /**
   * Moneda en la que el cajero ESCRIBE el monto. Puede no ser la del método: el
   * cliente dice "te pago 2 dólares" y paga por Pago Móvil; se escribe en $ y el
   * sistema registra los Bs que entran de verdad.
   */
  const [monedaEntrada, setMonedaEntrada] = useState<'USD' | 'VES'>('VES');
  /**
   * Moneda en la que se le ENTREGA el vuelto. No tiene por qué ser la del cobro:
   * el cliente paga con un billete de Bs y el cajero le devuelve en dólares porque
   * no tiene sencillo en bolívares (o al revés).
   */
  const [monedaVuelto, setMonedaVuelto] = useState<'USD' | 'VES'>('VES');
  /** Deuda cuyo detalle de productos está desplegado. */
  const [verProductos, setVerProductos] = useState<number | null>(null);
  /**
   * La cuenta se cobra como UNA sola deuda. El desglose compra por compra queda
   * escondido: solo se abre si el cliente quiere pagar una factura suelta.
   */
  const [verDetalle, setVerDetalle] = useState(false);
  const [referencia, setReferencia] = useState('');
  const [busqueda, setBusqueda] = useState('');

  const cartera = useQuery({
    queryKey: ['cartera'],
    queryFn: () => obtener<FilaCartera[]>('/creditos/cartera'),
  });

  const cuenta = useQuery({
    queryKey: ['estado-cuenta', abonar?.cliente_id],
    queryFn: () => obtener<EstadoCuenta>(`/creditos/cliente/${abonar!.cliente_id}`),
    enabled: abonar !== null,
  });

  const metodo = METODOS_PAGO.find((m) => m.id === metodoId)!;
  const enBs = monedaEntrada === 'VES';

  // Deudas vivas, más antiguas primero (el backend ya las devuelve por fecha_emision).
  // Con saldo > 0, el mismo filtro con el que el backend suma la deuda total: así
  // lo que se marca aquí y el total de la cuenta hablan de las mismas facturas.
  const deudas = useMemo(
    () => (cuenta.data?.creditos ?? []).filter(
      (c) => ESTADOS_VIVOS.includes(c.estado) && aNumero(c.saldo_usd) > 0,
    ),
    [cuenta.data],
  );
  // Cuenta única de la persona: la deuda total la suma el backend sobre sus
  // créditos. Mientras carga se usa el total de la fila de cartera, que sale de
  // la misma suma, para que el número no salte.
  const resumen = cuenta.data?.resumen;
  const deudaTotal = aNumero(resumen?.deuda_usd ?? abonar?.saldo_usd ?? 0);
  const docsDeuda = Number(resumen?.documentos ?? abonar?.documentos ?? 0);
  const vencidoTotal = aNumero(resumen?.vencido_usd ?? 0);

  // Objetivo del abono: lo marcado, o todo si no hay nada marcado.
  const objetivo = seleccion.length > 0 ? deudas.filter((d) => seleccion.includes(d.id)) : deudas;
  const saldoObjetivo = objetivo.reduce((a, d) => a + aNumero(d.saldo_usd), 0);

  // Monto sugerido = pagar completo lo marcado, en la moneda del método.
  const montoSugerido = enBs && tasaNum > 0
    ? techoCentavos(saldoObjetivo * tasaNum).toFixed(2)
    : saldoObjetivo.toFixed(2);
  const monto = montoManual ?? montoSugerido;

  // Equivalente en USD con la misma aritmética del backend (piso + tolerancia de 1 centavo).
  const montoUsdCrudo = enBs
    ? (tasaNum > 0 ? pisoCentavos(aNumero(monto) / tasaNum) : 0)
    : pisoCentavos(aNumero(monto));
  const montoUsd = Math.abs(montoUsdCrudo - saldoObjetivo) <= 0.01 ? saldoObjetivo : montoUsdCrudo;
  const montoBs = montoUsd * tasaNum;

  /**
   * El cliente casi nunca entrega el monto justo: debe 9,50 y da un billete de 10.
   * Lo que se ABONA nunca pasa de la deuda marcada; lo que sobra del billete es su
   * vuelto y se le devuelve de la gaveta.
   */
  const abonoUsd = Math.min(montoUsd, saldoObjetivo);
  const vueltoUsd = restarCentavos(montoUsd, abonoUsd);
  const hayVuelto = vueltoUsd > 0;
  /** De una transferencia no sale efectivo: ahí el monto tiene que ser exacto. */
  const vueltoImposible = hayVuelto && !metodo.permiteCambio;
  /** En cuánto queda la cuenta de la persona después de este abono. */
  const quedaCuenta = Math.max(0, deudaTotal - abonoUsd);

  /**
   * Lo que se envía al backend va SIEMPRE en la moneda del método de pago (es la
   * plata que entra a caja). Si se escribió en la otra moneda, se convierte acá.
   */
  const monedaDistinta = metodo.moneda !== monedaEntrada;
  const aMonedaMetodo = (usd: number) => (metodo.moneda === 'VES'
    ? techoCentavos(usd * tasaNum)
    : usd);
  /** El billete completo que entra por la gaveta. */
  const recibidoEnvio = monedaDistinta ? aMonedaMetodo(montoUsd) : aNumero(monto);
  /** Lo que se abona: si pagó de más, exactamente lo que salda la deuda marcada. */
  const abonoEnvio = hayVuelto ? aMonedaMetodo(saldoObjetivo) : recibidoEnvio;
  /** El resto del billete. Se calcula por resta para que recibido = abono + vuelto. */
  const vueltoEnvio = Math.max(0, restarCentavos(recibidoEnvio, abonoEnvio));

  /*
    El mismo vuelto visto en las dos monedas: el cajero necesita saber cuánto le
    devuelve en dólares Y cuánto es eso en bolívares, porque puede pagar con
    cualquiera de los dos.

    Los dólares salen del SOBRANTE con piso, exactamente como los calcula el
    backend (`montoMonedaAUsdPiso` sobre el excedente), no restando conversiones:
    si no, la pantalla y el movimiento de caja se separan por un centavo.
  */
  const vueltoUsdReal = metodo.moneda === 'USD'
    ? vueltoEnvio
    : (tasaNum > 0 ? pisoCentavos(vueltoEnvio / tasaNum) : 0);
  const vueltoBsReal = metodo.moneda === 'VES' ? vueltoEnvio : usdABs(vueltoUsdReal, tasaNum);
  /** Sin tasa no hay forma de devolver en la otra moneda. */
  const puedeCambiarMonedaVuelto = tasaNum > 0 && vueltoUsdReal > 0;
  const monedaVueltoReal = puedeCambiarMonedaVuelto ? monedaVuelto : metodo.moneda;
  /** Lo que el cajero saca de la gaveta, en la moneda elegida. */
  const vueltoEntregado = monedaVueltoReal === 'USD' ? vueltoUsdReal : vueltoBsReal;

  // Previsualización: cómo caería el abono factura por factura (FIFO).
  const aplicacion = useMemo(() => {
    const mapa = new Map<number, number>();
    let resto = abonoUsd;
    for (const d of objetivo) {
      if (resto <= 0) break;
      const saldo = aNumero(d.saldo_usd);
      const aplica = Math.min(resto, saldo);
      mapa.set(d.id, aplica);
      resto -= aplica;
    }
    return mapa;
  }, [objetivo, abonoUsd]);

  const abrir = (c: FilaCartera) => {
    setAbonar(c); setSeleccion([]); setMontoManual(null); setReferencia('');
    setMonedaEntrada(metodo.moneda); setMonedaVuelto(metodo.moneda);
    setVerProductos(null); setVerDetalle(false);
  };
  /**
   * Estado de cuenta imprimible (PDF) de una persona. Sirve desde la lista y
   * desde el modal: si la cuenta ya se pidió, sale de la caché de React Query.
   */
  const imprimirCuenta = async (c: FilaCartera) => {
    const ventana = abrirVentanaImpresion();
    try {
      const datos = await qc.fetchQuery({
        queryKey: ['estado-cuenta', c.cliente_id],
        queryFn: () => obtener<EstadoCuenta>(`/creditos/cliente/${c.cliente_id}`),
      });
      const pendientes = datos.creditos.filter(
        (d) => ESTADOS_VIVOS.includes(d.estado) && aNumero(d.saldo_usd) > 0,
      );
      imprimirEstadoCuenta({
        negocio: NEGOCIO,
        cliente: { nombre: c.nombre, documento: c.documento },
        fecha: new Date(),
        tasa: tasaNum,
        deudas: pendientes,
        renglones: datos.renglones ?? [],
        totalUsd: aNumero(datos.resumen?.deuda_usd ?? c.saldo_usd),
        abonos: (datos.abonos ?? []).slice(0, 10),
        atendidoPor: usuario?.nombreCompleto ?? null,
      }, ventana);
    } catch {
      ventana?.close();
      toast.error('No se pudo generar el estado de cuenta');
    }
  };

  /** Al cerrar el desglose se vuelve a cobrar la cuenta completa. */
  const alternarDetalle = () => {
    setVerDetalle((v) => {
      if (v) { setSeleccion([]); setMontoManual(null); setVerProductos(null); }
      return !v;
    });
  };
  const alternar = (id: number) => {
    setMontoManual(null); // el monto vuelve a seguir la selección
    setSeleccion((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  };
  const marcarTodas = () => {
    setMontoManual(null);
    setSeleccion((s) => (s.length === deudas.length ? [] : deudas.map((d) => d.id)));
  };

  const registrarAbono = useMutation({
    mutationFn: () => crear('/abonos', {
      clienteId: abonar!.cliente_id, metodoPagoId: metodoId, moneda: metodo.moneda,
      montoMoneda: abonoEnvio.toFixed(2),
      // Solo cuando hay vuelto: sin esto el backend asume pago justo, como siempre.
      montoRecibidoMoneda: hayVuelto ? recibidoEnvio.toFixed(2) : undefined,
      // En qué moneda se le entregó el vuelto, que puede no ser la del cobro.
      monedaVuelto: hayVuelto ? monedaVueltoReal : undefined,
      creditoIds: seleccion.length > 0 ? seleccion : undefined,
      referencia: referencia || undefined,
    }),
    onSuccess: () => {
      // El vuelto es lo primero que el cajero necesita saber: se lo tiene que
      // entregar al cliente que está enfrente.
      toast.exito(hayVuelto
        ? `Abono registrado · Entrega de vuelto ${formatearMoneda(vueltoEntregado, monedaVueltoReal)}`
        : 'Abono registrado');
      qc.invalidateQueries({ queryKey: ['cartera'] });
      qc.invalidateQueries({ queryKey: ['estado-cuenta'] });
      // El abono puede saldar la venta: su badge en Ventas pasa a "Pagada".
      qc.invalidateQueries({ queryKey: ['ventas'] });
      qc.invalidateQueries({ queryKey: ['venta-detalle'] });
      // Baja el contador de "te deben" y sube lo cobrado del día en el dashboard.
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      setAbonar(null); setSeleccion([]); setMontoManual(null); setReferencia('');
    },
    onError: (e) => toast.error(e instanceof ErrorApi ? e.message : 'No se pudo registrar el abono'),
  });

  // La cartera llega completa del backend: el filtro por cliente es local.
  const filasCartera = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    if (!q) return cartera.data ?? [];
    return (cartera.data ?? []).filter(
      (c) => c.nombre.toLowerCase().includes(q) || (c.documento ?? '').toLowerCase().includes(q),
    );
  }, [cartera.data, busqueda]);

  const totalCartera = (cartera.data ?? []).reduce((a, c) => a + Number(c.saldo_usd), 0);
  const puedeRegistrar = abonoUsd > 0 && !vueltoImposible && !registrarAbono.isPending
    && (!metodo.requiereReferencia || Boolean(referencia))
    // Sin tasa del día no hay conversión posible en ninguno de los dos sentidos.
    && !((enBs || metodo.moneda === 'VES') && tasaNum <= 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Créditos y cartera</h1>
          {/* La deuda se valora a la tasa de HOY, no a la del día en que se fió. */}
          <p className="text-sm text-gray-500">
            Deuda total: {formatearUSD(totalCartera)}
            {tasaNum > 0
              ? <> · {formatearBs(usdABs(totalCartera, tasaNum))} <span className="text-xs text-gray-400">a la tasa de hoy</span></>
              : <span className="font-medium text-red-500"> · sin tasa de hoy, no se puede valorar en Bs</span>}
          </p>
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input value={busqueda} onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar cliente o cédula/RIF…"
            className="w-full rounded-lg border border-gray-300 py-2 pl-9 pr-3 text-sm focus:border-amber-500 focus:outline-none dark:border-gray-600 dark:bg-gray-800 sm:w-64" />
        </div>
      </div>

      <Card padding={false}>
        {cartera.isLoading ? <Cargando /> : filasCartera.length === 0 ? (
          <EmptyState titulo={busqueda ? 'Sin resultados' : 'Sin cartera pendiente'}
            descripcion={busqueda ? 'Ningún cliente con deuda coincide con la búsqueda.' : 'Ningún cliente tiene deuda.'}
            icono={<CreditCard className="h-12 w-12" />} />
        ) : (
          <>
            {/* Teléfono: tarjeta por cliente. La antigüedad va en dos filas de chips. */}
            <ul className="divide-y divide-gray-100 md:hidden dark:divide-gray-700">
              {filasCartera.map((c) => (
                <li key={c.cliente_id} className="space-y-2 p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{c.nombre}</p>
                      <p className="text-xs text-gray-400">
                        {c.documento && <span>{c.documento} · </span>}
                        {c.documentos} {Number(c.documentos) === 1 ? 'factura' : 'facturas'}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="font-bold tabular-nums">{formatearUSD(c.saldo_usd)}</p>
                      <p className="text-xs tabular-nums text-gray-400">{tasaNum > 0 ? formatearBs(usdABs(c.saldo_usd, tasaNum)) : '—'}</p>
                    </div>
                  </div>
                  {/* Solo los tramos con deuda: ahorra espacio y resalta la mora. */}
                  <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs">
                    {([
                      ['Por vencer', c.por_vencer, 'text-gray-500'],
                      ['1-30', c.d1_30, 'text-gray-600 dark:text-gray-300'],
                      ['31-60', c.d31_60, 'text-amber-600'],
                      ['61-90', c.d61_90, 'text-orange-600'],
                      ['+90', c.d90_mas, 'text-red-600 font-semibold'],
                    ] as const).filter(([, monto]) => aNumero(monto) > 0).map(([etiqueta, monto, color]) => (
                      <span key={etiqueta} className={color}>
                        {etiqueta}: <span className="tabular-nums">{formatearUSD(monto, false)}</span>
                      </span>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => abrir(c)} className="flex flex-1 items-center justify-center gap-1 rounded-lg bg-green-600 px-3 py-2 text-sm font-semibold text-white active:bg-green-700">
                      <HandCoins className="h-4 w-4" /> Abonar
                    </button>
                    <button onClick={() => imprimirCuenta(c)} title="Estado de cuenta en PDF"
                      className="flex items-center justify-center gap-1 rounded-lg border border-gray-300 px-3 py-2 text-sm font-semibold active:bg-gray-100 dark:border-gray-600 dark:active:bg-gray-700">
                      <FileText className="h-4 w-4" /> PDF
                    </button>
                  </div>
                </li>
              ))}
            </ul>

            <div className="hidden overflow-x-auto md:block">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs uppercase text-gray-500 dark:bg-gray-700/50">
                <tr>
                  <th className="p-3 text-left">Cliente</th>
                  <th className="p-3 text-right">Por vencer</th>
                  <th className="p-3 text-right">1-30</th>
                  <th className="p-3 text-right">31-60</th>
                  <th className="p-3 text-right">61-90</th>
                  <th className="p-3 text-right">+90</th>
                  <th className="p-3 text-right">Saldo total</th>
                  <th className="p-3"></th>
                </tr>
              </thead>
              <tbody>
                {filasCartera.map((c) => (
                  <tr key={c.cliente_id} className="border-t border-gray-100 dark:border-gray-700">
                    <td className="p-3 font-medium">
                      {c.nombre}
                      <span className="block text-xs font-normal text-gray-400">
                        {c.documento && <>{c.documento} · </>}
                        {c.documentos} {Number(c.documentos) === 1 ? 'factura' : 'facturas'}
                      </span>
                    </td>
                    <td className="p-3 text-right tabular-nums text-gray-500">{formatearUSD(c.por_vencer, false)}</td>
                    <td className="p-3 text-right tabular-nums">{formatearUSD(c.d1_30, false)}</td>
                    <td className="p-3 text-right tabular-nums text-amber-600">{formatearUSD(c.d31_60, false)}</td>
                    <td className="p-3 text-right tabular-nums text-orange-600">{formatearUSD(c.d61_90, false)}</td>
                    <td className="p-3 text-right tabular-nums font-semibold text-red-600">{formatearUSD(c.d90_mas, false)}</td>
                    <td className="p-3 text-right tabular-nums font-bold">
                      {formatearUSD(c.saldo_usd)}
                      <span className="block text-xs font-normal text-gray-400">{tasaNum > 0 ? formatearBs(usdABs(c.saldo_usd, tasaNum)) : '—'}</span>
                    </td>
                    <td className="p-3">
                      <div className="flex items-center justify-end gap-1">
                        <button onClick={() => imprimirCuenta(c)} title="Estado de cuenta en PDF"
                          className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-amber-600 dark:hover:bg-gray-700">
                          <FileText className="h-4 w-4" />
                        </button>
                        <button onClick={() => abrir(c)} className="flex items-center gap-1 rounded-lg bg-green-600 px-3 py-1 text-xs font-semibold text-white hover:bg-green-700">
                          <HandCoins className="h-3.5 w-3.5" /> Abonar
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          </>
        )}
      </Card>

      <Modal abierto={Boolean(abonar)} onCerrar={() => setAbonar(null)} titulo={`Abono de ${abonar?.nombre ?? ''}`} ancho="lg"
        pie={
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-sm">
              <span className="text-gray-500">
                {seleccion.length > 0 ? `${seleccion.length} compra(s) marcada(s):` : 'Cuenta completa:'}
              </span>{' '}
              <span className="font-semibold">{formatearUSD(saldoObjetivo)}</span>
              {vueltoImposible && (
                <p className="text-xs font-medium text-red-500">
                  Con {metodo.nombre} no se puede dar vuelto: cobra el monto exacto o recibe en efectivo
                </p>
              )}
            </div>
            <button onClick={() => registrarAbono.mutate()} disabled={!puedeRegistrar}
              className="w-full shrink-0 rounded-lg bg-green-600 px-5 py-2 font-semibold text-white hover:bg-green-700 disabled:opacity-50 sm:w-auto">
              {registrarAbono.isPending ? 'Registrando…' : `Abonar ${formatearUSD(abonoUsd)}`}
            </button>
          </div>
        }>
        <div className="space-y-4">
          {/*
            Si el estado de cuenta no cargó hay que DECIRLO. Antes el modal se
            quedaba mudo: "Sin facturas pendientes" y "Cuenta completa: $ 0,00"
            sobre un cliente que sí debe, sin ninguna pista de que la petición
            había fallado. El cajero creía que la deuda se había borrado sola.
          */}
          {cuenta.isError && (
            <div className="rounded-lg border border-red-300 bg-red-50 p-3 dark:border-red-800 dark:bg-red-900/20">
              <p className="text-sm font-medium text-red-600 dark:text-red-400">
                No se pudo cargar el estado de cuenta de este cliente.
              </p>
              {/* El mensaje del backend tal cual: trae el código y la causa real. */}
              <p className="mt-0.5 text-xs text-red-500">{mensajeDeError(cuenta.error)}</p>
              <button onClick={() => cuenta.refetch()}
                className="mt-2 rounded-lg border border-red-400 px-3 py-1 text-xs font-semibold text-red-600 hover:bg-red-100 dark:hover:bg-red-900/40">
                Reintentar
              </button>
            </div>
          )}
          {/*
            Cargó bien pero la deuda no cuadra con las facturas: la cartera dice
            que debe y no vino ninguna. Es un descuadre de datos, no una cuenta en
            cero, y cobrar a ciegas sería peor.
          */}
          {!cuenta.isLoading && !cuenta.isError && deudas.length === 0 && deudaTotal > 0 && (
            <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm dark:border-amber-800 dark:bg-amber-900/20">
              <p className="font-medium text-amber-700 dark:text-amber-400">
                Este cliente aparece debiendo {formatearUSD(deudaTotal)} pero no llegó ninguna factura pendiente.
              </p>
              <p className="mt-0.5 text-xs text-amber-600">
                No se puede abonar hasta que cuadre. Revisa sus créditos antes de cobrarle.
              </p>
            </div>
          )}
          {/*
            La cuenta de la persona como UNA sola deuda: la suma de todo lo que
            debe y en qué queda después de este abono. El desglose compra por
            compra vive detrás del enlace de abajo.
          */}
          <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 dark:border-gray-700 dark:bg-gray-900/40">
            <div className="flex flex-wrap items-baseline justify-between gap-x-4">
              <span className="text-xs font-medium uppercase tracking-wide text-gray-500">Deuda total de la cuenta</span>
              <span className="text-xl font-bold tabular-nums">{formatearUSD(deudaTotal)}</span>
            </div>
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 text-xs text-gray-500">
              <span>
                {docsDeuda} {docsDeuda === 1 ? 'compra fiada' : 'compras fiadas'}
                {vencidoTotal > 0 && (
                  <span className="ml-1 font-medium text-red-500">· {formatearUSD(vencidoTotal)} vencido</span>
                )}
              </span>
              <span className="tabular-nums">{tasaNum > 0 ? formatearBs(usdABs(deudaTotal, tasaNum)) : 'sin tasa de hoy'}</span>
            </div>
            {abonar && (
              <button onClick={() => imprimirCuenta(abonar)}
                className="mt-2 flex items-center gap-1 text-xs font-semibold text-amber-600 hover:underline">
                <FileText className="h-3.5 w-3.5" /> Estado de cuenta en PDF
              </button>
            )}
            {abonoUsd > 0 && (
              <p className="mt-2 border-t border-gray-200 pt-2 text-sm dark:border-gray-700">
                {quedaCuenta <= 0
                  ? <span className="font-semibold text-green-600">Con este abono la cuenta queda en cero</span>
                  : <>Con este abono queda debiendo <span className="font-semibold">{formatearUSD(quedaCuenta)}</span>
                      {tasaNum > 0 && <span className="text-gray-400"> · {formatearBs(usdABs(quedaCuenta, tasaNum))}</span>}</>}
              </p>
            )}
          </div>

          {/* Desglose: solo si el cliente quiere pagar una compra suelta. */}
          <div>
            <div className="mb-1 flex items-center justify-between gap-2">
              <label className="text-xs font-medium text-gray-500">
                {verDetalle
                  ? <>Marca lo que paga <span className="text-gray-400">· sin marcar se abona a lo más antiguo primero</span></>
                  : <>Se abona a la cuenta completa, de lo más antiguo a lo más nuevo</>}
              </label>
              {deudas.length > 0 && (
                <button onClick={alternarDetalle} className="shrink-0 text-xs font-semibold text-amber-600 hover:underline">
                  {verDetalle
                    ? 'Cobrar la cuenta completa'
                    : `Ver las ${deudas.length} ${deudas.length === 1 ? 'compra' : 'compras'}`}
                </button>
              )}
            </div>
            {cuenta.isLoading ? <Cargando /> : deudas.length === 0 ? (
              <p className="rounded-lg border border-dashed border-gray-300 p-3 text-center text-sm text-gray-400 dark:border-gray-600">Sin facturas pendientes</p>
            ) : !verDetalle ? null : (
              <div className="max-h-72 space-y-1 overflow-y-auto rounded-lg border border-gray-200 p-1 dark:border-gray-700">
                <div className="flex justify-end px-1 pt-1">
                  <button onClick={marcarTodas} className="text-xs font-semibold text-amber-600 hover:underline">
                    {seleccion.length === deudas.length ? 'Quitar todas' : 'Marcar todas'}
                  </button>
                </div>
                {deudas.map((d) => {
                  const marcada = seleccion.includes(d.id);
                  const aplica = aplicacion.get(d.id) ?? 0;
                  const saldo = aNumero(d.saldo_usd);
                  const queda = saldo - aplica;
                  const abierta = verProductos === d.id;
                  return (
                    <div key={d.id} className={`rounded-lg ${marcada ? 'bg-amber-50 dark:bg-amber-900/20' : ''}`}>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 p-2 text-sm hover:bg-gray-50 dark:hover:bg-gray-700/50">
                        {/* El label envuelve solo lo que debe marcar el checkbox, no el botón de ver. */}
                        <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-3">
                          <input type="checkbox" checked={marcada} onChange={() => alternar(d.id)}
                            className="h-4 w-4 rounded border-gray-300 text-amber-600 focus:ring-amber-500" />
                          <div className="min-w-0 flex-1">
                            <p className="truncate font-medium">{d.documento ?? `Crédito #${d.id}`}</p>
                            <p className="text-xs text-gray-400">
                              Vence {formatearFecha(d.fecha_vencimiento)}
                              {d.dias_mora > 0 && <span className="ml-1 text-red-500">· {d.dias_mora} d. de mora</span>}
                            </p>
                          </div>
                        </label>
                        {d.venta_id != null && (
                          <button onClick={() => setVerProductos(abierta ? null : d.id)}
                            title="Ver qué productos se llevó en esta factura"
                            className={`rounded-lg p-1.5 ${abierta ? 'bg-amber-500 text-white' : 'text-gray-400 hover:bg-gray-100 hover:text-amber-600 dark:hover:bg-gray-700'}`}>
                            <Eye className="h-4 w-4" />
                          </button>
                        )}
                        <div className="text-right tabular-nums">
                          <p className="font-semibold">{formatearUSD(saldo)}</p>
                          <p className="text-xs text-gray-400">{tasaNum > 0 ? formatearBs(usdABs(saldo, tasaNum)) : '—'}</p>
                        </div>
                        {/* En teléfono baja a su propia línea en vez de apretar la fila. */}
                        <div className="w-full text-right sm:w-24">
                          {aplica > 0 ? (
                            queda <= 0
                              ? <Badge color="verde">Se paga</Badge>
                              : <span className="text-xs text-amber-600">Abona {formatearUSD(aplica)}<br />queda {formatearUSD(queda)}</span>
                          ) : <span className="text-xs text-gray-300 dark:text-gray-600">—</span>}
                        </div>
                      </div>
                      {abierta && <ProductosDeVenta ventaId={d.venta_id!} tasaHoy={tasaNum} />}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-500">Método de pago</label>
              <select value={metodoId}
                onChange={(e) => {
                  const id = Number(e.target.value);
                  setMetodoId(id);
                  // El monto se escribe por defecto en la moneda del método elegido,
                  // y el vuelto se devuelve en esa misma moneda salvo que se cambie.
                  const monedaMetodo = METODOS_PAGO.find((m) => m.id === id)?.moneda ?? 'VES';
                  setMonedaEntrada(monedaMetodo);
                  setMonedaVuelto(monedaMetodo);
                  setMontoManual(null);
                }} className={INP}>
                {METODOS_PAGO.filter((m) => !m.esCredito).map((m) => <option key={m.id} value={m.id}>{m.nombre} ({m.moneda})</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1 flex items-center justify-between text-xs font-medium text-gray-500">
                <span>Monto</span>
                {montoManual !== null && (
                  <button onClick={() => setMontoManual(null)} className="text-amber-600 hover:underline">Pagar completo</button>
                )}
              </label>
              <div className="flex gap-2">
                {/* Se puede escribir en $ o en Bs; abajo se ve siempre la conversión. */}
                <div className="flex overflow-hidden rounded-lg border border-gray-300 dark:border-gray-600">
                  {(['USD', 'VES'] as const).map((m) => (
                    <button key={m} onClick={() => { setMonedaEntrada(m); setMontoManual(null); }}
                      disabled={m === 'VES' && tasaNum <= 0}
                      className={`px-3 py-2 text-sm font-bold disabled:opacity-40 ${monedaEntrada === m ? 'bg-amber-500 text-white' : 'text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700'}`}>
                      {m === 'USD' ? '$' : 'Bs'}
                    </button>
                  ))}
                </div>
                <input type="number" step="0.01" min="0" value={monto}
                  onChange={(e) => setMontoManual(e.target.value)}
                  onFocus={(e) => e.currentTarget.select()}
                  className={`${INP} min-w-0 flex-1`} placeholder="0.00" />
              </div>
              <p className="mt-1 text-xs text-gray-400">
                {tasaNum > 0
                  ? `${formatearUSD(montoUsd)} · ${formatearBs(montoBs)} (tasa ${formatearBs(tasaNum)}/$)`
                  : 'No hay tasa registrada hoy'}
              </p>
              {monedaDistinta && tasaNum > 0 && montoUsd > 0 && (
                <p className="mt-1 text-xs text-amber-600">
                  Entra por {metodo.nombre}: se registra {formatearMoneda(recibidoEnvio, metodo.moneda)}
                </p>
              )}
            </div>
          </div>

          {/*
            El cliente debe 9,50 y da un billete de 10. Lo que el cajero necesita
            ver de un vistazo no es el abono —ese lo salda el sistema— sino cuánto
            tiene que sacar de la gaveta para devolverle.
          */}
          {hayVuelto && (
            <div className={`rounded-lg border p-3 ${vueltoImposible
              ? 'border-red-300 bg-red-50 dark:border-red-800 dark:bg-red-900/20'
              : 'border-green-300 bg-green-50 dark:border-green-800 dark:bg-green-900/20'}`}>
              {vueltoImposible ? (
                <p className="text-sm font-medium text-red-600 dark:text-red-400">
                  Sobran {formatearUSD(vueltoUsd)} y {metodo.nombre} no da vuelto.
                  <span className="mt-0.5 block text-xs font-normal">
                    De una transferencia no sale efectivo. Cobra el monto exacto
                    ({formatearMoneda(abonoEnvio, metodo.moneda)}) o recibe en efectivo.
                  </span>
                </p>
              ) : (
                <>
                  <div className="flex flex-wrap items-baseline justify-between gap-x-4">
                    <span className="text-xs font-medium uppercase tracking-wide text-green-700 dark:text-green-400">
                      Vuelto a entregar
                    </span>
                    <span className="text-xl font-bold tabular-nums text-green-700 dark:text-green-400">
                      {formatearMoneda(vueltoEntregado, monedaVueltoReal)}
                    </span>
                  </div>
                  {/*
                    Las dos monedas SIEMPRE a la vista: el mismo vuelto son $ 0,83 o
                    Bs 152,40 y el cajero decide con qué billetes lo paga. La que se
                    entrega va resaltada; la otra queda como referencia.
                  */}
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    {([
                      ['USD', 'En dólares', formatearUSD(vueltoUsdReal)],
                      ['VES', 'En bolívares', formatearBs(vueltoBsReal)],
                    ] as const).map(([m, etiqueta, monto]) => (
                      <button key={m}
                        onClick={() => setMonedaVuelto(m)}
                        disabled={!puedeCambiarMonedaVuelto}
                        title={puedeCambiarMonedaVuelto
                          ? `Entregar el vuelto en ${m === 'USD' ? 'dólares' : 'bolívares'}`
                          : 'Sin tasa de hoy el vuelto sale en la moneda del cobro'}
                        className={`rounded-lg border px-3 py-2 text-left disabled:cursor-default ${
                          monedaVueltoReal === m
                            ? 'border-green-500 bg-white shadow-sm dark:bg-gray-800'
                            : 'border-gray-200 bg-white/50 opacity-70 hover:opacity-100 dark:border-gray-700 dark:bg-gray-800/40'}`}>
                        <span className="block text-[11px] uppercase tracking-wide text-gray-500">
                          {etiqueta}{monedaVueltoReal === m && ' · se entrega'}
                        </span>
                        <span className="block text-base font-bold tabular-nums">{monto}</span>
                      </button>
                    ))}
                  </div>
                  <p className="mt-2 text-xs text-gray-500">
                    Recibes {formatearMoneda(recibidoEnvio, metodo.moneda)} · se abonan{' '}
                    {formatearMoneda(abonoEnvio, metodo.moneda)} ({formatearUSD(abonoUsd)})
                    {puedeCambiarMonedaVuelto && (
                      <> · toca una de las dos para elegir con qué le devuelves</>
                    )}
                  </p>
                </>
              )}
            </div>
          )}

          {/* Abonos parciales rápidos sobre lo marcado */}
          {saldoObjetivo > 0 && (
            <div className="flex flex-wrap gap-2">
              {[0.25, 0.5, 0.75, 1].map((f) => {
                const usd = f === 1 ? saldoObjetivo : pisoCentavos(saldoObjetivo * f);
                const valor = enBs && tasaNum > 0 ? techoCentavos(usd * tasaNum).toFixed(2) : usd.toFixed(2);
                return (
                  <button key={f} onClick={() => setMontoManual(f === 1 ? null : valor)}
                    className="rounded-lg border border-gray-300 px-3 py-1 text-xs font-semibold hover:border-amber-400 hover:bg-amber-50 dark:border-gray-600 dark:hover:bg-amber-900/20">
                    {f === 1 ? 'Todo' : `${f * 100} %`} · {formatearUSD(usd)}
                    {enBs && tasaNum > 0 && <span className="ml-1 text-gray-400">({formatearBs(valor)})</span>}
                  </button>
                );
              })}
            </div>
          )}

          {metodo.requiereReferencia && (
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-500">Referencia</label>
              <input value={referencia} onChange={(e) => setReferencia(e.target.value)} className={INP} placeholder="N.º de referencia" />
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
}

/**
 * Productos que se llevó el cliente en la factura de esa deuda.
 * Los Bs van con la tasa CONGELADA de la venta (`tasa_cambio`), no con la de hoy:
 * es lo que costó ese día. La tasa de hoy solo se muestra si el documento no la trae.
 */
function ProductosDeVenta({ ventaId, tasaHoy }: { ventaId: number; tasaHoy: number }) {
  const venta = useQuery({
    queryKey: ['venta-detalle', ventaId],
    queryFn: () => obtener<DetalleVenta>(`/ventas/${ventaId}`),
  });

  if (venta.isLoading) return <div className="px-2 pb-2"><Cargando /></div>;
  if (venta.isError) {
    return (
      <p className="px-4 pb-2 text-xs text-gray-400">
        No se pudo cargar el detalle de la factura (¿permiso para ver ventas?).
      </p>
    );
  }
  if (!venta.data) return null;

  const tasa = aNumero(venta.data.venta.tasa_cambio) || tasaHoy;

  return (
    <div className="mx-2 mb-2 rounded-lg bg-gray-50 p-2 dark:bg-gray-900/40">
      <p className="mb-1 text-[11px] uppercase tracking-wide text-gray-400">
        Factura {venta.data.venta.numero} · {formatearFecha(venta.data.venta.fecha)}
      </p>
      <table className="w-full text-xs">
        <tbody>
          {venta.data.renglones.map((r) => (
            <tr key={r.linea} className="border-t border-gray-200 first:border-0 dark:border-gray-700">
              <td className="py-1 pr-2">
                <span className="font-medium">{r.descripcion}</span>
                <span className="ml-1 text-gray-400">
                  {formatearCantidad(r.cantidad)} × {formatearUSD(r.precio_venta_unitario)}
                </span>
              </td>
              <td className="py-1 text-right tabular-nums">
                {formatearUSD(r.total_linea)}
                <span className="block text-[11px] text-gray-400">{formatearBs(usdABs(r.total_linea, tasa))}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mt-1 flex justify-between border-t border-gray-200 pt-1 text-xs font-bold dark:border-gray-700">
        <span>Total de la factura</span>
        <span className="tabular-nums">
          {formatearUSD(venta.data.venta.total_usd)}
          <span className="ml-1 font-normal text-gray-400">{formatearBs(usdABs(venta.data.venta.total_usd, tasa))}</span>
        </span>
      </div>
    </div>
  );
}

const INP = 'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-amber-500 focus:outline-none dark:border-gray-600 dark:bg-gray-700';
