-- =============================================================================
-- GochitoSystem — Datos iniciales (seed) para PostgreSQL
-- Credenciales admin: admin@gochito.local / Admin123!
-- =============================================================================

BEGIN;

DELETE FROM inventario_movimientos;
DELETE FROM producto_stock;
DELETE FROM producto_codigos;
DELETE FROM producto_precios;
DELETE FROM productos;
DELETE FROM consecutivos;
DELETE FROM cajas;
DELETE FROM motivos_ajuste;
DELETE FROM metodos_pago;
DELETE FROM clientes;
DELETE FROM proveedores;
DELETE FROM categorias;
DELETE FROM tasas_cambio;
DELETE FROM configuracion;
DELETE FROM impuestos;
DELETE FROM unidades_medida;
DELETE FROM rol_permisos;
DELETE FROM permisos;
DELETE FROM usuario_sucursales;
DELETE FROM usuarios;
DELETE FROM roles;
DELETE FROM sucursales;

-- ---------------------------------------------------------------------------
-- Sucursal
-- ---------------------------------------------------------------------------
INSERT INTO sucursales (id, codigo, nombre, direccion, telefono, es_principal, esta_activa) VALUES
 (1, 'PRINCIPAL', 'Los Gochitos', 'Residencia Kimura, Torre 10 Apto. PBD', '0412-6837180', TRUE, TRUE);

-- ---------------------------------------------------------------------------
-- Roles
-- ---------------------------------------------------------------------------
INSERT INTO roles (id, codigo, nombre, descripcion, es_sistema, esta_activo, eliminado_en) VALUES
 (1, 'ADMIN',      'Administrador', 'Acceso total al sistema', TRUE, TRUE, NULL),
 (2, 'SUPERVISOR', 'Supervisor',    'Gestion operativa sin configuracion critica', TRUE, FALSE, NOW()),
 (3, 'CAJERO',     'Cajero',        'Punto de venta, caja y cartera', TRUE, FALSE, NOW()),
 (4, 'BODEGUERO',  'Bodeguero',     'Inventario, productos y compras', TRUE, FALSE, NOW());

SELECT SETVAL('roles_id_seq', 4);

