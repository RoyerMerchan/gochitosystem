/**
 * Estado de cuenta imprimible para entregarle al cliente lo que debe.
 *
 * Mismo mecanismo que el ticket del POS: se abre una ventana con el documento y
 * se lanza el dialogo de impresion del navegador, que trae "Guardar como PDF".
 * Asi no hace falta ninguna libreria de PDF ni que el backend genere archivos.
 *
 * Va en tamano carta/A4 (no en 80mm como el ticket): esto se manda por WhatsApp
 * o se imprime en hoja, no en la termica.
 */
import {
  formatearUSD, formatearBs, formatearFecha, formatearFechaHora, formatearNumero,
  formatearCantidad, saldoUsdABs, aNumero,
} from '@/lib/formato';
import type { DatosNegocio } from '@/config/negocio';

export interface DeudaImpresa {
  id: number;
  documento: string | null;
  fecha_emision: string;
  fecha_vencimiento: string;
  dias_mora: number;
  monto_original_usd: string;
  saldo_usd: string;
}

/** Un producto de la compra que originó una deuda. */
export interface RenglonImpreso {
  credito_id: number;
  descripcion: string;
  cantidad: string;
  precio_venta_unitario: string;
  total_linea: string;
}

export interface AbonoImpreso {
  numero: string;
  fecha: string;
  moneda: string;
  monto_moneda: string;
  monto_usd: string;
}

export interface DatosEstadoCuenta {
  negocio: DatosNegocio;
  cliente: { nombre: string; documento?: string | null };
  /** Momento en que se emite el documento. */
  fecha: string | Date;
  /** Tasa de HOY: la deuda vive en USD y en Bs vale lo que valga hoy. */
  tasa: number;
  deudas: DeudaImpresa[];
  /** Productos de cada compra, para que el cliente vea qué se llevó. */
  renglones?: RenglonImpreso[];
  totalUsd: number;
  /** Ultimos pagos recibidos, para que el cliente vea que se los abonaron. */
  abonos?: AbonoImpreso[];
  atendidoPor?: string | null;
}

function esc(s: string): string {
  return s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c] ?? c));
}

/**
 * Abre la ventana ANTES de ir a buscar los datos.
 *
 * El navegador solo deja abrir ventanas como reaccion directa a un clic: si se
 * abre despues de un `await`, el bloqueador de emergentes la mata. Por eso el
 * boton la abre de una con un "generando…" y el documento se escribe encima
 * cuando llegan los datos.
 */
export function abrirVentanaImpresion(): Window | null {
  const win = window.open('', '_blank', 'width=900,height=700');
  if (win) {
    win.document.write(
      '<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Estado de cuenta</title></head>'
      + '<body style="font-family:Segoe UI,Arial,sans-serif;padding:24px;color:#555">Generando el estado de cuenta…</body></html>',
    );
  }
  return win;
}

