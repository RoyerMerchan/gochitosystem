/** Reportes: menú de reportes con tabla de resultados en USD y Bs. */
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { BarChart3, Download, FileText } from 'lucide-react';
// xlsx pesa ~280 KB y solo hace falta al pulsar "Excel": se carga en ese momento
// (import dinamico) para no meterlo en el bundle de la pantalla.
import { obtener } from '@/lib/axios';
import { Card, Cargando, EmptyState } from '@/components/ui/Feedback';
import { FiltroPeriodo } from '@/components/ui/FiltroPeriodo';
import { formatearUSD, formatearBs, formatearCantidad, formatearFecha, formatearFechaHora, aNumero } from '@/lib/formato';

/**
 * 'bs'     = bolivares VALORADOS (un monto en USD llevado a Bs con la tasa del dia).
 *            Cada dia tiene su tasa, asi que sumarlos entre dias no da una cifra real.
 * 'bsreal' = bolivares FISICOS, los que de verdad entraron a la gaveta. Son billetes:
 *            se pueden sumar entre dias como cualquier otro numero.
 */
type TipoCol = 'usd' | 'bs' | 'bsreal' | 'cant' | 'texto' | 'fecha' | 'dia';

interface DefReporte {
  clave: string;
  titulo: string;
  url: string;
  /** Aclara cómo leer el reporte cuando la base de cálculo no es obvia. */
  nota?: string;
  columnas: { campo: string; etiqueta: string; tipo?: TipoCol }[];
}

/** Columnas que se suman en la fila de totales. */
const SUMABLES: TipoCol[] = ['usd', 'bs', 'bsreal', 'cant'];