-- ---------------------------------------------------------------------------
-- Permisos (modulo.accion)
-- ---------------------------------------------------------------------------
INSERT INTO permisos (codigo, modulo, accion, descripcion) VALUES
 ('usuarios.ver','usuarios','ver','Ver usuarios'),
 ('usuarios.crear','usuarios','crear','Crear usuarios'),
 ('usuarios.editar','usuarios','editar','Editar usuarios'),
 ('usuarios.eliminar','usuarios','eliminar','Eliminar usuarios'),
 ('roles.ver','roles','ver','Ver roles'),
 ('roles.crear','roles','crear','Crear roles'),
 ('roles.editar','roles','editar','Editar roles y permisos'),
 ('roles.eliminar','roles','eliminar','Eliminar roles'),
 ('sucursales.ver','sucursales','ver','Ver sucursales'),
 ('sucursales.crear','sucursales','crear','Crear sucursales'),
 ('sucursales.editar','sucursales','editar','Editar sucursales'),
 ('sucursales.eliminar','sucursales','eliminar','Eliminar sucursales'),
 ('configuracion.ver','configuracion','ver','Ver configuracion'),
 ('configuracion.editar','configuracion','editar','Editar configuracion del negocio'),
 ('tasas.ver','tasas','ver','Ver tasas de cambio'),
 ('tasas.registrar','tasas','registrar','Registrar la tasa del dia'),
 ('tasas.corregir','tasas','corregir','Corregir una tasa registrada'),
 ('categorias.ver','categorias','ver','Ver categorias'),
 ('categorias.crear','categorias','crear','Crear categorias'),
 ('categorias.editar','categorias','editar','Editar categorias'),
 ('categorias.eliminar','categorias','eliminar','Eliminar categorias'),
 ('unidades.ver','unidades','ver','Ver unidades de medida'),
 ('unidades.gestionar','unidades','gestionar','Gestionar unidades de medida'),
 ('impuestos.ver','impuestos','ver','Ver impuestos'),
 ('impuestos.gestionar','impuestos','gestionar','Gestionar impuestos'),
 ('productos.ver','productos','ver','Ver productos'),
 ('productos.crear','productos','crear','Crear productos'),
 ('productos.editar','productos','editar','Editar productos'),
 ('productos.eliminar','productos','eliminar','Eliminar productos'),
 ('productos.cambiar_precio','productos','cambiar_precio','Cambiar precio de venta'),
 ('proveedores.ver','proveedores','ver','Ver proveedores'),
 ('proveedores.crear','proveedores','crear','Crear proveedores'),
 ('proveedores.editar','proveedores','editar','Editar proveedores'),
 ('proveedores.eliminar','proveedores','eliminar','Eliminar proveedores'),
 ('clientes.ver','clientes','ver','Ver clientes'),
 ('clientes.crear','clientes','crear','Crear clientes'),
 ('clientes.editar','clientes','editar','Editar clientes'),
 ('clientes.eliminar','clientes','eliminar','Eliminar clientes'),
 ('compras.ver','compras','ver','Ver compras'),
 ('compras.crear','compras','crear','Crear compras'),
 ('compras.confirmar','compras','confirmar','Confirmar recepcion de compra'),
 ('compras.anular','compras','anular','Anular compras'),
 ('pos.vender','pos','vender','Registrar ventas en el POS'),
 ('ventas.ver','ventas','ver','Ver historial de ventas'),
 ('ventas.anular','ventas','anular','Anular ventas'),
 ('metodos_pago.ver','metodos_pago','ver','Ver metodos de pago'),
 ('metodos_pago.gestionar','metodos_pago','gestionar','Gestionar metodos de pago'),
 ('creditos.ver','creditos','ver','Ver cartera y creditos'),
 ('creditos.gestionar','creditos','gestionar','Gestionar creditos'),
 ('abonos.ver','abonos','ver','Ver abonos'),
 ('abonos.registrar','abonos','registrar','Registrar abonos'),
 ('abonos.anular','abonos','anular','Anular abonos'),
 ('inventario.ver','inventario','ver','Ver existencias y kardex'),
 ('inventario.ajustar','inventario','ajustar','Ajustar inventario'),
 ('inventario.conteo','inventario','conteo','Realizar conteo fisico'),
 ('inventario.reconciliar','inventario','reconciliar','Reconciliar existencias'),
 ('devoluciones.ver','devoluciones','ver','Ver devoluciones'),
 ('devoluciones.crear','devoluciones','crear','Crear devoluciones'),
 ('devoluciones.anular','devoluciones','anular','Anular devoluciones'),
 ('caja.abrir','caja','abrir','Abrir turno de caja'),
 ('caja.cerrar','caja','cerrar','Cerrar turno de caja'),
 ('caja.movimiento','caja','movimiento','Registrar ingreso/egreso de caja'),
 ('caja.ver','caja','ver','Ver turnos y arqueos'),
 ('reportes.ver','reportes','ver','Ver reportes'),
 ('exportaciones.generar','exportaciones','generar','Exportar reportes a PDF/Excel'),
 ('dashboard.ver','dashboard','ver','Ver el dashboard'),
 ('auditoria.ver','auditoria','ver','Ver la bitacora de auditoria');

-- Administrador: todos los permisos
INSERT INTO rol_permisos (rol_id, permiso_id) SELECT 1, id FROM permisos;

-- Supervisor: todo menos gestion de roles y eliminar usuarios
INSERT INTO rol_permisos (rol_id, permiso_id)
 SELECT 2, id FROM permisos WHERE modulo <> 'roles' AND codigo <> 'usuarios.eliminar';

-- Cajero: POS, caja, cartera, clientes, consulta
INSERT INTO rol_permisos (rol_id, permiso_id)
 SELECT 3, id FROM permisos WHERE codigo IN (
   'pos.vender','ventas.ver','clientes.ver','clientes.crear','clientes.editar',
   'caja.abrir','caja.cerrar','caja.movimiento','caja.ver',
   'creditos.ver','abonos.ver','abonos.registrar',
   'devoluciones.ver','devoluciones.crear',
   'productos.ver','tasas.ver','reportes.ver','dashboard.ver');

