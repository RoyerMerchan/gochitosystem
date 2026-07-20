/** Reportes: menú de reportes con tabla de resultados en USD y Bs. */
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { BarChart3, Download, FileText } from 'lucide-react';
import * as XLSX from 'xlsx';
import { formatearFechaHora } from '@/lib/formato';
import { obtener } from '@/lib/axios';
import { Card, Cargando, EmptyState } from '@/components/ui/Feedback';
import { FiltroPeriodo } from '@/components/ui/FiltroPeriodo';
import { formatearUSD, formatearBs, formatearCantidad } from '@/lib/formato';

interface DefReporte {
  clave: string;
  titulo: string;
  url: string;
  columnas: { campo: string; etiqueta: string; tipo?: 'usd' | 'bs' | 'cant' | 'texto' }[];
}

const REPORTES: { grupo: string; items: DefReporte[] }[] = [
  {
    grupo: 'Ventas',
    items: [
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
      { clave: 'metodospago', titulo: 'Métodos de pago', url: '/reportes/ventas/metodos-pago', columnas: [
        { campo: 'metodo', etiqueta: 'Método' }, { campo: 'moneda', etiqueta: 'Moneda' },
        { campo: 'transacciones', etiqueta: 'Transacciones', tipo: 'cant' },
        { campo: 'total_moneda', etiqueta: 'Total en su moneda', tipo: 'cant' },
        { campo: 'total_usd', etiqueta: 'Total USD', tipo: 'usd' }] },
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

  const formatear = (valor: unknown, tipo?: string) => {
    if (tipo === 'usd') return formatearUSD(valor);
    if (tipo === 'bs') return formatearBs(valor);
    if (tipo === 'cant') return formatearCantidad(valor);
    return String(valor ?? '—');
  };

  const exportarExcel = () => {
    const filas = (datos.data ?? []).map((f) => {
      const obj: Record<string, unknown> = {};
      sel.columnas.forEach((c) => { obj[c.etiqueta] = f[c.campo]; });
      return obj;
    });
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
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>${sel.titulo}</title>
    <style>
      body{font-family:Arial,sans-serif;font-size:12px;color:#111;padding:24px;}
      h1{font-size:18px;margin:0;} .sub{color:#666;font-size:11px;margin-bottom:16px;}
      table{width:100%;border-collapse:collapse;} th{background:#f3f4f6;padding:6px;border-bottom:2px solid #ddd;}
      td{padding:6px;border-bottom:1px solid #eee;} tr:nth-child(even){background:#fafafa;}
    </style></head><body>
      <h1>Mini Market Los Gochitos</h1>
      <div class="sub">${sel.titulo} · Generado ${formatearFechaHora(new Date())}</div>
      <table><thead><tr>${th}</tr></thead><tbody>${trs}</tbody></table>
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
          <h1 className="text-xl font-bold">{sel.titulo}</h1>
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
              </table>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
