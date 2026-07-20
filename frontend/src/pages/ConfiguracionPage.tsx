/** Configuración del negocio: datos, moneda y ticket. */
import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Settings, Save } from 'lucide-react';
import { obtener, reemplazar } from '@/lib/axios';
import { ErrorApi } from '@/lib/errores';
import { Card, Cargando } from '@/components/ui/Feedback';
import { toast } from '@/store/toastStore';

interface Config {
  nombre_negocio: string; razon_social: string | null; nit: string | null;
  direccion: string | null; telefono: string | null; email: string | null;
  ticket_encabezado: string | null; ticket_pie: string | null; ticket_mensaje_legal: string | null;
  moneda_secundaria_simbolo: string; es_bloquea_venta_sin_tasa: number;
}

export default function ConfiguracionPage() {
  const qc = useQueryClient();
  const [form, setForm] = useState<Record<string, string>>({});

  const config = useQuery({ queryKey: ['config'], queryFn: () => obtener<Config>('/configuracion') });

  useEffect(() => {
    if (config.data) {
      const c = config.data;
      setForm({
        nombreNegocio: c.nombre_negocio ?? '', razonSocial: c.razon_social ?? '', nit: c.nit ?? '',
        direccion: c.direccion ?? '', telefono: c.telefono ?? '', email: c.email ?? '',
        ticketEncabezado: c.ticket_encabezado ?? '', ticketPie: c.ticket_pie ?? '',
        ticketMensajeLegal: c.ticket_mensaje_legal ?? '',
      });
    }
  }, [config.data]);

  const guardar = useMutation({
    mutationFn: () => reemplazar('/configuracion', form),
    onSuccess: () => { toast.exito('Configuración guardada'); qc.invalidateQueries({ queryKey: ['config'] }); },
    onError: (e) => toast.error(e instanceof ErrorApi ? e.message : 'No se pudo guardar'),
  });

  if (config.isLoading) return <Cargando />;
  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-center justify-between">
        <div><h1 className="flex items-center gap-2 text-2xl font-bold"><Settings className="h-6 w-6" /> Configuración</h1></div>
        <button onClick={() => guardar.mutate()} disabled={guardar.isPending} className="flex items-center gap-2 rounded-lg bg-amber-500 px-4 py-2 font-semibold text-white hover:bg-amber-600 disabled:opacity-50"><Save className="h-4 w-4" /> Guardar</button>
      </div>

      <Card>
        <h2 className="mb-3 font-semibold">Datos del negocio</h2>
        <div className="grid grid-cols-2 gap-3">
          <Campo label="Nombre del negocio" className="col-span-2"><input value={form.nombreNegocio ?? ''} onChange={(e) => set('nombreNegocio', e.target.value)} className={INP} /></Campo>
          <Campo label="Razón social"><input value={form.razonSocial ?? ''} onChange={(e) => set('razonSocial', e.target.value)} className={INP} /></Campo>
          <Campo label="RIF"><input value={form.nit ?? ''} onChange={(e) => set('nit', e.target.value)} className={INP} /></Campo>
          <Campo label="Dirección" className="col-span-2"><input value={form.direccion ?? ''} onChange={(e) => set('direccion', e.target.value)} className={INP} /></Campo>
          <Campo label="Teléfono"><input value={form.telefono ?? ''} onChange={(e) => set('telefono', e.target.value)} className={INP} /></Campo>
          <Campo label="Correo"><input value={form.email ?? ''} onChange={(e) => set('email', e.target.value)} className={INP} /></Campo>
        </div>
      </Card>

      <Card>
        <h2 className="mb-3 font-semibold">Ticket de venta</h2>
        <div className="space-y-3">
          <Campo label="Encabezado"><input value={form.ticketEncabezado ?? ''} onChange={(e) => set('ticketEncabezado', e.target.value)} className={INP} /></Campo>
          <Campo label="Pie de página"><input value={form.ticketPie ?? ''} onChange={(e) => set('ticketPie', e.target.value)} className={INP} /></Campo>
          <Campo label="Mensaje legal"><input value={form.ticketMensajeLegal ?? ''} onChange={(e) => set('ticketMensajeLegal', e.target.value)} className={INP} /></Campo>
        </div>
      </Card>
    </div>
  );
}
const INP = 'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-amber-500 focus:outline-none dark:border-gray-600 dark:bg-gray-700';
function Campo({ label, children, className = '' }: { label: string; children: React.ReactNode; className?: string }) {
  return <div className={className}><label className="mb-1 block text-xs font-medium text-gray-500">{label}</label>{children}</div>;
}