-- Bodeguero: productos, inventario, compras, proveedores
INSERT INTO rol_permisos (rol_id, permiso_id)
 SELECT 4, id FROM permisos WHERE modulo IN ('productos','inventario','compras','proveedores')
   OR codigo IN ('categorias.ver','unidades.ver','impuestos.ver','tasas.ver',
                 'devoluciones.ver','reportes.ver','dashboard.ver');

-- ---------------------------------------------------------------------------
-- Usuario administrador  (password: Admin123!)
-- ---------------------------------------------------------------------------
INSERT INTO usuarios (id, usuario, email, nombre_completo, password_hash, rol_id, sucursal_predeterminada_id, esta_activo) VALUES
 (1, 'admin', 'admin@gochito.local', 'Administrador Los Gochitos',
  '$2b$12$qVH3rkhDx7guMDXtXpSfFOlYuDPdr6pNQRI/aKTPk2pyQKEJlxhUm', 1, 1, TRUE);

SELECT SETVAL('usuarios_id_seq', 1);

INSERT INTO usuario_sucursales (usuario_id, sucursal_id, rol_id) VALUES (1, 1, 1);

-- ---------------------------------------------------------------------------
-- Unidades de medida
-- ---------------------------------------------------------------------------
INSERT INTO unidades_medida (id, codigo, nombre, es_permite_fraccion, decimales, eliminado_en) VALUES
 (1, 'UND', 'Unidad',      FALSE, 0, NULL),
 (2, 'KG',  'Kilogramo',   TRUE,  3, NULL),
 (3, 'GR',  'Gramo',       TRUE,  0, NOW()),
 (4, 'LT',  'Litro',       TRUE,  3, NULL),
 (5, 'MT',  'Metro',       TRUE,  2, NOW()),
 (6, 'CAJA','Caja',        FALSE, 0, NOW()),
 (7, 'PAQ', 'Paquete',     FALSE, 0, NOW());

SELECT SETVAL('unidades_medida_id_seq', 7);

-- ---------------------------------------------------------------------------
-- Impuestos (Venezuela)
-- ---------------------------------------------------------------------------
INSERT INTO impuestos (id, codigo, nombre, tasa, tipo, vigente_desde) VALUES
 (1, 'IVA16',    'IVA 16%',  16.000, 'GRAVADO',  '2020-01-01'),
 (2, 'EXENTO',   'Exento',    0.000, 'EXENTO',   '2020-01-01'),
 (3, 'EXCLUIDO', 'Excluido',  0.000, 'EXCLUIDO', '2020-01-01');

SELECT SETVAL('impuestos_id_seq', 3);

-- ---------------------------------------------------------------------------
-- Configuracion del negocio (fila unica id=1)
-- ---------------------------------------------------------------------------
INSERT INTO configuracion (
  id, nombre_negocio, razon_social, nit, direccion, telefono,
  moneda_base, moneda_secundaria, moneda_base_simbolo, moneda_secundaria_simbolo,
  decimales_usd, decimales_bs, es_bloquea_venta_sin_tasa, impuesto_predeterminado_id,
  es_precio_incluye_impuesto, ticket_encabezado, ticket_pie, ticket_mensaje_legal,
  es_ticket_muestra_ambas_monedas, es_ticket_muestra_tasa, ticket_ancho_mm,
  dias_plazo_credito_defecto, zona_horaria, actualizado_por
) VALUES (
  1, 'Mini Market Los Gochitos', 'Los Gochitos', NULL,
  'Residencia Kimura, Torre 10 Apto. PBD', '0412-6837180',
  'USD', 'VES', '$', 'Bs', 2, 2, TRUE, 1, TRUE,
  'MINI MARKET LOS GOCHITOS', 'Gracias por su compra',
  'Charcuteria - Panaderia - Viveres', TRUE, TRUE, 80, 15, 'America/Caracas', 1
);

