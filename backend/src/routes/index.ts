/**
 * Router raiz de la API. Monta cada modulo bajo su prefijo del contrato canonico.
 * El prefijo global (/api/v1) lo aplica app.ts.
 */
import { Router } from 'express';
import { verificarConexion } from '../database/pool';
import { enviarOk } from '../utils/respuesta';

import rutasAuth from '../modules/auth/auth.routes';
import rutasTasas from '../modules/tasas/tasas.routes';
import rutasProductos from '../modules/productos/productos.routes';
import rutasCaja from '../modules/caja/caja.routes';
import rutasPos, { rutasVentas } from '../modules/pos/pos.routes';
import rutasClientes from '../modules/clientes/clientes.routes';
import rutasProveedores from '../modules/proveedores/proveedores.routes';
import rutasCompras from '../modules/compras/compras.routes';
import rutasCreditos, { rutasAbonos } from '../modules/creditos/creditos.routes';
import rutasInventario from '../modules/inventario/inventario.routes';
import rutasReportes from '../modules/reportes/reportes.routes';
import rutasConfiguracion from '../modules/configuracion/configuracion.routes';
import rutasUsuarios, { routerRoles } from '../modules/usuarios/usuarios.routes';
import {
  routerCategorias,
  routerMetodosPago,
  routerImpuestos,
  routerUnidades,
} from '../modules/catalogos/catalogos.routes';

const router = Router();

/** Healthcheck: confirma que la API y la base responden. */
router.get('/salud', async (_req, res, next) => {
  try {
    const db = await verificarConexion();
    enviarOk(res, { estado: 'ok', db, hora: new Date().toISOString() });
  } catch (e) {
    next(e);
  }
});

router.use('/auth', rutasAuth);
router.use('/tasas-cambio', rutasTasas);
router.use('/productos', rutasProductos);
router.use('/turnos-caja', rutasCaja);
router.use('/pos', rutasPos);
router.use('/ventas', rutasVentas);
router.use('/clientes', rutasClientes);
router.use('/proveedores', rutasProveedores);
router.use('/compras', rutasCompras);
router.use('/creditos', rutasCreditos);
router.use('/abonos', rutasAbonos);
router.use('/inventario', rutasInventario);
router.use('/reportes', rutasReportes);
router.use('/configuracion', rutasConfiguracion);
router.use('/usuarios', rutasUsuarios);
router.use('/roles', routerRoles);
router.use('/categorias', routerCategorias);
router.use('/metodos-pago', routerMetodosPago);
router.use('/impuestos', routerImpuestos);
router.use('/unidades-medida', routerUnidades);

export default router;
