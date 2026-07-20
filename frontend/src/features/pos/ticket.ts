/**
 * Impresion del ticket de venta en formato de 80mm.
 * Abre una ventana con el recibo y lanza el dialogo de impresion del navegador,
 * que sirve tanto para impresora termica como para "Guardar como PDF".
 */
import { formatearUSD, formatearBs, formatearFechaHora, formatearNumero } from '@/lib/formato';

export interface ItemTicket {
  nombre: string;
  cantidad: number;
  precioUnitario: number;
  total: number;
}

export interface DatosTicket {
  negocio: { nombre: string; direccion?: string | null; telefono?: string | null; rif?: string | null; pie?: string | null };
  numero: string;
  fecha: string | Date;
  cajero: string;
  cliente: string;
  items: ItemTicket[];
  totalUsd: number;
  totalBs: number;
  tasa: number;
  pagos: { metodo: string; moneda: string; monto: number }[];
  vueltoUsd?: number;
}

function esc(s: string): string {
  return s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c] ?? c));
}

export function imprimirTicket(d: DatosTicket): void {
  const filas = d.items
    .map(
      (i) => `
      <tr>
        <td colspan="2">${esc(i.nombre)}</td>
      </tr>
      <tr class="det">
        <td>${formatearNumero(i.cantidad, i.cantidad % 1 === 0 ? 0 : 3)} x ${formatearUSD(i.precioUnitario)}</td>
        <td class="r">${formatearUSD(i.total)}</td>
      </tr>`,
    )
    .join('');

  const pagos = d.pagos
    .map((p) => `<tr class="det"><td>${esc(p.metodo)}</td><td class="r">${p.moneda === 'USD' ? formatearUSD(p.monto) : formatearBs(p.monto)}</td></tr>`)
    .join('');

  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Ticket ${esc(d.numero)}</title>
  <style>
    * { margin:0; padding:0; box-sizing:border-box; }
    body { width:80mm; font-family:'Courier New',monospace; font-size:11px; color:#000; padding:4mm; }
    .c { text-align:center; } .r { text-align:right; } .b { font-weight:bold; }
    .lg { font-size:14px; } .sep { border-top:1px dashed #000; margin:4px 0; }
    table { width:100%; border-collapse:collapse; }
    td { vertical-align:top; padding:1px 0; }
    .det td { color:#333; }
    .tot td { font-size:13px; font-weight:bold; padding-top:2px; }
    @media print { body { width:auto; } }
  </style></head><body>
    <div class="c b lg">${esc(d.negocio.nombre)}</div>
    ${d.negocio.direccion ? `<div class="c">${esc(d.negocio.direccion)}</div>` : ''}
    ${d.negocio.telefono ? `<div class="c">Tel: ${esc(d.negocio.telefono)}</div>` : ''}
    ${d.negocio.rif ? `<div class="c">RIF: ${esc(d.negocio.rif)}</div>` : ''}
    <div class="sep"></div>
    <div>Venta: <span class="b">${esc(d.numero)}</span></div>
    <div>Fecha: ${formatearFechaHora(d.fecha)}</div>
    <div>Cajero: ${esc(d.cajero)}</div>
    <div>Cliente: ${esc(d.cliente)}</div>
    <div class="sep"></div>
    <table>${filas}</table>
    <div class="sep"></div>
    <table>
      <tr class="tot"><td>TOTAL</td><td class="r">${formatearUSD(d.totalUsd)}</td></tr>
      <tr class="b"><td>TOTAL Bs</td><td class="r">${formatearBs(d.totalBs)}</td></tr>
      <tr class="det"><td>Tasa</td><td class="r">Bs ${formatearNumero(d.tasa, 2)} / $</td></tr>
    </table>
    <div class="sep"></div>
    <table>${pagos}
      ${d.vueltoUsd && d.vueltoUsd > 0 ? `<tr class="det"><td>Vuelto</td><td class="r">${formatearUSD(d.vueltoUsd)}</td></tr>` : ''}
    </table>
    <div class="sep"></div>
    <div class="c">${d.negocio.pie ? esc(d.negocio.pie) : 'Gracias por su compra'}</div>
    <br/>
    <script>window.onload=function(){window.print();setTimeout(function(){window.close();},300);};</script>
  </body></html>`;

  const win = window.open('', '_blank', 'width=380,height=600');
  if (!win) return;
  win.document.write(html);
  win.document.close();
}