-- ---------------------------------------------------------------------------
-- Tasa del dia
-- ---------------------------------------------------------------------------
INSERT INTO tasas_cambio (fecha, tasa, fuente, usuario_id, notas) VALUES
 (CURRENT_DATE, 36.500000, 'MANUAL', 1, 'Tasa inicial de ejemplo');

-- ---------------------------------------------------------------------------
-- Metodos de pago (bimonetario)
-- ---------------------------------------------------------------------------
INSERT INTO metodos_pago (id, codigo, nombre, tipo, moneda, afecta_caja_efectivo, requiere_referencia, es_permite_cambio, es_no_es_cobro, orden) VALUES
 (1, 'EFECTIVO_BS',  'Efectivo Bs',      'EFECTIVO',        'VES', TRUE,  FALSE, TRUE,  FALSE, 1),
 (2, 'EFECTIVO_USD', 'Efectivo USD',     'EFECTIVO',        'USD', TRUE,  FALSE, TRUE,  FALSE, 2),
 (3, 'PAGO_MOVIL',   'Pago Movil',       'PAGO_MOVIL',      'VES', FALSE, TRUE,  FALSE, FALSE, 3),
 (4, 'TRANSFERENCIA','Transferencia',    'TRANSFERENCIA',   'VES', FALSE, TRUE,  FALSE, FALSE, 4),
 (5, 'PUNTO_VENTA',  'Punto de venta',   'TARJETA_DEBITO',  'VES', FALSE, TRUE,  FALSE, FALSE, 5),
 (6, 'ZELLE',        'Zelle',            'TRANSFERENCIA',   'USD', FALSE, TRUE,  FALSE, FALSE, 6),
 (7, 'BINANCE',      'Binance / USDT',   'CRIPTO',          'USD', FALSE, TRUE,  FALSE, FALSE, 7),
 (8, 'CREDITO',      'Credito (fiado)',  'CREDITO',         'USD', FALSE, FALSE, FALSE, TRUE,  8);

SELECT SETVAL('metodos_pago_id_seq', 8);

-- ---------------------------------------------------------------------------
-- Motivos de ajuste de inventario
-- ---------------------------------------------------------------------------
INSERT INTO motivos_ajuste (id, codigo, nombre, signo, es_perdida, es_requiere_autorizacion) VALUES
 (1, 'CONTEO',     'Ajuste por conteo fisico', 0, FALSE, FALSE),
 (2, 'MERMA',      'Merma / dano',            -1, TRUE,  FALSE),
 (3, 'VENCIDO',    'Producto vencido',        -1, TRUE,  FALSE),
 (4, 'ROBO',       'Perdida / robo',          -1, TRUE,  TRUE),
 (5, 'DEVOLUCION', 'Reingreso por devolucion', 1, FALSE, FALSE),
 (6, 'CORRECCION', 'Correccion administrativa', 0, FALSE, TRUE);

SELECT SETVAL('motivos_ajuste_id_seq', 6);

-- ---------------------------------------------------------------------------
-- Caja
-- ---------------------------------------------------------------------------
INSERT INTO cajas (id, sucursal_id, codigo, nombre, esta_activa) VALUES
 (1, 1, 'CAJA1', 'Caja Principal', TRUE);

SELECT SETVAL('cajas_id_seq', 1);

-- ---------------------------------------------------------------------------
-- Consecutivos de documentos
-- ---------------------------------------------------------------------------
INSERT INTO consecutivos (sucursal_id, tipo_documento, anio, prefijo, ultimo_numero) VALUES
 (1, 'VENTA',             EXTRACT(YEAR FROM CURRENT_DATE)::INTEGER, 'V-',  0),
 (1, 'COMPRA',            EXTRACT(YEAR FROM CURRENT_DATE)::INTEGER, 'C-',  0),
 (1, 'ABONO',             EXTRACT(YEAR FROM CURRENT_DATE)::INTEGER, 'A-',  0),
 (1, 'DEVOLUCION_VENTA',  EXTRACT(YEAR FROM CURRENT_DATE)::INTEGER, 'DV-', 0),
 (1, 'DEVOLUCION_COMPRA', EXTRACT(YEAR FROM CURRENT_DATE)::INTEGER, 'DC-', 0),
 (1, 'AJUSTE',            EXTRACT(YEAR FROM CURRENT_DATE)::INTEGER, 'AJ-', 0);

