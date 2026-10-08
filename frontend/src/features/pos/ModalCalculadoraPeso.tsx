import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Search, Scale, ListChecks } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Cargando } from '@/components/ui/Feedback';
import { Checkbox } from '@/components/ui/Checkbox';
import { obtenerPaginado } from '@/lib/axios';
import { formatearBs, formatearUSD, formatearNumero, normalizar } from '@/lib/formato';
import type { Producto } from '@/lib/tipos';
import { calcularPeso, precioPorKg, type CampoPeso } from './calculadoraPeso';
import { useCalculadoraPesoStore } from './calculadoraPesoStore';

async function cargarPesables() {
  const productos: Producto[] = [];
  let pagina = 1;
  let totalPaginas = 1;
  do {
    const respuesta = await obtenerPaginado<Producto>(`/productos?soloPesables=true&soloActivos=true&limite=100&pagina=${pagina}`);
    productos.push(...respuesta.datos);
    totalPaginas = respuesta.meta.totalPaginas;
    pagina++;
  } while (pagina <= totalPaginas);
  return productos.filter((p) => ['KG', 'GR', 'G'].includes(p.unidad_codigo.toUpperCase()));
}

export function ModalCalculadoraPeso({ abierto, onCerrar, tasa }: {
  abierto: boolean; onCerrar: () => void; tasa: number;
}) {
  const [busqueda, setBusqueda] = useState('');
  const [eligiendo, setEligiendo] = useState(false);
  const { seleccionados, alternar, seleccionarTodos, desmarcarTodos } = useCalculadoraPesoStore();
  const productos = useQuery({
    queryKey: ['productos', 'calculadora-peso'],
    queryFn: cargarPesables,
    enabled: abierto,
    staleTime: 0,
  });
  const disponibles = productos.data ?? [];
  const idsDisponibles = disponibles.map((p) => p.id);
  const elegidos = new Set(seleccionados ?? idsDisponibles);
  const coincidencias = disponibles.filter((p) => normalizar(`${p.nombre} ${p.sku}`).includes(normalizar(busqueda)));
  const visibles = coincidencias.filter((p) => elegidos.has(p.id));
  const cantidadElegidos = disponibles.filter((p) => elegidos.has(p.id)).length;
  const tasaValida = Number.isFinite(tasa) && tasa > 0;

  return (
    <Modal abierto={abierto} onCerrar={onCerrar} titulo="Calculadora de productos pesados" ancho="xl"
      pie={<button type="button" onClick={onCerrar} className="w-full rounded-lg border border-gray-300 px-4 py-2 text-sm dark:border-gray-600">Cerrar</button>}>
      <div className="space-y-4">
        <div className="rounded-lg bg-amber-50 p-3 text-sm dark:bg-amber-900/20">
          <p>Escribe un monto en Bs, dólares o un peso en kg para calcular sus equivalentes.</p>
          <p className="mt-1 font-semibold">Tasa del día: {tasaValida ? `${formatearBs(tasa)} por $ 1` : 'Sin tasa válida'}</p>
          <p className="mt-1 text-xs text-gray-500">Precios de venta al detal con IVA incluido. El peso es aproximado; confirma el peso real en la balanza.</p>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <button type="button" onClick={() => setEligiendo((actual) => !actual)} aria-expanded={eligiendo} aria-controls="seleccion-productos-peso"
            className="flex items-center gap-2 rounded-lg border border-purple-500 px-3 py-2 text-sm font-semibold text-purple-700 hover:bg-purple-50 dark:text-white dark:hover:bg-purple-900/30">
            <ListChecks className="h-5 w-5" aria-hidden="true" />
            {eligiendo ? 'Listo' : 'Elegir productos'}
          </button>
          <span className="text-sm text-gray-700 dark:text-white">{cantidadElegidos} de {disponibles.length} productos seleccionados</span>
        </div>
        <label className="relative block">
          <span className="sr-only">Buscar producto pesable</span>
          <Search aria-hidden="true" className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input autoFocus value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Buscar queso, jamón…"
            className="w-full rounded-lg border border-gray-300 py-2 pl-9 pr-3 text-sm focus:border-amber-500 focus:outline-none dark:border-gray-600 dark:bg-gray-700" />
        </label>
        {productos.isFetching ? <Cargando /> : productos.isError ? (
          <div role="alert" className="text-center text-sm text-red-600">
            <p>No se pudieron cargar los productos.</p>
            <button type="button" onClick={() => void productos.refetch()} className="mt-2 underline">Reintentar</button>
          </div>
        ) : (
          <>
            {eligiendo && (
              <div id="seleccion-productos-peso" className="space-y-3 rounded-xl border border-purple-300 bg-purple-50 p-3 dark:border-purple-700 dark:bg-gray-900/40">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-medium text-gray-900 dark:text-white">Marca los productos que quieres ver.</p>
                  <div className="flex gap-3 text-sm font-semibold text-purple-700 dark:text-white">
                    <button type="button" onClick={seleccionarTodos} className="underline">Seleccionar todos</button>
                    <button type="button" onClick={desmarcarTodos} className="underline">Desmarcar todos</button>
                  </div>
                </div>
                <div className="grid max-h-60 gap-2 overflow-y-auto sm:grid-cols-2 lg:grid-cols-3">
                  {coincidencias.map((p) => (
                    <label key={p.id} className="flex cursor-pointer items-center gap-2 rounded-lg border border-gray-200 bg-white p-3 text-sm text-gray-900 dark:border-gray-600 dark:bg-gray-700 dark:text-white">
                      <Checkbox checked={elegidos.has(p.id)} onChange={() => alternar(p.id, idsDisponibles)} aria-label={`Mostrar ${p.nombre} en la calculadora`} />
                      <span>{p.nombre}</span>
                    </label>
                  ))}
                </div>
                {coincidencias.length === 0 && <p className="text-sm text-gray-700 dark:text-white">No hay productos por peso que coincidan con la búsqueda.</p>}
                <p className="text-xs text-gray-700 dark:text-white">La selección se guarda automáticamente en este navegador.</p>
              </div>
            )}
            {visibles.length === 0 ? (
              <div className="py-8 text-center text-sm text-gray-700 dark:text-white">
                <Scale className="mx-auto mb-2 h-8 w-8" aria-hidden="true" />
                {disponibles.length === 0 ? 'No hay productos pesables activos. Configura su unidad en KG y su precio por kilo en Productos.'
                  : cantidadElegidos === 0 ? 'No has seleccionado productos. Pulsa «Elegir productos» y marca los que quieres ver.'
                  : 'No hay productos seleccionados que coincidan con la búsqueda.'}
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {visibles.map((p) => <TarjetaCalculadora key={p.id} producto={p} tasa={tasa} />)}
              </div>
            )}
          </>
        )}
      </div>
    </Modal>
  );
}

