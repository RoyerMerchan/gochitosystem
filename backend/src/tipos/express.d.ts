/**
 * Extension de los tipos de Express.
 *
 * Nota sobre Express 5: `req.query` y `req.params` son getters de solo lectura,
 * por lo que el middleware de validacion NO los reasigna. Los valores validados
 * quedan en `req.datosValidados`.
 */
import type { UsuarioAutenticado } from './comunes';

declare global {
  namespace Express {
    interface Request {
      /** Identificador unico de la solicitud (ULID, 26 chars). Viaja en X-Request-Id. */
      requestId: string;

      /** Usuario autenticado. Definido solo despues del middleware `autenticar`. */
      usuario?: UsuarioAutenticado;

      /** Datos ya validados y tipados por el middleware `validar`. */
      datosValidados?: {
        body?: unknown;
        query?: unknown;
        params?: unknown;
      };

      /** Estado de idempotencia de la solicitud, si aplica. */
      idempotencia?: {
        readonly clave: string;
        readonly huellaPayload: string;
      };
    }
  }
}

export {};