-- ---------------------------------------------------------------------------
-- Cliente generico
-- ---------------------------------------------------------------------------
INSERT INTO clientes (id, tipo_documento, documento, nombre, es_permite_credito, esta_activo) VALUES
 (1, 'SIN_IDENTIFICAR', NULL, 'CONSUMIDOR FINAL', FALSE, TRUE),
 (2, 'CC', 'V-12345678', 'Maria Gonzalez', TRUE, TRUE),
 (3, 'CC', 'V-23456789', 'Jose Rodriguez', TRUE, TRUE);

UPDATE clientes SET cupo_credito = 50.00, dias_plazo = 15 WHERE id IN (2,3);

SELECT SETVAL('clientes_id_seq', 3);

-- ---------------------------------------------------------------------------
-- Proveedor generico
-- ---------------------------------------------------------------------------
INSERT INTO proveedores (id, razon_social, nombre_comercial, esta_activo) VALUES
 (1, 'INGRESO DIRECTO', 'Ingreso manual de mercancia', TRUE);

SELECT SETVAL('proveedores_id_seq', 1);

-- ---------------------------------------------------------------------------
-- Categorias
-- ---------------------------------------------------------------------------
INSERT INTO categorias (id, nombre, descripcion, orden, esta_activa) VALUES
 (1, 'Viveres',         'Alimentos basicos y secos',    1, TRUE),
 (2, 'Charcuteria',     'Quesos, jamones y embutidos',  2, TRUE),
 (3, 'Panaderia',       'Pan y productos de panaderia', 3, TRUE),
 (4, 'Bebidas',         'Refrescos, jugos y agua',      4, TRUE),
 (5, 'Limpieza',        'Productos de limpieza',        5, TRUE),
 (6, 'Cuidado personal','Higiene y cuidado personal',   6, TRUE);

SELECT SETVAL('categorias_id_seq', 6);