const CAMPOS: { campo: CampoPeso; etiqueta: string; decimales: number }[] = [
  { campo: 'bs', etiqueta: 'Monto Bs', decimales: 2 },
  { campo: 'usd', etiqueta: 'Monto $', decimales: 2 },
  { campo: 'kg', etiqueta: 'Peso kg', decimales: 3 },
];

function TarjetaCalculadora({ producto, tasa }: { producto: Producto; tasa: number }) {
  const [entrada, setEntrada] = useState<{ campo: CampoPeso; texto: string }>({ campo: 'bs', texto: '' });
  const precioKg = precioPorKg(producto);
  const valido = precioKg !== null && Number.isFinite(tasa) && tasa > 0;
  const resultado = entrada.texto !== '' && precioKg !== null
    ? calcularPeso(entrada.campo, Number(entrada.texto.replace(',', '.')), precioKg, tasa) : null;

  return (
    <article className="overflow-hidden rounded-xl border border-gray-200 dark:border-gray-700">
      <h4 className="bg-purple-700 px-3 py-3 text-center text-lg font-bold text-white">{producto.nombre}</h4>
      <div className="space-y-3 p-3">
        {precioKg === null ? (
          <p className="text-sm text-amber-600">Configura una unidad KG o GR y un precio mayor que cero en Productos.</p>
        ) : (
          <p className="text-center text-xs text-gray-900 dark:text-white">Por kg: <span className="font-semibold">{formatearUSD(precioKg)} · {formatearBs(precioKg * tasa)}</span></p>
        )}
        <div className="grid grid-cols-3 gap-2">
          {CAMPOS.map(({ campo, etiqueta, decimales }) => (
            <label key={campo} className="min-w-0 text-xs font-medium text-gray-900 dark:text-white">
              {etiqueta}
              <input type="text" inputMode="decimal" aria-label={`${etiqueta} de ${producto.nombre}`} disabled={!valido}
                value={entrada.campo === campo ? entrada.texto : resultado ? resultado[campo].toFixed(decimales).replace('.', ',') : ''}
                onFocus={(e) => e.currentTarget.select()}
                onChange={(e) => {
                  const texto = e.target.value;
                  if (/^\d*([.,]\d*)?$/.test(texto)) setEntrada({ campo, texto });
                }}
                placeholder="0" className="mt-1 w-full rounded-lg border border-gray-300 px-2 py-2 text-right text-sm tabular-nums text-gray-900 placeholder:text-gray-600 focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-200 disabled:opacity-50 dark:border-gray-600 dark:bg-gray-700 dark:text-white dark:placeholder:text-white" />
            </label>
          ))}
        </div>
        <p aria-live="polite" className="min-h-5 text-center text-sm font-semibold text-purple-700 dark:text-purple-300">
          {resultado ? `≈ ${formatearNumero(resultado.kg, 3)} kg (${formatearNumero(resultado.kg * 1000, 0)} g)` : 'Ingresa un monto o peso'}
        </p>
      </div>
    </article>
  );
}