const REPORTES: { grupo: string; items: DefReporte[] }[] = [
  {
    grupo: 'Ventas',
    items: [
      { clave: 'pordia', titulo: 'Cierre por día', url: '/reportes/ventas/por-dia',
        nota: 'Base cobrada: lo que salió a crédito NO suma; entra el día que el cliente abona, y ahí aparece en Abonos. «Entró en $» y «Entró en Bs» son el dinero real de cada gaveta (ventas + fiados cobrados, ya descontado el vuelto); no se netean entre sí. «COBRADO USD» es lo mismo pero todo valorado en dólares.',
        columnas: [
          { campo: 'dia', etiqueta: 'Día', tipo: 'dia' }, { campo: 'ventas', etiqueta: 'N.º ventas', tipo: 'cant' },
          { campo: 'contado_usd', etiqueta: 'Contado USD', tipo: 'usd' },
          { campo: 'abonos_usd', etiqueta: 'Abonos USD', tipo: 'usd' },
          { campo: 'cobrado_usd', etiqueta: 'COBRADO USD', tipo: 'usd' },
          { campo: 'entro_usd', etiqueta: 'Entró en $', tipo: 'usd' },
          { campo: 'entro_bs', etiqueta: 'Entró en Bs', tipo: 'bsreal' },
          { campo: 'credito_usd', etiqueta: 'Salió a crédito', tipo: 'usd' },
          { campo: 'utilidad_usd', etiqueta: 'Utilidad USD', tipo: 'usd' }] },
      { clave: 'detalle', titulo: 'Detalle de ventas', url: '/reportes/ventas/detalle',
        nota: 'Estado es el de COBRO: un fiado ya pagado dice PAGADA. Recuperado es cuánto de esa venta se ha cobrado hasta hoy (contado + abonos), aunque el abono haya entrado otro día; el día en que entró la plata está en «Abonos cobrados».',
        columnas: [
          { campo: 'fecha', etiqueta: 'Fecha', tipo: 'fecha' }, { campo: 'numero', etiqueta: 'N.º' },
          { campo: 'tipo', etiqueta: 'Tipo' },
          { campo: 'estado_pago', etiqueta: 'Estado' },
          { campo: 'cliente', etiqueta: 'Cliente' }, { campo: 'cajero', etiqueta: 'Cajero' },
          { campo: 'metodo', etiqueta: 'Método de pago' },
          { campo: 'total_usd', etiqueta: 'Total USD', tipo: 'usd' },
          { campo: 'contado_usd', etiqueta: 'Contado USD', tipo: 'usd' },
          { campo: 'credito_usd', etiqueta: 'Crédito USD', tipo: 'usd' },
          { campo: 'cobrado_usd', etiqueta: 'Recuperado USD', tipo: 'usd' },
          { campo: 'saldo_usd', etiqueta: 'Saldo pendiente', tipo: 'usd' },
          { campo: 'utilidad_usd', etiqueta: 'Utilidad USD', tipo: 'usd' }] },
      { clave: 'abonos', titulo: 'Abonos cobrados', url: '/reportes/ventas/abonos',
        nota: 'Fiados cobrados en el período: es plata del día en que se recibió. «Recibió» es el billete que puso el cliente y «Vuelto» lo que se le devolvió, así que lo que quedó en cada gaveta es la resta de los dos. «Abonado a la deuda» es lo que se le descontó al fiado, siempre en USD. Ejemplo: debe $1,98 y entrega $2 → Recibió $2,00, Vuelto $0,02, Abonado $1,98. El vuelto puede salir en la otra moneda si no había sencillo.',
        columnas: [
          { campo: 'fecha', etiqueta: 'Fecha', tipo: 'fecha' }, { campo: 'numero', etiqueta: 'N.º' },
          { campo: 'cliente', etiqueta: 'Cliente' }, { campo: 'metodo', etiqueta: 'Método' },
          { campo: 'recibido_usd', etiqueta: 'Recibió $', tipo: 'usd' },
          { campo: 'recibido_bs', etiqueta: 'Recibió Bs', tipo: 'bsreal' },
          { campo: 'vuelto_usd', etiqueta: 'Vuelto $', tipo: 'usd' },
          { campo: 'vuelto_bs', etiqueta: 'Vuelto Bs', tipo: 'bsreal' },
          { campo: 'abonado_usd', etiqueta: 'Abonado a la deuda USD', tipo: 'usd' },
          { campo: 'facturas_saldadas', etiqueta: 'Saldó', tipo: 'cant' },
          { campo: 'cajero', etiqueta: 'Cajero' }] },
      { clave: 'mas', titulo: 'Más vendidos', url: '/reportes/ventas/mas-vendidos', columnas: [
        { campo: 'producto', etiqueta: 'Producto' }, { campo: 'cantidad', etiqueta: 'Cantidad', tipo: 'cant' },
        { campo: 'venta_usd', etiqueta: 'Venta USD', tipo: 'usd' }, { campo: 'utilidad_usd', etiqueta: 'Utilidad USD', tipo: 'usd' }] },
      { clave: 'menos', titulo: 'Menos vendidos', url: '/reportes/ventas/menos-vendidos', columnas: [
        { campo: 'producto', etiqueta: 'Producto' }, { campo: 'cantidad', etiqueta: 'Cantidad', tipo: 'cant' },
        { campo: 'venta_usd', etiqueta: 'Venta USD', tipo: 'usd' }] },
      { clave: 'sinmov', titulo: 'Sin movimiento', url: '/reportes/ventas/sin-movimiento', columnas: [
        { campo: 'sku', etiqueta: 'SKU' }, { campo: 'nombre', etiqueta: 'Producto' }, { campo: 'stock', etiqueta: 'Stock', tipo: 'cant' }] },
      { clave: 'stockbajo', titulo: 'Stock bajo', url: '/reportes/ventas/stock-bajo', columnas: [
        { campo: 'sku', etiqueta: 'SKU' }, { campo: 'nombre', etiqueta: 'Producto' },
        { campo: 'cantidad', etiqueta: 'Stock', tipo: 'cant' }, { campo: 'stock_minimo', etiqueta: 'Mínimo', tipo: 'cant' }] },
      { clave: 'metodospago', titulo: 'Métodos de pago', url: '/reportes/ventas/metodos-pago',
        nota: 'Lo que PASÓ por cada método, en bruto: el billete que puso el cliente, sin descontar el vuelto. Origen separa las ventas del día de los fiados cobrados. Lo que QUEDÓ en la gaveta, ya con el vuelto descontado, está en «Cierre por día» (Entró en $ / Entró en Bs); el vuelto de cada fiado, en «Abonos cobrados».',
        columnas: [
          { campo: 'metodo', etiqueta: 'Método' }, { campo: 'moneda', etiqueta: 'Moneda' },
          { campo: 'origen', etiqueta: 'Origen' },
          { campo: 'transacciones', etiqueta: 'Transacciones', tipo: 'cant' },
          { campo: 'total_moneda', etiqueta: 'Recibido en su moneda', tipo: 'cant' },
          { campo: 'total_usd', etiqueta: 'Recibido USD', tipo: 'usd' }] },
    ],
  },
  {
    grupo: 'Compras',
    items: [
      { clave: 'compradia', titulo: 'Compras por día', url: '/reportes/compras/por-dia',
        nota: 'Lo que salió en mercancía cada día, por fecha de recepción. No incluye entradas anuladas.',
        columnas: [
          { campo: 'dia', etiqueta: 'Día', tipo: 'dia' }, { campo: 'entradas', etiqueta: 'Entradas', tipo: 'cant' },
          { campo: 'total_usd', etiqueta: 'Compras USD', tipo: 'usd' },
          { campo: 'total_bs', etiqueta: 'Compras Bs', tipo: 'bs' }] },
      { clave: 'compradet', titulo: 'Detalle de entradas', url: '/reportes/compras/detalle',
        nota: 'Una fila por entrada de mercancía, con su proveedor y su factura.',
        columnas: [
          { campo: 'fecha', etiqueta: 'Fecha', tipo: 'fecha' }, { campo: 'numero', etiqueta: 'N.º' },
          { campo: 'proveedor', etiqueta: 'Proveedor' }, { campo: 'factura', etiqueta: 'Factura prov.' },
          { campo: 'condicion', etiqueta: 'Pago' },
          { campo: 'total_usd', etiqueta: 'Total USD', tipo: 'usd' },
          { campo: 'total_bs', etiqueta: 'Total Bs', tipo: 'bs' },
          { campo: 'por_pagar_usd', etiqueta: 'Por pagar USD', tipo: 'usd' },
          { campo: 'registro', etiqueta: 'Registró' }] },
      // Sin columna de Bs: acumular varios días mezcla tasas distintas y el total
      // no significaría nada. El USD sí es comparable entre fechas.
      { clave: 'compraprov', titulo: 'Compras por proveedor', url: '/reportes/compras/por-proveedor', columnas: [
        { campo: 'proveedor', etiqueta: 'Proveedor' }, { campo: 'entradas', etiqueta: 'Entradas', tipo: 'cant' },
        { campo: 'total_usd', etiqueta: 'Total USD', tipo: 'usd' },
        { campo: 'por_pagar_usd', etiqueta: 'Por pagar USD', tipo: 'usd' },
        { campo: 'ultima_compra', etiqueta: 'Última compra', tipo: 'dia' }] },
      { clave: 'compraprod', titulo: 'Productos comprados', url: '/reportes/compras/productos', columnas: [
        { campo: 'producto', etiqueta: 'Producto' }, { campo: 'proveedor', etiqueta: 'Proveedor' },
        { campo: 'cantidad', etiqueta: 'Cantidad', tipo: 'cant' },
        { campo: 'costo_usd', etiqueta: 'Costo USD', tipo: 'usd' }] },
      { clave: 'porpagar', titulo: 'Cuentas por pagar', url: '/reportes/compras/por-pagar',
        nota: 'Saldo vivo con cada proveedor. No depende del período: es lo que debes ahora.',
        columnas: [
          { campo: 'proveedor', etiqueta: 'Proveedor' }, { campo: 'documentos', etiqueta: 'Entradas', tipo: 'cant' },
          { campo: 'saldo_usd', etiqueta: 'Saldo USD', tipo: 'usd' },
          { campo: 'mas_antigua', etiqueta: 'Más antigua', tipo: 'dia' }] },
    ],
  },
  {
    grupo: 'Clientes',
    items: [
      { clave: 'compradores', titulo: 'Más compradores', url: '/reportes/clientes/mas-compradores', columnas: [
        { campo: 'cliente', etiqueta: 'Cliente' }, { campo: 'compras', etiqueta: 'Compras', tipo: 'cant' },
        { campo: 'total_usd', etiqueta: 'Total USD', tipo: 'usd' }, { campo: 'total_bs', etiqueta: 'Total Bs', tipo: 'bs' }] },
      { clave: 'gasto', titulo: 'Mayor gasto', url: '/reportes/clientes/mayor-gasto', columnas: [
        { campo: 'cliente', etiqueta: 'Cliente' }, { campo: 'total_usd', etiqueta: 'Total USD', tipo: 'usd' },
        { campo: 'total_bs', etiqueta: 'Total Bs', tipo: 'bs' }] },
      { clave: 'deuda', titulo: 'Con deuda', url: '/reportes/clientes/con-deuda', columnas: [
        { campo: 'nombre', etiqueta: 'Cliente' }, { campo: 'documento', etiqueta: 'Documento' },
        { campo: 'documentos', etiqueta: 'Facturas', tipo: 'cant' },
        { campo: 'saldo_usd', etiqueta: 'Saldo USD', tipo: 'usd' }] },
    ],
  },
];