-- ---------------------------------------------------------------------------
-- Productos
-- ---------------------------------------------------------------------------
INSERT INTO productos (sku, nombre, categoria_id, unidad_medida_id, impuesto_id, precio_venta, costo_promedio, ultimo_costo, es_precio_incluye_impuesto, es_favorito_pos) VALUES
 ('VIV-001','Harina de maiz PAN 1kg',        1, 1, 2, 1.2000, 0.9000, 0.9000, TRUE, TRUE),
 ('VIV-002','Arroz Primor 1kg',              1, 1, 2, 1.5000, 1.1000, 1.1000, TRUE, TRUE),
 ('VIV-003','Aceite Vatel 1L',               1, 4, 2, 2.8000, 2.2000, 2.2000, TRUE, TRUE),
 ('VIV-004','Pasta Primor 1kg',              1, 1, 2, 1.3000, 0.9500, 0.9500, TRUE, TRUE),
 ('VIV-005','Azucar Montalban 1kg',          1, 1, 2, 1.1000, 0.8000, 0.8000, TRUE, FALSE),
 ('VIV-006','Cafe Fama de America 250g',     1, 1, 1, 3.5000, 2.8000, 2.8000, TRUE, FALSE),
 ('VIV-007','Caraotas negras 500g',          1, 1, 2, 1.4000, 1.0000, 1.0000, TRUE, FALSE),
 ('VIV-008','Lentejas 500g',                 1, 1, 2, 1.6000, 1.2000, 1.2000, TRUE, FALSE),
 ('VIV-009','Salsa de tomate Pampero 397g',  1, 1, 1, 1.8000, 1.3000, 1.3000, TRUE, FALSE),
 ('VIV-010','Atun Margarita lata',           1, 1, 1, 2.5000, 1.9000, 1.9000, TRUE, FALSE),
 ('VIV-011','Harina de trigo leudante 1kg',  1, 1, 2, 1.2500, 0.9000, 0.9000, TRUE, FALSE),
 ('VIV-012','Sal marina 1kg',                1, 1, 2, 0.6000, 0.3500, 0.3500, TRUE, FALSE),
 ('CHA-001','Queso blanco duro kg',          2, 2, 1, 6.5000, 5.0000, 5.0000, TRUE, TRUE),
 ('CHA-002','Queso amarillo kg',             2, 2, 1, 7.2000, 5.6000, 5.6000, TRUE, TRUE),
 ('CHA-003','Jamon de pierna kg',            2, 2, 1, 8.5000, 6.8000, 6.8000, TRUE, FALSE),
 ('CHA-004','Mortadela kg',                  2, 2, 1, 3.8000, 2.9000, 2.9000, TRUE, FALSE),
 ('PAN-001','Pan canilla unidad',            3, 1, 2, 0.8000, 0.5000, 0.5000, TRUE, TRUE),
 ('PAN-002','Pan de sandwich',               3, 1, 2, 1.8000, 1.3000, 1.3000, TRUE, FALSE),
 ('PAN-003','Cachito de jamon',              3, 1, 1, 1.2000, 0.7000, 0.7000, TRUE, TRUE),
 ('BEB-001','Refresco Pepsi 2L',             4, 1, 1, 2.0000, 1.5000, 1.5000, TRUE, TRUE),
 ('BEB-002','Malta Maltin Polar 355ml',      4, 1, 1, 0.8000, 0.5500, 0.5500, TRUE, FALSE),
 ('BEB-003','Agua mineral Minalba 1.5L',     4, 1, 1, 0.7000, 0.4500, 0.4500, TRUE, FALSE),
 ('LIM-001','Detergente Ariel 1kg',          5, 1, 1, 3.8000, 3.0000, 3.0000, TRUE, FALSE),
 ('LIM-002','Jabon azul Las Llaves',         5, 1, 1, 0.9000, 0.6000, 0.6000, TRUE, FALSE),
 ('CPE-001','Pasta dental Colgate',          6, 1, 1, 2.4000, 1.8000, 1.8000, TRUE, FALSE);

-- Codigos de barras (uno principal por producto)
INSERT INTO producto_codigos (producto_id, codigo, tipo, es_principal)
 SELECT id, '750' || LPAD(id::TEXT, 10, '0'), 'EAN13', TRUE FROM productos;

-- Stock inicial por producto en la sucursal 1.
INSERT INTO producto_stock (producto_id, sucursal_id, cantidad, stock_minimo, costo_promedio)
 SELECT id, 1,
   CASE
     WHEN sku IN ('VIV-006','CHA-003','LIM-001') THEN 3.000
     WHEN categoria_id = 2 THEN 12.000
     WHEN categoria_id = 3 THEN 40.000
     ELSE 60.000
   END,
   CASE WHEN categoria_id = 2 THEN 5.000 ELSE 10.000 END,
   costo_promedio
 FROM productos;

-- Movimiento de inventario INICIAL por cada producto con stock
INSERT INTO inventario_movimientos
 (sucursal_id, producto_id, tipo, signo, cantidad, costo_unitario, costo_total,
  saldo_anterior, saldo_posterior, costo_promedio_anterior, costo_promedio_posterior,
  documento_tipo, usuario_id, nota)
 SELECT 1, ps.producto_id, 'INICIAL', 1, ps.cantidad, ps.costo_promedio,
   ROUND(ps.cantidad * ps.costo_promedio, 2), 0, ps.cantidad, 0, ps.costo_promedio,
   'INICIAL', 1, 'Carga de inventario inicial'
 FROM producto_stock ps WHERE ps.sucursal_id = 1 AND ps.cantidad > 0;

-- ---------------------------------------------------------------------------
-- Registro de la migracion inicial
-- ---------------------------------------------------------------------------
INSERT INTO migraciones (version, nombre, checksum, aplicada_por) VALUES
 ('001', 'esquema_inicial', REPEAT('0', 64), 'seed')
 ON CONFLICT (version) DO NOTHING;

COMMIT;