export function imprimirEstadoCuenta(d: DatosEstadoCuenta, ventana?: Window | null): void {
  const hayTasa = d.tasa > 0;
  const bs = (usd: unknown) => (hayTasa ? formatearBs(saldoUsdABs(usd, d.tasa)) : '—');

  // Productos agrupados por la deuda a la que pertenecen.
  const porCredito = new Map<number, RenglonImpreso[]>();
  for (const r of d.renglones ?? []) {
    const lista = porCredito.get(r.credito_id);
    if (lista) lista.push(r);
    else porCredito.set(r.credito_id, [r]);
  }

  const filas = d.deudas
    .map((x) => {
      const mora = x.dias_mora > 0;
      const productos = porCredito.get(x.id) ?? [];
      // El detalle va como sub-fila de la compra: se lee "esta factura trae esto".
      const detalle = productos.length === 0 ? '' : `
      <tr class="det">
        <td colspan="6">
          <table class="items">
            ${productos.map((p) => `
            <tr>
              <td class="cant">${formatearCantidad(p.cantidad)} ×</td>
              <td>${esc(p.descripcion)}</td>
              <td class="r gris">${formatearUSD(p.precio_venta_unitario)} c/u</td>
              <td class="r">${formatearUSD(p.total_linea)}</td>
            </tr>`).join('')}
          </table>
        </td>
      </tr>`;

      return `
      <tr class="doc ${mora ? 'mora' : ''}">
        <td>${esc(x.documento ?? 'Crédito')}</td>
        <td>${formatearFecha(x.fecha_emision)}</td>
        <td>${formatearFecha(x.fecha_vencimiento)}${mora ? `<span class="chip">${x.dias_mora} d. de mora</span>` : ''}</td>
        <td class="r">${formatearUSD(x.monto_original_usd)}</td>
        <td class="r b">${formatearUSD(x.saldo_usd)}</td>
        <td class="r gris">${bs(x.saldo_usd)}</td>
      </tr>${detalle}`;
    })
    .join('');

  const pagos = (d.abonos ?? [])
    .map(
      (a) => `
      <tr>
        <td>${esc(a.numero)}</td>
        <td>${formatearFecha(a.fecha)}</td>
        <td class="r">${a.moneda === 'USD' ? formatearUSD(a.monto_moneda) : formatearBs(a.monto_moneda)}</td>
        <td class="r b">${formatearUSD(a.monto_usd)}</td>
      </tr>`,
    )
    .join('');

  const titulo = `Estado de cuenta - ${d.cliente.nombre}`;

  const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${esc(titulo)}</title>
  <style>
    * { margin:0; padding:0; box-sizing:border-box; }
    body { font-family:'Segoe UI',Arial,sans-serif; font-size:12px; color:#111; padding:14mm 12mm; }
    h1 { font-size:16px; letter-spacing:.5px; }
    .r { text-align:right; } .b { font-weight:700; } .gris { color:#666; }
    .cab { display:flex; justify-content:space-between; align-items:flex-start; gap:16px;
           border-bottom:2px solid #111; padding-bottom:8px; }
    .cab .neg { font-size:15px; font-weight:700; }
    .cab .der { text-align:right; }
    .cliente { display:flex; justify-content:space-between; gap:16px; margin:12px 0; padding:8px 10px;
               background:#f4f4f5; border-radius:6px; }
    .cliente .et { font-size:10px; text-transform:uppercase; letter-spacing:.5px; color:#666; }
    table { width:100%; border-collapse:collapse; margin-top:6px; }
    th { font-size:10px; text-transform:uppercase; letter-spacing:.4px; color:#555;
         border-bottom:1px solid #bbb; padding:5px 4px; text-align:left; }
    th.r { text-align:right; }
    td { padding:5px 4px; border-bottom:1px solid #eee; vertical-align:top; }
    /* La compra y su detalle son un bloque: la linea fuerte va al cerrar el grupo. */
    tr.doc td { border-bottom:1px solid #f2f2f2; font-weight:500; }
    tr.mora td { background:#fff6f6; }
    /* Productos de la compra: sangrados y en gris, para que se lean como detalle. */
    tr.det > td { padding:2px 4px 8px 16px; border-bottom:1px solid #ddd; }
    table.items { width:100%; border-collapse:collapse; }
    table.items td { border:0; padding:1px 4px; font-size:11px; color:#444; }
    table.items td.cant { width:46px; text-align:right; color:#888; white-space:nowrap; }
    .chip { display:inline-block; margin-left:5px; padding:0 5px; border-radius:8px;
            background:#fee2e2; color:#b91c1c; font-size:10px; font-weight:600; }
    .total { margin-top:10px; display:flex; justify-content:flex-end; }
    .total .caja { min-width:58%; border:2px solid #111; border-radius:6px; padding:8px 10px; }
    .total .fila { display:flex; justify-content:space-between; align-items:baseline; }
    .total .grande { font-size:20px; font-weight:700; }
    .sec { margin-top:16px; font-size:11px; font-weight:700; text-transform:uppercase;
           letter-spacing:.5px; color:#444; }
    .pie { margin-top:18px; border-top:1px solid #ddd; padding-top:8px; font-size:10px; color:#666; }
    .firma { margin-top:26px; display:flex; justify-content:space-between; gap:40px; }
    .firma div { flex:1; border-top:1px solid #999; padding-top:4px; text-align:center; font-size:10px; color:#666; }
    @media print { body { padding:0; } .firma { page-break-inside:avoid; } }
  </style></head><body>
    <div class="cab">
      <div>
        <div class="neg">${esc(d.negocio.nombre)}</div>
        ${d.negocio.direccion ? `<div class="gris">${esc(d.negocio.direccion)}</div>` : ''}
        ${d.negocio.telefono ? `<div class="gris">Tel: ${esc(d.negocio.telefono)}</div>` : ''}
        ${d.negocio.rif ? `<div class="gris">RIF: ${esc(d.negocio.rif)}</div>` : ''}
      </div>
      <div class="der">
        <h1>ESTADO DE CUENTA</h1>
        <div class="gris">Emitido: ${formatearFechaHora(d.fecha)}</div>
        ${hayTasa ? `<div class="gris">Tasa del día: Bs ${formatearNumero(d.tasa, 2)} / $</div>` : ''}
      </div>
    </div>

    <div class="cliente">
      <div>
        <div class="et">Cliente</div>
        <div class="b">${esc(d.cliente.nombre)}</div>
        ${d.cliente.documento ? `<div class="gris">${esc(d.cliente.documento)}</div>` : ''}
      </div>
      <div class="r">
        <div class="et">Compras pendientes</div>
        <div class="b">${d.deudas.length}</div>
      </div>
    </div>

    <div class="sec">Detalle de la deuda</div>
    <table>
      <thead>
        <tr>
          <th>Documento</th><th>Fecha</th><th>Vence</th>
          <th class="r">Monto original</th><th class="r">Saldo USD</th><th class="r">Saldo Bs</th>
        </tr>
      </thead>
      <tbody>${filas || '<tr><td colspan="6" class="gris">Sin deudas pendientes</td></tr>'}</tbody>
    </table>

    <div class="total">
      <div class="caja">
        <div class="fila">
          <span class="b">TOTAL A PAGAR</span>
          <span class="grande">${formatearUSD(d.totalUsd)}</span>
        </div>
        <div class="fila gris">
          <span>Equivalente en bolívares</span>
          <span class="b">${bs(d.totalUsd)}</span>
        </div>
      </div>
    </div>

    ${pagos ? `
    <div class="sec">Últimos pagos recibidos</div>
    <table>
      <thead>
        <tr><th>Recibo</th><th>Fecha</th><th class="r">Pagó</th><th class="r">Abonado USD</th></tr>
      </thead>
      <tbody>${pagos}</tbody>
    </table>` : ''}

    <div class="firma">
      <div>Firma del cliente</div>
      <div>${d.atendidoPor ? `Atendido por ${esc(d.atendidoPor)}` : 'Firma y sello'}</div>
    </div>

    <div class="pie">
      La deuda está expresada en dólares. El monto en bolívares es referencial y se
      calcula con la tasa del día de emisión de este documento: si paga otro día, el
      equivalente en bolívares cambia.
      <br/>Documento informativo, no es una factura fiscal.
      ${d.negocio.pie ? `<br/>${esc(d.negocio.pie)}` : ''}
    </div>
    <script>window.onload=function(){window.print();};</script>
  </body></html>`;

  const win = ventana ?? window.open('', '_blank', 'width=900,height=700');
  if (!win) return;
  // `open()` limpia el "generando…" que dejo abrirVentanaImpresion().
  win.document.open();
  win.document.write(html);
  win.document.close();
}

/** Suma de saldos, por si el llamador no la trae calculada. */
export function totalDeudas(deudas: DeudaImpresa[]): number {
  return deudas.reduce((a, d) => a + aNumero(d.saldo_usd), 0);
}
