/** Diálogo de confirmación global. Se monta una vez en App y lo usa useConfirm(). */
import { Modal } from './Modal';
import { useConfirmStore } from '@/hooks/useConfirm';

export function ConfirmDialog() {
  const { abierto, opciones, responder } = useConfirmStore();
  if (!opciones) return null;

  return (
    <Modal abierto={abierto} onCerrar={() => responder(false)} titulo={opciones.titulo} ancho="sm"
      pie={
        <div className="flex justify-end gap-2">
          <button onClick={() => responder(false)} className="rounded-lg border border-gray-300 px-4 py-2 text-sm dark:border-gray-600">
            {opciones.cancelar ?? 'Cancelar'}
          </button>
          <button onClick={() => responder(true)}
            className={`rounded-lg px-4 py-2 text-sm font-semibold text-white ${opciones.peligro ? 'bg-red-600 hover:bg-red-700' : 'bg-amber-500 hover:bg-amber-600'}`}>
            {opciones.confirmar ?? 'Confirmar'}
          </button>
        </div>
      }>
      <p className="text-sm text-gray-600 dark:text-gray-300">{opciones.mensaje}</p>
    </Modal>
  );
}
