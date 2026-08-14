/**
 * Comprobaciones de esquema en caliente.
 *
 * En produccion la base es externa y las migraciones se aplican A MANO; encima el
 * migrador del arranque se traga los fallos para no dejar la app caida. Resultado:
 * una tabla o una columna nueva puede no existir todavia y nadie se entera.
 *
 * Nombrarla directo en una consulta tumba la PANTALLA ENTERA por un dato
 * secundario —ya paso: el estado de cuenta reventaba con "column a.cambio_moneda
 * does not exist" y el cajero no podia cobrarle a nadie—. Las partes que pueden
 * vivir sin ese dato preguntan aqui primero y siguen trabajando sin el.
 *
 * Esto NO reemplaza aplicar la migracion: es la red para que un despliegue a medio
 * hacer no deje el mostrador parado.
 *
 * Solo se cachean los SI: una vez que la columna aparece ya no puede desaparecer,
 * pero un NO tiene que poder cambiar en cuanto se corra la migracion, sin reiniciar.
 */
import { queryOne, type Ejecutor } from './pool';

const presentes = new Set<string>();

/** ¿Existe la columna en esta base? */
export async function existeColumna(
  tabla: string,
  columna: string,
  cx?: Ejecutor,
): Promise<boolean> {
  const clave = `col:${tabla}.${columna}`;
  if (presentes.has(clave)) return true;

  const fila = await queryOne<{ n: string }>(
    `SELECT COUNT(*) AS n FROM information_schema.columns
      WHERE table_schema = CURRENT_SCHEMA() AND table_name = ? AND column_name = ?`,
    [tabla, columna],
    cx,
  );
  const existe = Number(fila?.n ?? 0) > 0;
  if (existe) presentes.add(clave);
  return existe;
}

/** ¿Existe la tabla en esta base? */
export async function existeTabla(tabla: string, cx?: Ejecutor): Promise<boolean> {
  const clave = `tab:${tabla}`;
  if (presentes.has(clave)) return true;

  const fila = await queryOne<{ existe: string | null }>(
    `SELECT to_regclass(?) AS existe`,
    [tabla],
    cx,
  );
  const existe = Boolean(fila?.existe);
  if (existe) presentes.add(clave);
  return existe;
}
