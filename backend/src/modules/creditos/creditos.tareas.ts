/**
 * Devengo AUTOMATICO de moras.
 *
 * `devengarMoras` ya corre "perezoso" cada vez que alguien abre la cartera, un
 * estado de cuenta o cobra un abono, y eso deja al dia lo que se le cobra al
 * cliente en el mostrador. Pero un reporte de cartera que nadie abrio en dos
 * dias mostraba deudas sin sus tramos nuevos, y el saldo de un cliente solo
 * crecia cuando alguien lo miraba. Esta tarea pasa sola, al arrancar y luego
 * cada hora, para que la mora se sume aunque nadie toque el sistema.
 *
 * Cada hora y no "a medianoche": los tramos se cuentan por fecha calendario, asi
 * que pasar de mas no cobra de mas (el barrido es idempotente), y a la hora
 * siguiente del cambio de dia ya esta todo recargado sin tener que calcular la
 * medianoche de Caracas.
 *
 * Cuando recarga algo, avisa por Socket.IO a la sucursal como si hubiera sido
 * una mutacion de `creditos`: la cartera abierta en pantalla se refresca sola.
 */
import { devengarMoras } from './creditos.service';
import { emitirCambio } from '../../realtime/io';
import { logger, describirError } from '../../utils/logger';

const CADA_MS = 60 * 60 * 1000;

let temporizador: NodeJS.Timeout | null = null;
let corriendo = false;

/** Un barrido. Si el anterior todavia no termino, este se salta: el proximo lo cubre. */
export async function devengarMorasAhora(): Promise<void> {
  if (corriendo) return;
  corriendo = true;
  try {
    const r = await devengarMoras();
    if (r.facturas > 0) {
      logger.info('Mora devengada por la tarea automatica', { facturas: r.facturas });
      for (const sucursalId of r.sucursales) {
        emitirCambio(sucursalId, 'creditos', { accion: 'MORA' });
      }
    }
  } catch (error) {
    // No tumba nada: la proxima pasada (o la proxima lectura de cartera) lo reintenta.
    logger.error('Fallo el devengo automatico de moras', describirError(error));
  } finally {
    corriendo = false;
  }
}

export function iniciarDevengoAutomatico(): void {
  if (temporizador) return;
  void devengarMorasAhora();
  temporizador = setInterval(() => { void devengarMorasAhora(); }, CADA_MS);
  // Que el temporizador no impida apagar el proceso cuando llega SIGTERM.
  temporizador.unref();
}

export function detenerDevengoAutomatico(): void {
  if (!temporizador) return;
  clearInterval(temporizador);
  temporizador = null;
}