export default function ReportesPage() {
  const [sel, setSel] = useState<DefReporte>(REPORTES[0]!.items[0]!);
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');

  const urlConRango = () => {
    const p = new URLSearchParams();
    if (desde) p.set('desde', desde);
    if (hasta) p.set('hasta', hasta);
    const qs = p.toString();
    return qs ? `${sel.url}?${qs}` : sel.url;
  };

  const datos = useQuery({
    queryKey: ['reporte', sel.clave, desde, hasta],
    queryFn: () => obtener<Record<string, unknown>[]>(urlConRango()),
  });

  const formatear = (valor: unknown, tipo?: TipoCol) => {
    if (tipo === 'usd') return formatearUSD(valor);
    if (tipo === 'bs' || tipo === 'bsreal') return formatearBs(valor);
    if (tipo === 'cant') return formatearCantidad(valor);
    if (tipo === 'fecha') return formatearFechaHora(valor as string);
    if (tipo === 'dia') return formatearFecha(valor as string);
    return String(valor ?? '—');
  };

  /**
   * Totales del pie. Es lo que se usa para cuadrar el día: sin esto habría que
   * sumar a mano las filas o exportar a Excel solo para ver el total.
   */
  /**
   * Días distintos que abarca el resultado, leídos de la columna de fecha.
   * Cada día tiene su propia tasa, así que solo se pueden sumar bolívares
   * cuando el reporte cae dentro de UN día.
   */
  const diasDistintos = (() => {
    const filas = datos.data ?? [];
    const col = sel.columnas.find((c) => c.tipo === 'dia' || c.tipo === 'fecha');
    if (!col || filas.length === 0) return 0;
    const dias = new Set(filas.map((f) => String(f[col.campo] ?? '').slice(0, 10)));
    return dias.size;
  })();
  const puedeSumarBs = diasDistintos === 1;

  /**
   * Totales del pie. Es lo que se usa para cuadrar el día: sin esto habría que
   * sumar a mano las filas o exportar a Excel solo para ver el total.
   */
  const totales = (() => {
    const filas = datos.data ?? [];
    if (filas.length === 0) return null;
    const acc: Record<string, number> = {};
    for (const c of sel.columnas) {
      if (!c.tipo || !SUMABLES.includes(c.tipo)) continue;
      // Bs VALORADOS de varios días mezclan tasas distintas: no se suman, se deja
      // vacío. Los 'bsreal' son billetes y sí se suman siempre.
      if (c.tipo === 'bs' && !puedeSumarBs) continue;
      acc[c.campo] = filas.reduce((a, f) => a + aNumero(f[c.campo] as string), 0);
    }
    return acc;
  })();

  const exportarExcel = async () => {
    const XLSX = await import('xlsx');
    const filas = (datos.data ?? []).map((f) => {
      const obj: Record<string, unknown> = {};
      // Números crudos, no formateados: en Excel deben poder sumarse.
      sel.columnas.forEach((c) => {
        obj[c.etiqueta] = c.tipo && SUMABLES.includes(c.tipo) ? aNumero(f[c.campo] as string) : f[c.campo];
      });
      return obj;
    });
    if (totales) {
      const fila: Record<string, unknown> = {};
      sel.columnas.forEach((c, i) => {
        fila[c.etiqueta] = c.campo in totales ? totales[c.campo]
          : i === 0 ? 'TOTAL'
          : c.tipo === 'bs' ? 'varias tasas' : '';
      });
      filas.push(fila);
    }
    const ws = XLSX.utils.json_to_sheet(filas);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, sel.titulo.slice(0, 31));
    XLSX.writeFile(wb, `${sel.clave}-${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  const exportarPDF = () => {
    const th = sel.columnas.map((c) => `<th style="text-align:${c.tipo && c.tipo !== 'texto' ? 'right' : 'left'}">${c.etiqueta}</th>`).join('');
    const trs = (datos.data ?? []).map((f) =>
      `<tr>${sel.columnas.map((c) => `<td style="text-align:${c.tipo && c.tipo !== 'texto' ? 'right' : 'left'}">${formatear(f[c.campo], c.tipo)}</td>`).join('')}</tr>`,
    ).join('');
    const tfoot = totales
      ? `<tfoot><tr>${sel.columnas.map((c, i) => `<td style="text-align:${c.tipo && c.tipo !== 'texto' ? 'right' : 'left'};font-weight:bold;border-top:2px solid #999">${
          c.campo in totales ? formatear(totales[c.campo], c.tipo)
            : i === 0 ? 'TOTAL'
            : c.tipo === 'bs' ? 'varias tasas' : ''
        }</td>`).join('')}</tr></tfoot>`
      : '';
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>${sel.titulo}</title>
    <style>
      body{font-family:Arial,sans-serif;font-size:12px;color:#111;padding:24px;}
      h1{font-size:18px;margin:0;} .sub{color:#666;font-size:11px;margin-bottom:16px;}
      table{width:100%;border-collapse:collapse;} th{background:#f3f4f6;padding:6px;border-bottom:2px solid #ddd;}
      td{padding:6px;border-bottom:1px solid #eee;} tr:nth-child(even){background:#fafafa;}
    </style></head><body>
      <h1>Mini Market Los Gochitos</h1>
      <div class="sub">${sel.titulo} · Generado ${formatearFechaHora(new Date())}</div>
      <table><thead><tr>${th}</tr></thead><tbody>${trs}</tbody>${tfoot}</table>
      <script>window.onload=function(){window.print();};</script>
    </body></html>`;
    const win = window.open('', '_blank', 'width=800,height=600');
    if (win) { win.document.write(html); win.document.close(); }
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[240px_1fr]">
      {/* Menú */}
      <div className="space-y-4">
        {REPORTES.map((g) => (
          <div key={g.grupo}>
            <p className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-gray-400">{g.grupo}</p>
            <div className="space-y-0.5">
              {g.items.map((r) => (
                <button key={r.clave} onClick={() => setSel(r)}
                  className={`block w-full rounded-lg px-3 py-2 text-left text-sm ${sel.clave === r.clave ? 'bg-amber-50 font-medium text-amber-700 dark:bg-amber-900/30' : 'hover:bg-gray-100 dark:hover:bg-gray-700'}`}>
                  {r.titulo}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Resultado */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold">{sel.titulo}</h1>
            {sel.nota && <p className="mt-0.5 max-w-xl text-xs text-gray-500">{sel.nota}</p>}
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <FiltroPeriodo desde={desde} hasta={hasta} onCambiar={(d, h) => { setDesde(d); setHasta(h); }} />
            <div>
              <label className="mb-0.5 block text-[10px] uppercase text-gray-400">Desde</label>
              <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm dark:border-gray-600 dark:bg-gray-700" />
            </div>
            <div>
              <label className="mb-0.5 block text-[10px] uppercase text-gray-400">Hasta</label>
              <input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm dark:border-gray-600 dark:bg-gray-700" />
            </div>
            {(desde || hasta) && (
              <button onClick={() => { setDesde(''); setHasta(''); }} className="rounded-lg border border-gray-300 px-2 py-1.5 text-xs text-gray-500 hover:bg-gray-100 dark:border-gray-600 dark:hover:bg-gray-700">Limpiar</button>
            )}
            <button onClick={exportarPDF} disabled={!datos.data?.length}
              className="flex items-center gap-2 rounded-lg bg-red-600 px-3 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-40">
              <FileText className="h-4 w-4" /> PDF
            </button>
            <button onClick={exportarExcel} disabled={!datos.data?.length}
              className="flex items-center gap-2 rounded-lg bg-green-600 px-3 py-2 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-40">
              <Download className="h-4 w-4" /> Excel
            </button>
          </div>
        </div>
        <Card padding={false}>
          {datos.isLoading ? <Cargando /> : (datos.data ?? []).length === 0 ? (
            <EmptyState titulo="Sin datos" descripcion="No hay resultados para este reporte." icono={<BarChart3 className="h-12 w-12" />} />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-xs uppercase text-gray-500 dark:bg-gray-700/50">
                  <tr>{sel.columnas.map((c) => <th key={c.campo} className={`p-3 ${c.tipo && c.tipo !== 'texto' ? 'text-right' : 'text-left'}`}>{c.etiqueta}</th>)}</tr>
                </thead>
                <tbody>
                  {datos.data!.map((f, i) => (
                    <tr key={i} className="border-t border-gray-100 dark:border-gray-700">
                      {sel.columnas.map((c) => (
                        <td key={c.campo} className={`p-3 ${c.tipo && c.tipo !== 'texto' ? 'text-right tabular-nums' : ''} ${c.tipo === 'usd' && c.campo.includes('utilidad') ? 'text-green-600' : ''}`}>
                          {formatear(f[c.campo], c.tipo)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
                {totales && (
                  <tfoot className="border-t-2 border-gray-300 bg-gray-50 font-bold dark:border-gray-600 dark:bg-gray-700/50">
                    <tr>
                      {sel.columnas.map((c, i) => (
                        <td key={c.campo} className={`p-3 ${c.tipo && c.tipo !== 'texto' ? 'text-right tabular-nums' : ''}`}>
                          {c.campo in totales
                            ? formatear(totales[c.campo], c.tipo)
                            : i === 0 ? `TOTAL · ${datos.data!.length} fila(s)`
                            : c.tipo === 'bs' ? (
                              <span className="text-xs font-normal text-gray-400"
                                title="Cada día tiene su tasa: sumar bolívares de varios días no da una cifra real.">
                                varias tasas
                              </span>
                            ) : ''}
                        </td>
                      ))}
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
