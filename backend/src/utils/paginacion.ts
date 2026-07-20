/**
 * Paginacion de la API: ?pagina=1&limite=25
 * Respuesta: { datos, meta: { pagina, limite, total, totalPaginas } }
 */
import { z } from 'zod';
import { PAGINACION } from '../config/constantes';
import type {
  MetaPaginacion,
  ParametrosPaginacion,
  ResultadoPaginado,
} from '../tipos/comunes';

/**
 * Esquema zod reutilizable para la query de cualquier listado.
 * Los modulos lo extienden con sus propios filtros:
 *   esquemaPaginacion.extend({ estado: z.enum([...]).optional() })
 */
export const esquemaPaginacion = z.object({
  pagina: z.coerce
    .number()
    .int('La pagina debe ser un numero entero')
    .min(1, 'La pagina debe ser mayor o igual a 1')
    .default(PAGINACION.PAGINA_POR_DEFECTO),
  limite: z.coerce
    .number()
    .int('El limite debe ser un numero entero')
    .min(1, 'El limite debe ser mayor o igual a 1')
    .max(
      PAGINACION.LIMITE_MAXIMO,
      `El limite no puede superar ${PAGINACION.LIMITE_MAXIMO}`,
    )
    .default(PAGINACION.LIMITE_POR_DEFECTO),
});

export type EntradaPaginacion = z.infer<typeof esquemaPaginacion>;

/** Normaliza pagina/limite y calcula el desplazamiento para el LIMIT ... OFFSET. */
export function normalizarPaginacion(entrada: Partial<EntradaPaginacion>): ParametrosPaginacion {
  const pagina = Math.max(1, Math.trunc(entrada.pagina ?? PAGINACION.PAGINA_POR_DEFECTO));
  const limite = Math.min(
    PAGINACION.LIMITE_MAXIMO,
    Math.max(1, Math.trunc(entrada.limite ?? PAGINACION.LIMITE_POR_DEFECTO)),
  );

  return { pagina, limite, desplazamiento: (pagina - 1) * limite };
}

/** Construye el bloque `meta` de un listado paginado. */
export function construirMeta(
  parametros: ParametrosPaginacion,
  total: number,
): MetaPaginacion {
  return {
    pagina: parametros.pagina,
    limite: parametros.limite,
    total,
    totalPaginas: parametros.limite > 0 ? Math.ceil(total / parametros.limite) : 0,
  };
}

/** Empaqueta el resultado de un repositorio en { datos, meta }. */
export function paginar<T>(
  resultado: ResultadoPaginado<T>,
  parametros: ParametrosPaginacion,
): { datos: readonly T[]; meta: MetaPaginacion } {
  return {
    datos: resultado.datos,
    meta: construirMeta(parametros, resultado.total),
  };
}
