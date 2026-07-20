-- =============================================================================
-- GochitoSystem — Esquema de base de datos
-- Motor: MariaDB 10.6+  ·  InnoDB  ·  utf8mb4 / utf8mb4_unicode_ci
--
-- Modelo BIMONETARIO: moneda base USD, cobro mayoritario en bolivares (VES).
-- Reglas historicas innegociables:
--   1) SNAPSHOT DE COSTO  -> venta_detalle.precio_compra_unitario (USD, congelado al vender)
--   2) SNAPSHOT DE TASA    -> ventas.tasa_cambio (Bs por USD, congelada al vender)
-- Los reportes historicos jamas se recalculan con el costo ni la tasa de hoy.
--
-- Convenciones:
--   - PK "id" BIGINT UNSIGNED AUTO_INCREMENT
--   - Dinero USD  DECIMAL(14,2) | precios/costos unitarios DECIMAL(14,4)
--   - Dinero Bs   DECIMAL(18,2)  (los bolivares manejan magnitudes altas)
--   - Tasa        DECIMAL(18,6)
--   - Cantidades  DECIMAL(14,3)
--   - Timestamps  creado_en / actualizado_en / eliminado_en  DATETIME(3)
--   - Soft delete via columna generada activo_uk = IF(eliminado_en IS NULL,1,NULL)
--     que permite un UNIQUE "solo entre filas vivas".
--
-- Reejecutable: hace DROP de todas las tablas al inicio.
-- =============================================================================

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;
SET SQL_MODE = 'STRICT_TRANS_TABLES,NO_ENGINE_SUBSTITUTION,ERROR_FOR_DIVISION_BY_ZERO';

DROP TABLE IF EXISTS migraciones;
DROP TABLE IF EXISTS trabajos_exportacion;
DROP TABLE IF EXISTS resumen_ventas_diario;
DROP TABLE IF EXISTS idempotencia_solicitudes;
DROP TABLE IF EXISTS auditoria;
DROP TABLE IF EXISTS movimientos_caja;
DROP TABLE IF EXISTS inventario_movimientos;
DROP TABLE IF EXISTS ajuste_detalle;
DROP TABLE IF EXISTS ajustes_inventario;
DROP TABLE IF EXISTS devolucion_detalle;
DROP TABLE IF EXISTS devoluciones;
DROP TABLE IF EXISTS abono_aplicaciones;
DROP TABLE IF EXISTS abonos;
DROP TABLE IF EXISTS pagos;
DROP TABLE IF EXISTS creditos;
DROP TABLE IF EXISTS venta_detalle;
DROP TABLE IF EXISTS ventas;
DROP TABLE IF EXISTS compra_detalle;
DROP TABLE IF EXISTS compras;
DROP TABLE IF EXISTS consecutivos;
DROP TABLE IF EXISTS producto_stock;
DROP TABLE IF EXISTS producto_precios;
DROP TABLE IF EXISTS producto_codigos;
DROP TABLE IF EXISTS productos;
DROP TABLE IF EXISTS turnos_caja;
DROP TABLE IF EXISTS cajas;
DROP TABLE IF EXISTS motivos_ajuste;
DROP TABLE IF EXISTS metodos_pago;
DROP TABLE IF EXISTS clientes;
DROP TABLE IF EXISTS proveedores;
DROP TABLE IF EXISTS categorias;
DROP TABLE IF EXISTS tasas_cambio;
DROP TABLE IF EXISTS parametros;
DROP TABLE IF EXISTS configuracion;
DROP TABLE IF EXISTS impuestos;
DROP TABLE IF EXISTS unidades_medida;
DROP TABLE IF EXISTS sesiones;
DROP TABLE IF EXISTS usuario_sucursales;
DROP TABLE IF EXISTS usuarios;
DROP TABLE IF EXISTS rol_permisos;
DROP TABLE IF EXISTS permisos;
DROP TABLE IF EXISTS roles;
DROP TABLE IF EXISTS sucursales;

SET FOREIGN_KEY_CHECKS = 1;

-- =============================================================================
-- 1. SEGURIDAD Y ORGANIZACION
-- =============================================================================

CREATE TABLE sucursales (
  id             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  codigo         VARCHAR(20)  NOT NULL,
  nombre         VARCHAR(120) NOT NULL,
  direccion      VARCHAR(200) NULL,
  telefono       VARCHAR(40)  NULL,
  es_principal   TINYINT(1)   NOT NULL DEFAULT 0,
  esta_activa    TINYINT(1)   NOT NULL DEFAULT 1,
  creado_en      DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  actualizado_en DATETIME(3)  NULL ON UPDATE CURRENT_TIMESTAMP(3),
  eliminado_en   DATETIME(3)  NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_sucursales_codigo (codigo)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Sucursales / puntos de venta';

CREATE TABLE roles (
  id             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  codigo         VARCHAR(40)  NOT NULL,
  nombre         VARCHAR(80)  NOT NULL,
  descripcion    VARCHAR(200) NULL,
  es_sistema     TINYINT(1)   NOT NULL DEFAULT 0,
  esta_activo    TINYINT(1)   NOT NULL DEFAULT 1,
  creado_en      DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  actualizado_en DATETIME(3)  NULL ON UPDATE CURRENT_TIMESTAMP(3),
  eliminado_en   DATETIME(3)  NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_roles_codigo (codigo)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Roles de usuario (RBAC)';

CREATE TABLE permisos (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  codigo      VARCHAR(60)  NOT NULL,
  modulo      VARCHAR(40)  NOT NULL,
  accion      VARCHAR(40)  NOT NULL,
  descripcion VARCHAR(200) NULL,
  creado_en   DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_permisos_codigo (codigo),
  KEY ix_permisos_modulo (modulo)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Catalogo granular de permisos';

CREATE TABLE rol_permisos (
  rol_id     BIGINT UNSIGNED NOT NULL,
  permiso_id BIGINT UNSIGNED NOT NULL,
  creado_en  DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (rol_id, permiso_id),
  KEY ix_rp_permiso (permiso_id),
  CONSTRAINT fk_rp_rol     FOREIGN KEY (rol_id)     REFERENCES roles(id)    ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_rp_permiso FOREIGN KEY (permiso_id) REFERENCES permisos(id) ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Permisos por rol';

CREATE TABLE usuarios (
  id                         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  usuario                    VARCHAR(60)  NOT NULL,
  email                      VARCHAR(160) NULL,
  nombre_completo            VARCHAR(140) NOT NULL,
  documento                  VARCHAR(30)  NULL,
  telefono                   VARCHAR(40)  NULL,
  password_hash              CHAR(60)     NOT NULL,
  rol_id                     BIGINT UNSIGNED NOT NULL,
  sucursal_predeterminada_id BIGINT UNSIGNED NULL,
  intentos_fallidos          TINYINT UNSIGNED NOT NULL DEFAULT 0,
  bloqueado_hasta            DATETIME(3)  NULL,
  ultimo_acceso_en           DATETIME(3)  NULL,
  debe_cambiar_password      TINYINT(1)   NOT NULL DEFAULT 0,
  esta_activo                TINYINT(1)   NOT NULL DEFAULT 1,
  creado_en                  DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  actualizado_en             DATETIME(3)  NULL ON UPDATE CURRENT_TIMESTAMP(3),
  eliminado_en               DATETIME(3)  NULL,
  activo_uk                  TINYINT UNSIGNED AS (IF(eliminado_en IS NULL,1,NULL)) VIRTUAL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_usuarios_usuario (usuario, activo_uk),
  UNIQUE KEY uq_usuarios_email (email, activo_uk),
  KEY ix_usuarios_rol (rol_id),
  KEY ix_usuarios_sucursal (sucursal_predeterminada_id),
  CONSTRAINT fk_usuarios_rol      FOREIGN KEY (rol_id)                     REFERENCES roles(id)      ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_usuarios_sucursal FOREIGN KEY (sucursal_predeterminada_id) REFERENCES sucursales(id) ON DELETE SET NULL ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Usuarios del sistema';

CREATE TABLE usuario_sucursales (
  usuario_id  BIGINT UNSIGNED NOT NULL,
  sucursal_id BIGINT UNSIGNED NOT NULL,
  rol_id      BIGINT UNSIGNED NOT NULL,
  creado_en   DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (usuario_id, sucursal_id),
  KEY ix_us_sucursal (sucursal_id),
  KEY ix_us_rol (rol_id),
  CONSTRAINT fk_us_usuario  FOREIGN KEY (usuario_id)  REFERENCES usuarios(id)   ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_us_sucursal FOREIGN KEY (sucursal_id) REFERENCES sucursales(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_us_rol      FOREIGN KEY (rol_id)      REFERENCES roles(id)      ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Sucursales por usuario';

CREATE TABLE sesiones (
  id                 BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  usuario_id         BIGINT UNSIGNED NOT NULL,
  token_hash         CHAR(64)     NOT NULL,
  familia_id         CHAR(36)     NOT NULL,
  reemplazada_por_id BIGINT UNSIGNED NULL,
  ip                 VARBINARY(16) NULL,
  user_agent         VARCHAR(255) NULL,
  expira_en          DATETIME(3)  NOT NULL,
  revocada_en        DATETIME(3)  NULL,
  motivo_revocacion  ENUM('LOGOUT','ROTACION','REUSO_DETECTADO','ADMIN','EXPIRACION') NULL,
  creado_en          DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_sesiones_token (token_hash),
  KEY ix_sesiones_usuario (usuario_id),
  KEY ix_sesiones_familia (familia_id),
  CONSTRAINT fk_sesiones_usuario   FOREIGN KEY (usuario_id)         REFERENCES usuarios(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_sesiones_reemplazo FOREIGN KEY (reemplazada_por_id) REFERENCES sesiones(id) ON DELETE SET NULL ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Refresh tokens rotativos';

-- =============================================================================
-- 2. CATALOGOS BASE
-- =============================================================================

CREATE TABLE unidades_medida (
  id                  BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  codigo              VARCHAR(10) NOT NULL,
  nombre              VARCHAR(60) NOT NULL,
  es_permite_fraccion TINYINT(1)  NOT NULL DEFAULT 0,
  decimales           TINYINT UNSIGNED NOT NULL DEFAULT 0,
  esta_activa         TINYINT(1)  NOT NULL DEFAULT 1,
  creado_en           DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  actualizado_en      DATETIME(3) NULL ON UPDATE CURRENT_TIMESTAMP(3),
  eliminado_en        DATETIME(3) NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_um_codigo (codigo)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Unidades de medida';

CREATE TABLE impuestos (
  id             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  codigo         VARCHAR(20) NOT NULL,
  nombre         VARCHAR(80) NOT NULL,
  tasa           DECIMAL(6,3) NOT NULL DEFAULT 0.000,
  tipo           ENUM('GRAVADO','EXENTO','EXCLUIDO','NO_APLICA') NOT NULL DEFAULT 'GRAVADO',
  vigente_desde  DATE NOT NULL,
  vigente_hasta  DATE NULL,
  esta_activo    TINYINT(1)  NOT NULL DEFAULT 1,
  creado_en      DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  actualizado_en DATETIME(3) NULL ON UPDATE CURRENT_TIMESTAMP(3),
  eliminado_en   DATETIME(3) NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_impuestos_codigo (codigo),
  CONSTRAINT ck_impuestos_tasa CHECK (tasa BETWEEN 0 AND 100)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Impuestos (IVA Venezuela 16, exento, excluido)';

CREATE TABLE configuracion (
  id                              TINYINT UNSIGNED NOT NULL DEFAULT 1,
  nombre_negocio                  VARCHAR(120) NOT NULL,
  razon_social                    VARCHAR(160) NULL,
  nit                             VARCHAR(32)  NULL,
  regimen                         ENUM('SIMPLIFICADO','COMUN','SIMPLE','NO_APLICA') NOT NULL DEFAULT 'NO_APLICA',
  logo_ruta                       VARCHAR(255) NULL,
  direccion                       VARCHAR(200) NULL,
  telefono                        VARCHAR(40)  NULL,
  email                           VARCHAR(160) NULL,
  moneda_base                     CHAR(3) NOT NULL DEFAULT 'USD',
  moneda_secundaria               CHAR(3) NOT NULL DEFAULT 'VES',
  moneda_base_simbolo             VARCHAR(5) NOT NULL DEFAULT '$',
  moneda_secundaria_simbolo       VARCHAR(5) NOT NULL DEFAULT 'Bs',
  decimales_usd                   TINYINT UNSIGNED NOT NULL DEFAULT 2,
  decimales_bs                    TINYINT UNSIGNED NOT NULL DEFAULT 2,
  redondeo_bs_multiplo            DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  es_bloquea_venta_sin_tasa       TINYINT(1) NOT NULL DEFAULT 1,
  impuesto_predeterminado_id      BIGINT UNSIGNED NULL,
  es_precio_incluye_impuesto      TINYINT(1) NOT NULL DEFAULT 1,
  redondeo_multiplo               INT UNSIGNED NOT NULL DEFAULT 50,
  ticket_encabezado               VARCHAR(255) NULL,
  ticket_pie                      VARCHAR(255) NULL,
  ticket_mensaje_legal            VARCHAR(255) NULL,
  es_ticket_mostrar_logo          TINYINT(1) NOT NULL DEFAULT 1,
  es_ticket_mostrar_nit           TINYINT(1) NOT NULL DEFAULT 1,
  es_ticket_muestra_ambas_monedas TINYINT(1) NOT NULL DEFAULT 1,
  es_ticket_muestra_tasa          TINYINT(1) NOT NULL DEFAULT 1,
  ticket_ancho_mm                 TINYINT UNSIGNED NOT NULL DEFAULT 80,
  es_credito_requiere_autorizacion TINYINT(1) NOT NULL DEFAULT 0,
  es_permite_stock_negativo       TINYINT(1) NOT NULL DEFAULT 0,
  dias_plazo_credito_defecto      SMALLINT UNSIGNED NOT NULL DEFAULT 30,
  zona_horaria                    VARCHAR(40) NOT NULL DEFAULT 'America/Caracas',
  actualizado_por                 BIGINT UNSIGNED NULL,
  creado_en                       DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  actualizado_en                  DATETIME(3) NULL ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY ix_config_impuesto (impuesto_predeterminado_id),
  KEY ix_config_usuario (actualizado_por),
  CONSTRAINT ck_config_fila_unica CHECK (id = 1),
  CONSTRAINT fk_config_impuesto FOREIGN KEY (impuesto_predeterminado_id) REFERENCES impuestos(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_config_usuario  FOREIGN KEY (actualizado_por)            REFERENCES usuarios(id)  ON DELETE SET NULL ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Configuracion global (fila unica id=1)';

CREATE TABLE parametros (
  clave           VARCHAR(64)  NOT NULL,
  valor           VARCHAR(255) NOT NULL,
  tipo            ENUM('STRING','INT','DECIMAL','BOOL','JSON') NOT NULL DEFAULT 'STRING',
  descripcion     VARCHAR(200) NULL,
  es_editable     TINYINT(1)   NOT NULL DEFAULT 1,
  actualizado_por BIGINT UNSIGNED NULL,
  creado_en       DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  actualizado_en  DATETIME(3)  NULL ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (clave),
  KEY ix_parametros_usuario (actualizado_por),
  CONSTRAINT fk_parametros_usuario FOREIGN KEY (actualizado_por) REFERENCES usuarios(id) ON DELETE SET NULL ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Parametros clave-valor';

CREATE TABLE tasas_cambio (
  id             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  fecha          DATE NOT NULL,
  tasa           DECIMAL(18,6) NOT NULL COMMENT 'Bolivares por 1 USD',
  fuente         ENUM('MANUAL','BCV','PARALELO','OTRO') NOT NULL DEFAULT 'MANUAL',
  es_correccion  TINYINT(1) NOT NULL DEFAULT 0,
  corrige_tasa_id BIGINT UNSIGNED NULL,
  notas          VARCHAR(255) NULL,
  usuario_id     BIGINT UNSIGNED NOT NULL,
  creado_en      DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  actualizado_en DATETIME(3) NULL ON UPDATE CURRENT_TIMESTAMP(3),
  eliminado_en   DATETIME(3) NULL,
  activo_uk      TINYINT UNSIGNED AS (IF(eliminado_en IS NULL,1,NULL)) VIRTUAL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_tasa_fecha_viva (fecha, activo_uk),
  KEY ix_tasa_fecha (fecha),
  KEY ix_tasa_usuario (usuario_id),
  KEY ix_tasa_corrige (corrige_tasa_id),
  CONSTRAINT ck_tasa_positiva CHECK (tasa > 0),
  CONSTRAINT fk_tasa_usuario FOREIGN KEY (usuario_id)      REFERENCES usuarios(id)     ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_tasa_corrige FOREIGN KEY (corrige_tasa_id) REFERENCES tasas_cambio(id) ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Tasa USD->Bs por dia (registro manual)';

CREATE TABLE categorias (
  id                 BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  categoria_padre_id BIGINT UNSIGNED NULL,
  codigo             VARCHAR(30)  NULL,
  nombre             VARCHAR(100) NOT NULL,
  descripcion        VARCHAR(255) NULL,
  color_hex          CHAR(7) NULL,
  orden              SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  esta_activa        TINYINT(1)  NOT NULL DEFAULT 1,
  creado_en          DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  actualizado_en     DATETIME(3) NULL ON UPDATE CURRENT_TIMESTAMP(3),
  eliminado_en       DATETIME(3) NULL,
  activo_uk          TINYINT UNSIGNED AS (IF(eliminado_en IS NULL,1,NULL)) VIRTUAL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_categorias_nombre (nombre, categoria_padre_id, activo_uk),
  KEY ix_categorias_padre (categoria_padre_id),
  CONSTRAINT fk_categorias_padre FOREIGN KEY (categoria_padre_id) REFERENCES categorias(id) ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Categorias de productos (jerarquicas)';

CREATE TABLE proveedores (
  id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  nit             VARCHAR(32)  NULL,
  razon_social    VARCHAR(160) NOT NULL,
  nombre_comercial VARCHAR(120) NULL,
  contacto_nombre VARCHAR(120) NULL,
  telefono        VARCHAR(40)  NULL,
  email           VARCHAR(160) NULL,
  direccion       VARCHAR(200) NULL,
  ciudad          VARCHAR(80)  NULL,
  dias_plazo      SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  cupo_credito    DECIMAL(14,2) NOT NULL DEFAULT 0.00,
  saldo_actual    DECIMAL(14,2) NOT NULL DEFAULT 0.00,
  notas           VARCHAR(255) NULL,
  esta_activo     TINYINT(1)  NOT NULL DEFAULT 1,
  creado_en       DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  actualizado_en  DATETIME(3) NULL ON UPDATE CURRENT_TIMESTAMP(3),
  eliminado_en    DATETIME(3) NULL,
  activo_uk       TINYINT UNSIGNED AS (IF(eliminado_en IS NULL,1,NULL)) VIRTUAL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_proveedores_nit (nit, activo_uk),
  KEY ix_proveedores_razon (razon_social)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Proveedores; saldo en USD';

CREATE TABLE clientes (
  id                BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  tipo_documento    ENUM('CC','CE','NIT','PASAPORTE','SIN_IDENTIFICAR') NOT NULL DEFAULT 'CC',
  documento         VARCHAR(30)  NULL,
  nombre            VARCHAR(140) NOT NULL,
  telefono          VARCHAR(40)  NULL,
  email             VARCHAR(160) NULL,
  direccion         VARCHAR(200) NULL,
  ciudad            VARCHAR(80)  NULL,
  fecha_nacimiento  DATE NULL,
  cupo_credito      DECIMAL(14,2) NOT NULL DEFAULT 0.00,
  dias_plazo        SMALLINT UNSIGNED NOT NULL DEFAULT 30,
  saldo_actual      DECIMAL(14,2) NOT NULL DEFAULT 0.00 COMMENT 'USD',
  es_permite_credito TINYINT(1) NOT NULL DEFAULT 0,
  esta_bloqueado    TINYINT(1) NOT NULL DEFAULT 0,
  motivo_bloqueo    VARCHAR(200) NULL,
  notas             VARCHAR(255) NULL,
  esta_activo       TINYINT(1)  NOT NULL DEFAULT 1,
  creado_en         DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  actualizado_en    DATETIME(3) NULL ON UPDATE CURRENT_TIMESTAMP(3),
  eliminado_en      DATETIME(3) NULL,
  activo_uk         TINYINT UNSIGNED AS (IF(eliminado_en IS NULL,1,NULL)) VIRTUAL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_clientes_documento (tipo_documento, documento, activo_uk),
  KEY ix_clientes_nombre (nombre),
  CONSTRAINT ck_clientes_cupo CHECK (cupo_credito >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Clientes; deuda en USD';

CREATE TABLE metodos_pago (
  id                  BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  codigo              VARCHAR(30) NOT NULL,
  nombre              VARCHAR(80) NOT NULL,
  tipo                ENUM('EFECTIVO','TARJETA_DEBITO','TARJETA_CREDITO','TRANSFERENCIA','PAGO_MOVIL','CRIPTO','CREDITO','BONO','OTRO') NOT NULL,
  moneda              ENUM('USD','VES') NOT NULL DEFAULT 'VES',
  afecta_caja_efectivo TINYINT(1) NOT NULL DEFAULT 0,
  requiere_referencia TINYINT(1) NOT NULL DEFAULT 0,
  es_permite_cambio   TINYINT(1) NOT NULL DEFAULT 0,
  es_no_es_cobro      TINYINT(1) NOT NULL DEFAULT 0,
  comision_porcentaje DECIMAL(6,3) NOT NULL DEFAULT 0.000,
  orden               SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  esta_activo         TINYINT(1)  NOT NULL DEFAULT 1,
  creado_en           DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  actualizado_en      DATETIME(3) NULL ON UPDATE CURRENT_TIMESTAMP(3),
  eliminado_en        DATETIME(3) NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_metodos_codigo (codigo)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Metodos de pago con su moneda';

CREATE TABLE motivos_ajuste (
  id                     BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  codigo                 VARCHAR(30) NOT NULL,
  nombre                 VARCHAR(80) NOT NULL,
  signo                  TINYINT NOT NULL DEFAULT -1,
  es_perdida             TINYINT(1) NOT NULL DEFAULT 1,
  es_requiere_autorizacion TINYINT(1) NOT NULL DEFAULT 0,
  esta_activo            TINYINT(1)  NOT NULL DEFAULT 1,
  creado_en              DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  actualizado_en         DATETIME(3) NULL ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_motivos_codigo (codigo)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Motivos de ajuste de inventario';

CREATE TABLE cajas (
  id               BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  sucursal_id      BIGINT UNSIGNED NOT NULL,
  codigo           VARCHAR(20) NOT NULL,
  nombre           VARCHAR(80) NOT NULL,
  impresora_nombre VARCHAR(120) NULL,
  esta_activa      TINYINT(1)  NOT NULL DEFAULT 1,
  creado_en        DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  actualizado_en   DATETIME(3) NULL ON UPDATE CURRENT_TIMESTAMP(3),
  eliminado_en     DATETIME(3) NULL,
  activo_uk        TINYINT UNSIGNED AS (IF(eliminado_en IS NULL,1,NULL)) VIRTUAL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_cajas_codigo (sucursal_id, codigo, activo_uk),
  CONSTRAINT fk_cajas_sucursal FOREIGN KEY (sucursal_id) REFERENCES sucursales(id) ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Cajas por sucursal';

CREATE TABLE turnos_caja (
  id                        BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  caja_id                   BIGINT UNSIGNED NOT NULL,
  sucursal_id               BIGINT UNSIGNED NOT NULL,
  usuario_apertura_id       BIGINT UNSIGNED NOT NULL,
  usuario_cierre_id         BIGINT UNSIGNED NULL,
  abierto_en                DATETIME(3) NOT NULL,
  cerrado_en                DATETIME(3) NULL,
  base_inicial_usd          DECIMAL(14,2) NOT NULL DEFAULT 0.00,
  base_inicial_bs           DECIMAL(18,2) NOT NULL DEFAULT 0.00,
  total_ventas_efectivo_usd DECIMAL(14,2) NOT NULL DEFAULT 0.00,
  total_ventas_efectivo_bs  DECIMAL(18,2) NOT NULL DEFAULT 0.00,
  total_ventas_otros_usd    DECIMAL(14,2) NOT NULL DEFAULT 0.00,
  total_abonos_efectivo_usd DECIMAL(14,2) NOT NULL DEFAULT 0.00,
  total_abonos_efectivo_bs  DECIMAL(18,2) NOT NULL DEFAULT 0.00,
  total_ingresos_usd        DECIMAL(14,2) NOT NULL DEFAULT 0.00,
  total_ingresos_bs         DECIMAL(18,2) NOT NULL DEFAULT 0.00,
  total_egresos_usd         DECIMAL(14,2) NOT NULL DEFAULT 0.00,
  total_egresos_bs          DECIMAL(18,2) NOT NULL DEFAULT 0.00,
  total_retiros_usd         DECIMAL(14,2) NOT NULL DEFAULT 0.00,
  total_retiros_bs          DECIMAL(18,2) NOT NULL DEFAULT 0.00,
  total_vueltas_usd         DECIMAL(14,2) NOT NULL DEFAULT 0.00,
  total_vueltas_bs          DECIMAL(18,2) NOT NULL DEFAULT 0.00,
  esperado_usd              DECIMAL(14,2) NOT NULL DEFAULT 0.00,
  esperado_bs               DECIMAL(18,2) NOT NULL DEFAULT 0.00,
  contado_usd               DECIMAL(14,2) NULL,
  contado_bs                DECIMAL(18,2) NULL,
  diferencia_usd            DECIMAL(14,2) NULL,
  diferencia_bs             DECIMAL(18,2) NULL,
  detalle_denominaciones_usd JSON NULL,
  detalle_denominaciones_bs  JSON NULL,
  tasa_cierre               DECIMAL(18,6) NULL,
  observaciones             VARCHAR(255) NULL,
  estado                    ENUM('ABIERTO','CERRADO','CUADRADO') NOT NULL DEFAULT 'ABIERTO',
  abierto_uk                TINYINT UNSIGNED AS (IF(estado='ABIERTO',1,NULL)) VIRTUAL,
  creado_en                 DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  actualizado_en            DATETIME(3) NULL ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_turno_abierto (caja_id, abierto_uk),
  KEY ix_turno_sucursal (sucursal_id),
  KEY ix_turno_apertura (usuario_apertura_id),
  KEY ix_turno_cierre (usuario_cierre_id),
  CONSTRAINT fk_turno_caja     FOREIGN KEY (caja_id)             REFERENCES cajas(id)      ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_turno_sucursal FOREIGN KEY (sucursal_id)         REFERENCES sucursales(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_turno_apertura FOREIGN KEY (usuario_apertura_id) REFERENCES usuarios(id)   ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_turno_cierre   FOREIGN KEY (usuario_cierre_id)   REFERENCES usuarios(id)   ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Turnos de caja, arqueo separado USD/Bs';

-- =============================================================================
-- 3. PRODUCTOS E INVENTARIO
-- =============================================================================

CREATE TABLE productos (
  id                     BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  sku                    VARCHAR(40) NOT NULL COLLATE utf8mb4_bin,
  nombre                 VARCHAR(160) NOT NULL,
  descripcion            VARCHAR(500) NULL,
  categoria_id           BIGINT UNSIGNED NOT NULL,
  unidad_medida_id       BIGINT UNSIGNED NOT NULL,
  impuesto_id            BIGINT UNSIGNED NOT NULL,
  proveedor_preferido_id BIGINT UNSIGNED NULL,
  tipo                   ENUM('SIMPLE','SERVICIO','COMPUESTO') NOT NULL DEFAULT 'SIMPLE',
  precio_venta           DECIMAL(14,4) NOT NULL DEFAULT 0.0000 COMMENT 'USD',
  precio_venta_mayorista DECIMAL(14,4) NULL COMMENT 'USD',
  costo_promedio         DECIMAL(14,4) NOT NULL DEFAULT 0.0000 COMMENT 'USD. Valorizacion actual, NO para reportes historicos',
  ultimo_costo           DECIMAL(14,4) NOT NULL DEFAULT 0.0000 COMMENT 'USD',
  margen_objetivo        DECIMAL(6,3) NULL,
  es_precio_incluye_impuesto TINYINT(1) NOT NULL DEFAULT 1,
  es_maneja_inventario   TINYINT(1) NOT NULL DEFAULT 1,
  es_permite_fraccion    TINYINT(1) NOT NULL DEFAULT 0,
  es_pesable             TINYINT(1) NOT NULL DEFAULT 0,
  es_favorito_pos        TINYINT(1) NOT NULL DEFAULT 0,
  imagen_ruta            VARCHAR(255) NULL,
  esta_activo            TINYINT(1)  NOT NULL DEFAULT 1,
  creado_por             BIGINT UNSIGNED NULL,
  creado_en              DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  actualizado_en         DATETIME(3) NULL ON UPDATE CURRENT_TIMESTAMP(3),
  eliminado_en           DATETIME(3) NULL,
  activo_uk              TINYINT UNSIGNED AS (IF(eliminado_en IS NULL,1,NULL)) VIRTUAL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_productos_sku (sku, activo_uk),
  KEY ix_productos_categoria (categoria_id),
  KEY ix_productos_unidad (unidad_medida_id),
  KEY ix_productos_impuesto (impuesto_id),
  KEY ix_productos_proveedor (proveedor_preferido_id),
  KEY ix_productos_creado_por (creado_por),
  KEY ix_productos_favorito (es_favorito_pos),
  FULLTEXT KEY ft_productos (nombre, descripcion),
  CONSTRAINT ck_productos_precio CHECK (precio_venta >= 0),
  CONSTRAINT fk_productos_categoria FOREIGN KEY (categoria_id)           REFERENCES categorias(id)       ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_productos_unidad    FOREIGN KEY (unidad_medida_id)       REFERENCES unidades_medida(id)  ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_productos_impuesto  FOREIGN KEY (impuesto_id)            REFERENCES impuestos(id)        ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_productos_proveedor FOREIGN KEY (proveedor_preferido_id) REFERENCES proveedores(id)      ON DELETE SET NULL ON UPDATE RESTRICT,
  CONSTRAINT fk_productos_creador   FOREIGN KEY (creado_por)             REFERENCES usuarios(id)         ON DELETE SET NULL ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Productos; precios y costos en USD';

CREATE TABLE producto_codigos (
  id                BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  producto_id       BIGINT UNSIGNED NOT NULL,
  codigo            VARCHAR(64) NOT NULL COLLATE utf8mb4_bin,
  tipo              ENUM('EAN13','EAN8','UPC','INTERNO','BALANZA','PLU') NOT NULL DEFAULT 'EAN13',
  factor_conversion DECIMAL(14,3) NOT NULL DEFAULT 1.000,
  es_principal      TINYINT(1) NOT NULL DEFAULT 0,
  creado_en         DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  actualizado_en    DATETIME(3) NULL ON UPDATE CURRENT_TIMESTAMP(3),
  eliminado_en      DATETIME(3) NULL,
  activo_uk         TINYINT UNSIGNED AS (IF(eliminado_en IS NULL,1,NULL)) VIRTUAL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_pcodigos_codigo (codigo, activo_uk),
  KEY ix_pcodigos_producto (producto_id),
  CONSTRAINT fk_pcodigos_producto FOREIGN KEY (producto_id) REFERENCES productos(id) ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Codigos de barras por producto (unicidad global)';

CREATE TABLE producto_precios (
  id                     BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  producto_id            BIGINT UNSIGNED NOT NULL,
  precio_venta_anterior  DECIMAL(14,4) NOT NULL COMMENT 'USD',
  precio_venta_nuevo     DECIMAL(14,4) NOT NULL COMMENT 'USD',
  costo_referencia       DECIMAL(14,4) NOT NULL DEFAULT 0.0000 COMMENT 'USD',
  tasa_cambio_referencia DECIMAL(18,6) NULL,
  motivo                 VARCHAR(200) NULL,
  vigente_desde          DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  usuario_id             BIGINT UNSIGNED NOT NULL,
  creado_en              DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY ix_pprecios_producto (producto_id, vigente_desde),
  KEY ix_pprecios_usuario (usuario_id),
  CONSTRAINT fk_pprecios_producto FOREIGN KEY (producto_id) REFERENCES productos(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_pprecios_usuario  FOREIGN KEY (usuario_id)  REFERENCES usuarios(id)  ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Historial de precios de venta';

CREATE TABLE producto_stock (
  producto_id       BIGINT UNSIGNED NOT NULL,
  sucursal_id       BIGINT UNSIGNED NOT NULL,
  cantidad          DECIMAL(14,3) NOT NULL DEFAULT 0.000,
  cantidad_reservada DECIMAL(14,3) NOT NULL DEFAULT 0.000,
  stock_minimo      DECIMAL(14,3) NOT NULL DEFAULT 0.000,
  stock_maximo      DECIMAL(14,3) NULL,
  costo_promedio    DECIMAL(14,4) NOT NULL DEFAULT 0.0000 COMMENT 'USD. Costo ACTUAL, prohibido en reportes historicos',
  ubicacion         VARCHAR(60) NULL,
  ultima_entrada_en DATETIME(3) NULL,
  ultima_salida_en  DATETIME(3) NULL,
  actualizado_en    DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (producto_id, sucursal_id),
  KEY ix_stock_suc_cant (sucursal_id, cantidad),
  CONSTRAINT fk_stock_producto FOREIGN KEY (producto_id) REFERENCES productos(id)  ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_stock_sucursal FOREIGN KEY (sucursal_id) REFERENCES sucursales(id) ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Existencia y costo promedio por producto y sucursal';

CREATE TABLE consecutivos (
  id             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  sucursal_id    BIGINT UNSIGNED NOT NULL,
  tipo_documento ENUM('VENTA','COMPRA','ABONO','DEVOLUCION_VENTA','DEVOLUCION_COMPRA','AJUSTE','TRASLADO') NOT NULL,
  anio           SMALLINT UNSIGNED NOT NULL,
  prefijo        VARCHAR(8) NOT NULL DEFAULT '',
  ultimo_numero  BIGINT UNSIGNED NOT NULL DEFAULT 0,
  resolucion     VARCHAR(60) NULL,
  rango_desde    BIGINT UNSIGNED NULL,
  rango_hasta    BIGINT UNSIGNED NULL,
  vigente_hasta  DATE NULL,
  esta_activo    TINYINT(1)  NOT NULL DEFAULT 1,
  creado_en      DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  actualizado_en DATETIME(3) NULL ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_consecutivos (sucursal_id, tipo_documento, anio),
  CONSTRAINT fk_consecutivos_sucursal FOREIGN KEY (sucursal_id) REFERENCES sucursales(id) ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Consecutivos de documentos';

-- =============================================================================
-- 4. COMPRAS
-- =============================================================================

CREATE TABLE compras (
  id                      BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  sucursal_id             BIGINT UNSIGNED NOT NULL,
  proveedor_id            BIGINT UNSIGNED NOT NULL,
  usuario_id              BIGINT UNSIGNED NOT NULL,
  prefijo                 VARCHAR(8) NOT NULL DEFAULT '',
  numero                  BIGINT UNSIGNED NOT NULL,
  anio                    SMALLINT UNSIGNED NOT NULL,
  numero_factura_proveedor VARCHAR(60) NULL COLLATE utf8mb4_bin,
  fecha_documento         DATE NOT NULL,
  fecha_recepcion         DATETIME(3) NOT NULL,
  fecha_vencimiento       DATE NULL,
  subtotal                DECIMAL(14,2) NOT NULL DEFAULT 0.00 COMMENT 'USD',
  descuento_total         DECIMAL(14,2) NOT NULL DEFAULT 0.00 COMMENT 'USD',
  impuesto_total          DECIMAL(14,2) NOT NULL DEFAULT 0.00 COMMENT 'USD',
  flete                   DECIMAL(14,2) NOT NULL DEFAULT 0.00 COMMENT 'USD',
  moneda_pago             ENUM('USD','VES') NOT NULL DEFAULT 'USD',
  tasa_cambio             DECIMAL(18,6) NOT NULL COMMENT 'SNAPSHOT DE TASA de la compra',
  total_usd               DECIMAL(14,2) NOT NULL DEFAULT 0.00,
  total_bs                DECIMAL(18,2) NOT NULL DEFAULT 0.00,
  total_pagado_moneda     DECIMAL(18,4) NOT NULL DEFAULT 0.0000,
  saldo_pendiente         DECIMAL(14,2) NOT NULL DEFAULT 0.00 COMMENT 'USD',
  condicion_pago          ENUM('CONTADO','CREDITO') NOT NULL DEFAULT 'CONTADO',
  estado                  ENUM('BORRADOR','RECIBIDA','ANULADA') NOT NULL DEFAULT 'BORRADOR',
  observaciones           VARCHAR(255) NULL,
  clave_idempotencia      CHAR(36) NULL,
  anulada_en              DATETIME(3) NULL,
  anulada_por             BIGINT UNSIGNED NULL,
  motivo_anulacion        VARCHAR(200) NULL,
  creado_en               DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  actualizado_en          DATETIME(3) NULL ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_compras_numero (sucursal_id, anio, prefijo, numero),
  UNIQUE KEY uq_compras_idem (clave_idempotencia),
  KEY ix_compras_proveedor (proveedor_id, fecha_recepcion),
  KEY ix_compras_usuario (usuario_id),
  KEY ix_compras_estado (estado, fecha_recepcion),
  KEY ix_compras_anulada_por (anulada_por),
  CONSTRAINT ck_compras_tasa  CHECK (tasa_cambio > 0),
  CONSTRAINT ck_compras_total CHECK (total_usd >= 0),
  CONSTRAINT fk_compras_sucursal  FOREIGN KEY (sucursal_id)  REFERENCES sucursales(id)  ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_compras_proveedor FOREIGN KEY (proveedor_id) REFERENCES proveedores(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_compras_usuario   FOREIGN KEY (usuario_id)   REFERENCES usuarios(id)    ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_compras_anulada   FOREIGN KEY (anulada_por)  REFERENCES usuarios(id)    ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Compras a proveedores';

CREATE TABLE compra_detalle (
  id                  BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  compra_id           BIGINT UNSIGNED NOT NULL,
  linea               SMALLINT UNSIGNED NOT NULL,
  producto_id         BIGINT UNSIGNED NOT NULL,
  descripcion         VARCHAR(160) NOT NULL,
  unidad_medida_id    BIGINT UNSIGNED NOT NULL,
  cantidad            DECIMAL(14,3) NOT NULL,
  costo_unitario      DECIMAL(14,4) NOT NULL COMMENT 'USD',
  descuento_unitario  DECIMAL(14,4) NOT NULL DEFAULT 0.0000 COMMENT 'USD',
  flete_prorrateado   DECIMAL(14,2) NOT NULL DEFAULT 0.00 COMMENT 'USD',
  costo_unitario_neto DECIMAL(14,4) NOT NULL COMMENT 'USD. Costo que entra al CPP',
  impuesto_id         BIGINT UNSIGNED NOT NULL,
  impuesto_tasa       DECIMAL(6,3) NOT NULL DEFAULT 0.000,
  impuesto_monto      DECIMAL(14,2) NOT NULL DEFAULT 0.00 COMMENT 'USD',
  subtotal            DECIMAL(14,2) NOT NULL COMMENT 'USD',
  total_linea         DECIMAL(14,2) NOT NULL COMMENT 'USD',
  lote_codigo         VARCHAR(40) NULL,
  fecha_vencimiento   DATE NULL,
  creado_en           DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_cdet_linea (compra_id, linea),
  KEY ix_cdet_producto (producto_id),
  KEY ix_cdet_unidad (unidad_medida_id),
  KEY ix_cdet_impuesto (impuesto_id),
  CONSTRAINT ck_cdet_cantidad CHECK (cantidad > 0),
  CONSTRAINT ck_cdet_costo    CHECK (costo_unitario >= 0),
  CONSTRAINT fk_cdet_compra   FOREIGN KEY (compra_id)        REFERENCES compras(id)         ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_cdet_producto FOREIGN KEY (producto_id)      REFERENCES productos(id)       ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_cdet_unidad   FOREIGN KEY (unidad_medida_id) REFERENCES unidades_medida(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_cdet_impuesto FOREIGN KEY (impuesto_id)      REFERENCES impuestos(id)       ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Renglones de compra';

-- =============================================================================
-- 5. VENTAS (nucleo) — snapshot de costo y de tasa
-- =============================================================================

CREATE TABLE ventas (
  id                 BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  sucursal_id        BIGINT UNSIGNED NOT NULL,
  turno_caja_id      BIGINT UNSIGNED NOT NULL,
  usuario_id         BIGINT UNSIGNED NOT NULL,
  cliente_id         BIGINT UNSIGNED NULL,
  prefijo            VARCHAR(8) NOT NULL DEFAULT '',
  numero             BIGINT UNSIGNED NOT NULL,
  anio               SMALLINT UNSIGNED NOT NULL,
  fecha              DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  subtotal_bruto     DECIMAL(14,2) NOT NULL DEFAULT 0.00 COMMENT 'USD',
  descuento_lineas   DECIMAL(14,2) NOT NULL DEFAULT 0.00 COMMENT 'USD',
  descuento_documento DECIMAL(14,2) NOT NULL DEFAULT 0.00 COMMENT 'USD',
  base_gravable      DECIMAL(14,2) NOT NULL DEFAULT 0.00 COMMENT 'USD',
  impuesto_total     DECIMAL(14,2) NOT NULL DEFAULT 0.00 COMMENT 'USD',
  redondeo           DECIMAL(14,2) NOT NULL DEFAULT 0.00 COMMENT 'USD, puede ser negativo',
  total_usd          DECIMAL(14,2) NOT NULL DEFAULT 0.00 COMMENT 'TOTAL DEFINITIVO EN USD',
  tasa_cambio        DECIMAL(18,6) NOT NULL COMMENT 'SNAPSHOT DE TASA congelada al cerrar',
  tasa_cambio_id     BIGINT UNSIGNED NULL,
  total_bs           DECIMAL(18,2) NOT NULL DEFAULT 0.00 COMMENT 'ROUND(total_usd*tasa,2) congelado',
  redondeo_bs        DECIMAL(18,2) NOT NULL DEFAULT 0.00,
  costo_total        DECIMAL(14,2) NOT NULL DEFAULT 0.00 COMMENT 'USD, SUM del snapshot',
  utilidad_total     DECIMAL(14,2) NOT NULL DEFAULT 0.00 COMMENT 'USD, SUM del snapshot',
  total_pagado       DECIMAL(14,2) NOT NULL DEFAULT 0.00 COMMENT 'USD',
  total_credito      DECIMAL(14,2) NOT NULL DEFAULT 0.00 COMMENT 'USD',
  cantidad_items     DECIMAL(14,3) NOT NULL DEFAULT 0.000,
  es_credito         TINYINT(1) NOT NULL DEFAULT 0,
  estado             ENUM('ABIERTA','CERRADA','ANULADA') NOT NULL DEFAULT 'ABIERTA',
  clave_idempotencia CHAR(36) NULL,
  observaciones      VARCHAR(255) NULL,
  anulada_en         DATETIME(3) NULL,
  anulada_por        BIGINT UNSIGNED NULL,
  autorizada_por     BIGINT UNSIGNED NULL,
  motivo_anulacion   VARCHAR(200) NULL,
  creado_en          DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  actualizado_en     DATETIME(3) NULL ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_ventas_numero (sucursal_id, anio, prefijo, numero),
  UNIQUE KEY uq_ventas_idem (clave_idempotencia),
  KEY ix_ventas_suc_fecha (sucursal_id, fecha, estado),
  KEY ix_ventas_cliente (cliente_id, fecha, estado),
  KEY ix_ventas_turno (turno_caja_id),
  KEY ix_ventas_usuario (usuario_id),
  KEY ix_ventas_tasa (tasa_cambio_id),
  KEY ix_ventas_anulada_por (anulada_por),
  KEY ix_ventas_autorizada_por (autorizada_por),
  CONSTRAINT ck_ventas_total CHECK (total_usd >= 0),
  CONSTRAINT ck_ventas_tasa  CHECK (tasa_cambio > 0),
  CONSTRAINT fk_ventas_sucursal   FOREIGN KEY (sucursal_id)    REFERENCES sucursales(id)   ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_ventas_turno      FOREIGN KEY (turno_caja_id)  REFERENCES turnos_caja(id)  ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_ventas_usuario    FOREIGN KEY (usuario_id)     REFERENCES usuarios(id)     ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_ventas_cliente    FOREIGN KEY (cliente_id)     REFERENCES clientes(id)     ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_ventas_anulada    FOREIGN KEY (anulada_por)    REFERENCES usuarios(id)     ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_ventas_autorizada FOREIGN KEY (autorizada_por) REFERENCES usuarios(id)     ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_ventas_tasa       FOREIGN KEY (tasa_cambio_id) REFERENCES tasas_cambio(id) ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Ventas; snapshot de tasa y totales en USD y Bs';

CREATE TABLE venta_detalle (
  id                     BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  venta_id               BIGINT UNSIGNED NOT NULL,
  linea                  SMALLINT UNSIGNED NOT NULL,
  producto_id            BIGINT UNSIGNED NOT NULL,
  descripcion            VARCHAR(160) NOT NULL,
  codigo_barras          VARCHAR(64) NULL,
  categoria_id           BIGINT UNSIGNED NOT NULL,
  unidad_medida_id       BIGINT UNSIGNED NOT NULL,
  cantidad               DECIMAL(14,3) NOT NULL,
  precio_compra_unitario DECIMAL(14,4) NOT NULL COMMENT 'USD. SNAPSHOT DE COSTO HISTORICO',
  precio_venta_unitario  DECIMAL(14,4) NOT NULL COMMENT 'USD',
  descuento_unitario     DECIMAL(14,4) NOT NULL DEFAULT 0.0000 COMMENT 'USD, incluye prorrateo del descuento de documento',
  impuesto_id            BIGINT UNSIGNED NOT NULL,
  impuesto_tasa          DECIMAL(6,3) NOT NULL DEFAULT 0.000,
  impuesto_monto         DECIMAL(14,2) NOT NULL DEFAULT 0.00 COMMENT 'USD',
  es_precio_incluia_impuesto TINYINT(1) NOT NULL DEFAULT 1,
  base_gravable          DECIMAL(14,2) NOT NULL COMMENT 'USD',
  costo_total            DECIMAL(14,2) NOT NULL COMMENT 'USD. precio_compra_unitario * cantidad',
  utilidad_unitaria      DECIMAL(14,4) NOT NULL COMMENT 'USD',
  utilidad_total         DECIMAL(14,2) NOT NULL COMMENT 'USD',
  total_linea            DECIMAL(14,2) NOT NULL COMMENT 'USD',
  cantidad_devuelta      DECIMAL(14,3) NOT NULL DEFAULT 0.000,
  creado_en              DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_vdet_linea (venta_id, linea),
  KEY ix_vd_producto (producto_id, venta_id),
  KEY ix_vd_categoria (categoria_id),
  KEY ix_vd_unidad (unidad_medida_id),
  KEY ix_vd_impuesto (impuesto_id),
  CONSTRAINT ck_vdet_cantidad CHECK (cantidad > 0),
  CONSTRAINT ck_vdet_costo    CHECK (precio_compra_unitario >= 0),
  CONSTRAINT ck_vdet_precio   CHECK (precio_venta_unitario >= 0),
  CONSTRAINT fk_vdet_venta     FOREIGN KEY (venta_id)         REFERENCES ventas(id)          ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_vdet_producto  FOREIGN KEY (producto_id)      REFERENCES productos(id)       ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_vdet_categoria FOREIGN KEY (categoria_id)     REFERENCES categorias(id)      ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_vdet_unidad    FOREIGN KEY (unidad_medida_id) REFERENCES unidades_medida(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_vdet_impuesto  FOREIGN KEY (impuesto_id)      REFERENCES impuestos(id)       ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Renglones de venta con snapshot de costo y utilidad USD';

CREATE TABLE creditos (
  id                          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  sucursal_id                 BIGINT UNSIGNED NOT NULL,
  cliente_id                  BIGINT UNSIGNED NOT NULL,
  venta_id                    BIGINT UNSIGNED NULL,
  origen                      ENUM('VENTA','SALDO_INICIAL','NOTA_DEBITO','AJUSTE') NOT NULL DEFAULT 'VENTA',
  fecha_emision               DATE NOT NULL,
  fecha_vencimiento           DATE NOT NULL,
  dias_plazo                  SMALLINT UNSIGNED NOT NULL DEFAULT 30,
  monto_original_usd          DECIMAL(14,2) NOT NULL,
  saldo_usd                   DECIMAL(14,2) NOT NULL,
  tasa_cambio_origen          DECIMAL(18,6) NOT NULL,
  monto_original_bs_referencia DECIMAL(18,2) NOT NULL DEFAULT 0.00,
  estado                      ENUM('PENDIENTE','PARCIAL','PAGADO','VENCIDO','ANULADO') NOT NULL DEFAULT 'PENDIENTE',
  autorizado_por              BIGINT UNSIGNED NULL,
  usuario_id                  BIGINT UNSIGNED NOT NULL,
  observaciones               VARCHAR(255) NULL,
  pagado_en                   DATETIME(3) NULL,
  anulado_en                  DATETIME(3) NULL,
  anulado_por                 BIGINT UNSIGNED NULL,
  motivo_anulacion            VARCHAR(200) NULL,
  creado_en                   DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  actualizado_en              DATETIME(3) NULL ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY ix_cred_cliente (cliente_id, estado, fecha_vencimiento),
  KEY ix_cred_sucursal (sucursal_id),
  KEY ix_cred_venta (venta_id),
  KEY ix_cred_usuario (usuario_id),
  KEY ix_cred_autorizado (autorizado_por),
  KEY ix_cred_anulado (anulado_por),
  CONSTRAINT ck_cred_monto CHECK (monto_original_usd > 0),
  CONSTRAINT ck_cred_saldo CHECK (saldo_usd >= 0 AND saldo_usd <= monto_original_usd),
  CONSTRAINT fk_cred_sucursal   FOREIGN KEY (sucursal_id)    REFERENCES sucursales(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_cred_cliente    FOREIGN KEY (cliente_id)     REFERENCES clientes(id)   ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_cred_venta      FOREIGN KEY (venta_id)       REFERENCES ventas(id)     ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_cred_usuario    FOREIGN KEY (usuario_id)     REFERENCES usuarios(id)   ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_cred_autorizado FOREIGN KEY (autorizado_por) REFERENCES usuarios(id)   ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_cred_anulado    FOREIGN KEY (anulado_por)    REFERENCES usuarios(id)   ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Creditos/cartera; saldo en USD';

CREATE TABLE pagos (
  id                    BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  venta_id              BIGINT UNSIGNED NOT NULL,
  sucursal_id           BIGINT UNSIGNED NOT NULL,
  turno_caja_id         BIGINT UNSIGNED NOT NULL,
  metodo_pago_id        BIGINT UNSIGNED NOT NULL,
  moneda                ENUM('USD','VES') NOT NULL,
  monto_moneda          DECIMAL(18,4) NOT NULL,
  tasa_aplicada         DECIMAL(18,6) NOT NULL COMMENT 'Copiada de ventas.tasa_cambio',
  monto_usd             DECIMAL(14,2) NOT NULL COMMENT 'Equivalente USD, suma contra ventas.total_usd',
  monto_recibido_moneda DECIMAL(18,4) NULL,
  cambio_moneda         DECIMAL(18,4) NULL,
  cambio_moneda_codigo  ENUM('USD','VES') NULL,
  referencia            VARCHAR(60) NULL,
  franquicia            VARCHAR(40) NULL,
  comision              DECIMAL(14,2) NOT NULL DEFAULT 0.00 COMMENT 'USD',
  credito_id            BIGINT UNSIGNED NULL,
  estado                ENUM('APLICADO','ANULADO') NOT NULL DEFAULT 'APLICADO',
  usuario_id            BIGINT UNSIGNED NOT NULL,
  fecha                 DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  creado_en             DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  actualizado_en        DATETIME(3) NULL ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY ix_pagos_venta (venta_id),
  KEY ix_pagos_sucursal (sucursal_id),
  KEY ix_pagos_turno (turno_caja_id),
  KEY ix_pagos_metodo (metodo_pago_id),
  KEY ix_pagos_credito (credito_id),
  KEY ix_pagos_usuario (usuario_id),
  CONSTRAINT ck_pagos_monto     CHECK (monto_moneda > 0),
  CONSTRAINT ck_pagos_tasa      CHECK (tasa_aplicada > 0),
  CONSTRAINT ck_pagos_monto_usd CHECK (monto_usd > 0),
  CONSTRAINT fk_pagos_venta   FOREIGN KEY (venta_id)       REFERENCES ventas(id)       ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_pagos_sucursal FOREIGN KEY (sucursal_id)   REFERENCES sucursales(id)   ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_pagos_turno   FOREIGN KEY (turno_caja_id)  REFERENCES turnos_caja(id)  ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_pagos_metodo  FOREIGN KEY (metodo_pago_id) REFERENCES metodos_pago(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_pagos_credito FOREIGN KEY (credito_id)     REFERENCES creditos(id)     ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_pagos_usuario FOREIGN KEY (usuario_id)     REFERENCES usuarios(id)     ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Pagos de una venta (mixto entre monedas)';

CREATE TABLE abonos (
  id                 BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  sucursal_id        BIGINT UNSIGNED NOT NULL,
  cliente_id         BIGINT UNSIGNED NOT NULL,
  turno_caja_id      BIGINT UNSIGNED NOT NULL,
  metodo_pago_id     BIGINT UNSIGNED NOT NULL,
  usuario_id         BIGINT UNSIGNED NOT NULL,
  prefijo            VARCHAR(8) NOT NULL DEFAULT '',
  numero             BIGINT UNSIGNED NOT NULL,
  anio               SMALLINT UNSIGNED NOT NULL,
  fecha              DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  moneda             ENUM('USD','VES') NOT NULL,
  monto_moneda       DECIMAL(18,4) NOT NULL,
  tasa_aplicada      DECIMAL(18,6) NOT NULL COMMENT 'Tasa del dia del abono, no la de la venta',
  tasa_cambio_id     BIGINT UNSIGNED NULL,
  monto_usd          DECIMAL(14,2) NOT NULL COMMENT 'Equivalente USD que descuenta del saldo',
  monto_aplicado_usd DECIMAL(14,2) NOT NULL DEFAULT 0.00,
  saldo_a_favor_usd  DECIMAL(14,2) NOT NULL DEFAULT 0.00,
  referencia         VARCHAR(60) NULL,
  observaciones      VARCHAR(255) NULL,
  estado             ENUM('APLICADO','ANULADO') NOT NULL DEFAULT 'APLICADO',
  clave_idempotencia CHAR(36) NULL,
  anulado_en         DATETIME(3) NULL,
  anulado_por        BIGINT UNSIGNED NULL,
  motivo_anulacion   VARCHAR(200) NULL,
  creado_en          DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  actualizado_en     DATETIME(3) NULL ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_abonos_numero (sucursal_id, anio, prefijo, numero),
  UNIQUE KEY uq_abonos_idem (clave_idempotencia),
  KEY ix_abonos_cliente (cliente_id, fecha),
  KEY ix_abonos_turno (turno_caja_id),
  KEY ix_abonos_metodo (metodo_pago_id),
  KEY ix_abonos_usuario (usuario_id),
  KEY ix_abonos_tasa (tasa_cambio_id),
  KEY ix_abonos_anulado (anulado_por),
  CONSTRAINT ck_abonos_monto     CHECK (monto_moneda > 0),
  CONSTRAINT ck_abonos_tasa      CHECK (tasa_aplicada > 0),
  CONSTRAINT ck_abonos_monto_usd CHECK (monto_usd > 0),
  CONSTRAINT fk_abonos_sucursal FOREIGN KEY (sucursal_id)    REFERENCES sucursales(id)   ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_abonos_cliente  FOREIGN KEY (cliente_id)     REFERENCES clientes(id)     ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_abonos_turno    FOREIGN KEY (turno_caja_id)  REFERENCES turnos_caja(id)  ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_abonos_metodo   FOREIGN KEY (metodo_pago_id) REFERENCES metodos_pago(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_abonos_usuario  FOREIGN KEY (usuario_id)     REFERENCES usuarios(id)     ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_abonos_anulado  FOREIGN KEY (anulado_por)    REFERENCES usuarios(id)     ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_abonos_tasa     FOREIGN KEY (tasa_cambio_id) REFERENCES tasas_cambio(id) ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Abonos de clientes a su cartera';

CREATE TABLE abono_aplicaciones (
  id                  BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  abono_id            BIGINT UNSIGNED NOT NULL,
  credito_id          BIGINT UNSIGNED NOT NULL,
  monto_usd           DECIMAL(14,2) NOT NULL,
  saldo_anterior_usd  DECIMAL(14,2) NOT NULL,
  saldo_posterior_usd DECIMAL(14,2) NOT NULL,
  creado_en           DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_abap (abono_id, credito_id),
  KEY ix_abap_credito (credito_id),
  CONSTRAINT ck_abap_monto CHECK (monto_usd > 0),
  CONSTRAINT fk_abap_abono   FOREIGN KEY (abono_id)   REFERENCES abonos(id)   ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_abap_credito FOREIGN KEY (credito_id) REFERENCES creditos(id) ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Aplicacion FIFO de abonos a creditos';

-- =============================================================================
-- 6. DEVOLUCIONES, AJUSTES, LEDGER DE INVENTARIO Y CAJA
-- =============================================================================

CREATE TABLE devoluciones (
  id                    BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  sucursal_id           BIGINT UNSIGNED NOT NULL,
  tipo                  ENUM('VENTA','COMPRA') NOT NULL,
  venta_id              BIGINT UNSIGNED NULL,
  compra_id             BIGINT UNSIGNED NULL,
  cliente_id            BIGINT UNSIGNED NULL,
  proveedor_id          BIGINT UNSIGNED NULL,
  turno_caja_id         BIGINT UNSIGNED NULL,
  usuario_id            BIGINT UNSIGNED NOT NULL,
  autorizado_por        BIGINT UNSIGNED NULL,
  prefijo               VARCHAR(8) NOT NULL DEFAULT '',
  numero                BIGINT UNSIGNED NOT NULL,
  anio                  SMALLINT UNSIGNED NOT NULL,
  fecha                 DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  motivo                VARCHAR(200) NOT NULL,
  subtotal              DECIMAL(14,2) NOT NULL DEFAULT 0.00 COMMENT 'USD',
  impuesto_total        DECIMAL(14,2) NOT NULL DEFAULT 0.00 COMMENT 'USD',
  total_usd             DECIMAL(14,2) NOT NULL DEFAULT 0.00 COMMENT 'USD',
  tasa_cambio           DECIMAL(18,6) NOT NULL COMMENT 'Copiada de la venta/compra original',
  total_bs              DECIMAL(18,2) NOT NULL DEFAULT 0.00,
  moneda_reintegro      ENUM('USD','VES') NULL,
  monto_reintegro_moneda DECIMAL(18,4) NULL,
  costo_total           DECIMAL(14,2) NOT NULL DEFAULT 0.00 COMMENT 'USD del snapshot original',
  utilidad_revertida    DECIMAL(14,2) NOT NULL DEFAULT 0.00 COMMENT 'USD del snapshot original',
  forma_reintegro       ENUM('EFECTIVO','NOTA_CREDITO','ABONO_CREDITO','CAMBIO_PRODUCTO') NOT NULL DEFAULT 'EFECTIVO',
  estado                ENUM('APLICADA','ANULADA') NOT NULL DEFAULT 'APLICADA',
  clave_idempotencia    CHAR(36) NULL,
  creado_en             DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  actualizado_en        DATETIME(3) NULL ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_dev_numero (sucursal_id, tipo, anio, prefijo, numero),
  UNIQUE KEY uq_dev_idem (clave_idempotencia),
  KEY ix_dev_venta (venta_id),
  KEY ix_dev_compra (compra_id),
  KEY ix_dev_cliente (cliente_id),
  KEY ix_dev_proveedor (proveedor_id),
  KEY ix_dev_turno (turno_caja_id),
  KEY ix_dev_usuario (usuario_id),
  KEY ix_dev_autorizado (autorizado_por),
  CONSTRAINT ck_dev_origen CHECK ((venta_id IS NOT NULL) + (compra_id IS NOT NULL) = 1),
  CONSTRAINT fk_dev_sucursal   FOREIGN KEY (sucursal_id)   REFERENCES sucursales(id)  ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_dev_venta      FOREIGN KEY (venta_id)      REFERENCES ventas(id)      ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_dev_compra     FOREIGN KEY (compra_id)     REFERENCES compras(id)     ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_dev_cliente    FOREIGN KEY (cliente_id)    REFERENCES clientes(id)    ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_dev_proveedor  FOREIGN KEY (proveedor_id)  REFERENCES proveedores(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_dev_turno      FOREIGN KEY (turno_caja_id) REFERENCES turnos_caja(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_dev_usuario    FOREIGN KEY (usuario_id)    REFERENCES usuarios(id)    ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_dev_autorizado FOREIGN KEY (autorizado_por) REFERENCES usuarios(id)   ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Devoluciones de venta y de compra';

CREATE TABLE devolucion_detalle (
  id                     BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  devolucion_id          BIGINT UNSIGNED NOT NULL,
  linea                  SMALLINT UNSIGNED NOT NULL,
  venta_detalle_id       BIGINT UNSIGNED NULL,
  compra_detalle_id      BIGINT UNSIGNED NULL,
  producto_id            BIGINT UNSIGNED NOT NULL,
  descripcion            VARCHAR(160) NOT NULL,
  cantidad               DECIMAL(14,3) NOT NULL,
  precio_compra_unitario DECIMAL(14,4) NOT NULL COMMENT 'USD, copiado del renglon original',
  precio_venta_unitario  DECIMAL(14,4) NOT NULL COMMENT 'USD, copiado del renglon original',
  descuento_unitario     DECIMAL(14,4) NOT NULL DEFAULT 0.0000 COMMENT 'USD',
  impuesto_tasa          DECIMAL(6,3) NOT NULL DEFAULT 0.000,
  impuesto_monto         DECIMAL(14,2) NOT NULL DEFAULT 0.00 COMMENT 'USD',
  base_gravable          DECIMAL(14,2) NOT NULL COMMENT 'USD',
  costo_total            DECIMAL(14,2) NOT NULL COMMENT 'USD',
  utilidad_revertida     DECIMAL(14,2) NOT NULL COMMENT 'USD',
  total_linea            DECIMAL(14,2) NOT NULL COMMENT 'USD',
  es_reingresa_stock     TINYINT(1) NOT NULL DEFAULT 1,
  motivo_id             BIGINT UNSIGNED NULL,
  creado_en             DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_devdet_linea (devolucion_id, linea),
  KEY ix_devdet_vdet (venta_detalle_id),
  KEY ix_devdet_cdet (compra_detalle_id),
  KEY ix_devdet_producto (producto_id),
  KEY ix_devdet_motivo (motivo_id),
  CONSTRAINT ck_devdet_cantidad CHECK (cantidad > 0),
  CONSTRAINT fk_devdet_dev      FOREIGN KEY (devolucion_id)     REFERENCES devoluciones(id)   ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_devdet_vdet     FOREIGN KEY (venta_detalle_id)  REFERENCES venta_detalle(id)  ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_devdet_cdet     FOREIGN KEY (compra_detalle_id) REFERENCES compra_detalle(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_devdet_producto FOREIGN KEY (producto_id)       REFERENCES productos(id)      ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_devdet_motivo   FOREIGN KEY (motivo_id)         REFERENCES motivos_ajuste(id) ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Renglones de devolucion';

CREATE TABLE ajustes_inventario (
  id                 BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  sucursal_id        BIGINT UNSIGNED NOT NULL,
  usuario_id         BIGINT UNSIGNED NOT NULL,
  autorizado_por     BIGINT UNSIGNED NULL,
  motivo_id          BIGINT UNSIGNED NOT NULL,
  prefijo            VARCHAR(8) NOT NULL DEFAULT '',
  numero             BIGINT UNSIGNED NOT NULL,
  anio               SMALLINT UNSIGNED NOT NULL,
  tipo               ENUM('AJUSTE_MANUAL','CONTEO_FISICO','MERMA','TRASLADO') NOT NULL DEFAULT 'AJUSTE_MANUAL',
  fecha              DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  observaciones      VARCHAR(255) NULL,
  valor_total_ajuste DECIMAL(14,2) NOT NULL DEFAULT 0.00 COMMENT 'USD',
  estado             ENUM('BORRADOR','APLICADO','ANULADO') NOT NULL DEFAULT 'BORRADOR',
  creado_en          DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  actualizado_en     DATETIME(3) NULL ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_ajuste_numero (sucursal_id, anio, prefijo, numero),
  KEY ix_ajuste_usuario (usuario_id),
  KEY ix_ajuste_autorizado (autorizado_por),
  KEY ix_ajuste_motivo (motivo_id),
  CONSTRAINT fk_ajuste_sucursal   FOREIGN KEY (sucursal_id)    REFERENCES sucursales(id)     ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_ajuste_usuario    FOREIGN KEY (usuario_id)     REFERENCES usuarios(id)       ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_ajuste_autorizado FOREIGN KEY (autorizado_por) REFERENCES usuarios(id)       ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_ajuste_motivo     FOREIGN KEY (motivo_id)      REFERENCES motivos_ajuste(id) ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Ajustes de inventario';

CREATE TABLE ajuste_detalle (
  id               BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  ajuste_id        BIGINT UNSIGNED NOT NULL,
  linea            SMALLINT UNSIGNED NOT NULL,
  producto_id      BIGINT UNSIGNED NOT NULL,
  descripcion      VARCHAR(160) NOT NULL,
  cantidad_sistema DECIMAL(14,3) NOT NULL,
  cantidad_contada DECIMAL(14,3) NOT NULL,
  diferencia       DECIMAL(14,3) NOT NULL,
  costo_unitario   DECIMAL(14,4) NOT NULL COMMENT 'USD',
  valor_diferencia DECIMAL(14,2) NOT NULL COMMENT 'USD',
  motivo_id        BIGINT UNSIGNED NULL,
  observaciones    VARCHAR(200) NULL,
  creado_en        DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_ajdet_linea (ajuste_id, linea),
  KEY ix_ajdet_producto (producto_id),
  KEY ix_ajdet_motivo (motivo_id),
  CONSTRAINT fk_ajdet_ajuste   FOREIGN KEY (ajuste_id)   REFERENCES ajustes_inventario(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_ajdet_producto FOREIGN KEY (producto_id) REFERENCES productos(id)          ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_ajdet_motivo   FOREIGN KEY (motivo_id)   REFERENCES motivos_ajuste(id)     ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Renglones de ajuste de inventario';

CREATE TABLE inventario_movimientos (
  id                       BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  sucursal_id              BIGINT UNSIGNED NOT NULL,
  producto_id              BIGINT UNSIGNED NOT NULL,
  tipo                     ENUM('INICIAL','ENTRADA_COMPRA','SALIDA_VENTA','DEVOLUCION_CLIENTE','DEVOLUCION_PROVEEDOR','AJUSTE_POSITIVO','AJUSTE_NEGATIVO','MERMA','TRASLADO_ENTRADA','TRASLADO_SALIDA','ANULACION_VENTA','ANULACION_COMPRA') NOT NULL,
  signo                    TINYINT NOT NULL COMMENT '+1 entrada, -1 salida',
  cantidad                 DECIMAL(14,3) NOT NULL,
  costo_unitario           DECIMAL(14,4) NOT NULL COMMENT 'USD, costo vigente en ese instante',
  costo_total              DECIMAL(14,2) NOT NULL COMMENT 'USD',
  saldo_anterior           DECIMAL(14,3) NOT NULL,
  saldo_posterior          DECIMAL(14,3) NOT NULL,
  costo_promedio_anterior  DECIMAL(14,4) NOT NULL DEFAULT 0.0000 COMMENT 'USD',
  costo_promedio_posterior DECIMAL(14,4) NOT NULL DEFAULT 0.0000 COMMENT 'USD',
  documento_tipo           ENUM('VENTA','COMPRA','AJUSTE','DEVOLUCION','TRASLADO','INICIAL') NOT NULL,
  venta_id                 BIGINT UNSIGNED NULL,
  compra_id                BIGINT UNSIGNED NULL,
  ajuste_id                BIGINT UNSIGNED NULL,
  devolucion_id            BIGINT UNSIGNED NULL,
  motivo_id                BIGINT UNSIGNED NULL,
  usuario_id               BIGINT UNSIGNED NOT NULL,
  nota                     VARCHAR(255) NULL,
  creado_en                DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY ix_mov_prod_suc_fecha (producto_id, sucursal_id, creado_en),
  KEY ix_mov_suc_fecha_tipo (sucursal_id, creado_en, tipo),
  KEY ix_mov_venta (venta_id),
  KEY ix_mov_compra (compra_id),
  KEY ix_mov_ajuste (ajuste_id),
  KEY ix_mov_devolucion (devolucion_id),
  KEY ix_mov_motivo (motivo_id),
  KEY ix_mov_usuario (usuario_id),
  CONSTRAINT ck_mov_signo    CHECK (signo IN (-1,1)),
  CONSTRAINT ck_mov_cantidad CHECK (cantidad > 0),
  CONSTRAINT ck_mov_docs     CHECK ((venta_id IS NOT NULL)+(compra_id IS NOT NULL)+(ajuste_id IS NOT NULL)+(devolucion_id IS NOT NULL) <= 1),
  CONSTRAINT fk_mov_sucursal   FOREIGN KEY (sucursal_id)   REFERENCES sucursales(id)         ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_mov_producto   FOREIGN KEY (producto_id)   REFERENCES productos(id)          ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_mov_venta      FOREIGN KEY (venta_id)      REFERENCES ventas(id)             ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_mov_compra     FOREIGN KEY (compra_id)     REFERENCES compras(id)            ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_mov_ajuste     FOREIGN KEY (ajuste_id)     REFERENCES ajustes_inventario(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_mov_devolucion FOREIGN KEY (devolucion_id) REFERENCES devoluciones(id)       ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_mov_motivo     FOREIGN KEY (motivo_id)     REFERENCES motivos_ajuste(id)     ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_mov_usuario    FOREIGN KEY (usuario_id)    REFERENCES usuarios(id)           ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Ledger inmutable de inventario (solo INSERT)';

CREATE TABLE movimientos_caja (
  id             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  turno_caja_id  BIGINT UNSIGNED NOT NULL,
  sucursal_id    BIGINT UNSIGNED NOT NULL,
  tipo           ENUM('BASE','VENTA','ABONO','INGRESO','EGRESO','RETIRO','DEVOLUCION','VUELTAS','AJUSTE') NOT NULL,
  signo          TINYINT NOT NULL COMMENT '+1 entra, -1 sale',
  moneda         ENUM('USD','VES') NOT NULL,
  monto_moneda   DECIMAL(18,4) NOT NULL,
  tasa_aplicada  DECIMAL(18,6) NOT NULL,
  monto_usd      DECIMAL(14,2) NOT NULL COMMENT 'Equivalente USD, solo para reportes; nunca en el arqueo',
  metodo_pago_id BIGINT UNSIGNED NULL,
  concepto       VARCHAR(200) NOT NULL,
  documento_tipo ENUM('VENTA','ABONO','DEVOLUCION','MANUAL') NOT NULL DEFAULT 'MANUAL',
  documento_id   BIGINT UNSIGNED NULL,
  usuario_id     BIGINT UNSIGNED NOT NULL,
  autorizado_por BIGINT UNSIGNED NULL,
  fecha          DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  creado_en      DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY ix_mc_turno (turno_caja_id),
  KEY ix_mc_sucursal (sucursal_id),
  KEY ix_mc_metodo (metodo_pago_id),
  KEY ix_mc_usuario (usuario_id),
  KEY ix_mc_autorizado (autorizado_por),
  CONSTRAINT ck_mc_monto CHECK (monto_moneda > 0),
  CONSTRAINT ck_mc_tasa  CHECK (tasa_aplicada > 0),
  CONSTRAINT fk_mc_turno    FOREIGN KEY (turno_caja_id)  REFERENCES turnos_caja(id)  ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_mc_sucursal FOREIGN KEY (sucursal_id)    REFERENCES sucursales(id)   ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_mc_metodo   FOREIGN KEY (metodo_pago_id) REFERENCES metodos_pago(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_mc_usuario  FOREIGN KEY (usuario_id)     REFERENCES usuarios(id)     ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_mc_autorizado FOREIGN KEY (autorizado_por) REFERENCES usuarios(id)   ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Movimientos de efectivo del turno, por moneda';

-- =============================================================================
-- 7. AUDITORIA, IDEMPOTENCIA, AGREGADOS Y CONTROL
-- =============================================================================

CREATE TABLE auditoria (
  id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  ocurrido_en   DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  usuario_id    BIGINT UNSIGNED NULL,
  sucursal_id   BIGINT UNSIGNED NULL,
  accion        ENUM('CREAR','ACTUALIZAR','ELIMINAR','ANULAR','LOGIN','LOGIN_FALLIDO','LOGOUT','EXPORTAR','AJUSTE_STOCK','CAMBIO_PRECIO','CAMBIO_COSTO','CAMBIO_TASA','CORRECCION_TASA','CAMBIO_PERMISOS','CAMBIO_CONFIG','RECONCILIACION') NOT NULL,
  entidad       VARCHAR(60) NOT NULL,
  entidad_id    BIGINT UNSIGNED NULL,
  datos_antes   JSON NULL,
  datos_despues JSON NULL,
  ip            VARBINARY(16) NULL,
  user_agent    VARCHAR(255) NULL,
  request_id    CHAR(26) NULL,
  creado_en     DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY ix_aud_entidad (entidad, entidad_id, ocurrido_en),
  KEY ix_aud_usuario (usuario_id, ocurrido_en),
  KEY ix_aud_sucursal (sucursal_id),
  CONSTRAINT fk_aud_usuario  FOREIGN KEY (usuario_id)  REFERENCES usuarios(id)   ON DELETE SET NULL ON UPDATE RESTRICT,
  CONSTRAINT fk_aud_sucursal FOREIGN KEY (sucursal_id) REFERENCES sucursales(id) ON DELETE SET NULL ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Bitacora de auditoria';

CREATE TABLE idempotencia_solicitudes (
  clave          CHAR(36) NOT NULL,
  usuario_id     BIGINT UNSIGNED NOT NULL,
  endpoint       VARCHAR(120) NOT NULL,
  huella_payload CHAR(64) NOT NULL,
  estado         ENUM('EN_PROCESO','COMPLETADA','FALLIDA') NOT NULL DEFAULT 'EN_PROCESO',
  http_status    SMALLINT UNSIGNED NULL,
  respuesta_json JSON NULL,
  recurso_tipo   VARCHAR(40) NULL,
  recurso_id     BIGINT UNSIGNED NULL,
  creado_en      DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  expira_en      DATETIME(3) NOT NULL,
  PRIMARY KEY (clave),
  KEY ix_idem_usuario (usuario_id),
  KEY ix_idem_expira (expira_en),
  CONSTRAINT fk_idem_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Claves de idempotencia del POS';

CREATE TABLE resumen_ventas_diario (
  fecha                   DATE NOT NULL,
  sucursal_id             BIGINT UNSIGNED NOT NULL,
  producto_id             BIGINT UNSIGNED NOT NULL,
  categoria_id            BIGINT UNSIGNED NOT NULL,
  cantidad_vendida        DECIMAL(14,3) NOT NULL DEFAULT 0.000,
  cantidad_devuelta       DECIMAL(14,3) NOT NULL DEFAULT 0.000,
  venta_neta_usd          DECIMAL(14,2) NOT NULL DEFAULT 0.00,
  venta_neta_bs           DECIMAL(18,2) NOT NULL DEFAULT 0.00,
  impuesto_total_usd      DECIMAL(14,2) NOT NULL DEFAULT 0.00,
  impuesto_total_bs       DECIMAL(18,2) NOT NULL DEFAULT 0.00,
  costo_total_usd         DECIMAL(14,2) NOT NULL DEFAULT 0.00,
  costo_total_bs          DECIMAL(18,2) NOT NULL DEFAULT 0.00,
  utilidad_total_usd      DECIMAL(14,2) NOT NULL DEFAULT 0.00,
  utilidad_total_bs       DECIMAL(18,2) NOT NULL DEFAULT 0.00,
  numero_ventas           INT UNSIGNED NOT NULL DEFAULT 0,
  tasa_promedio_ponderada DECIMAL(18,6) NOT NULL DEFAULT 0.000000,
  calculado_en            DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (fecha, sucursal_id, producto_id),
  KEY ix_rvd_suc_fecha (sucursal_id, fecha),
  KEY ix_rvd_producto (producto_id),
  KEY ix_rvd_categoria (categoria_id),
  CONSTRAINT fk_rvd_sucursal  FOREIGN KEY (sucursal_id) REFERENCES sucursales(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_rvd_producto  FOREIGN KEY (producto_id) REFERENCES productos(id)  ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_rvd_categoria FOREIGN KEY (categoria_id) REFERENCES categorias(id) ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Agregado diario de ventas para reportes';

CREATE TABLE trabajos_exportacion (
  id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  usuario_id      BIGINT UNSIGNED NOT NULL,
  sucursal_id     BIGINT UNSIGNED NOT NULL,
  tipo_reporte    VARCHAR(60) NOT NULL,
  formato         ENUM('PDF','EXCEL','CSV') NOT NULL,
  parametros_json JSON NOT NULL,
  estado          ENUM('PENDIENTE','PROCESANDO','COMPLETADO','FALLIDO') NOT NULL DEFAULT 'PENDIENTE',
  archivo_ruta    VARCHAR(255) NULL,
  archivo_bytes   BIGINT UNSIGNED NULL,
  filas_generadas INT UNSIGNED NULL,
  error_mensaje   VARCHAR(500) NULL,
  iniciado_en     DATETIME(3) NULL,
  finalizado_en   DATETIME(3) NULL,
  expira_en       DATETIME(3) NULL,
  creado_en       DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY ix_texp_usuario (usuario_id),
  KEY ix_texp_sucursal (sucursal_id),
  KEY ix_texp_estado (estado),
  CONSTRAINT fk_texp_usuario  FOREIGN KEY (usuario_id)  REFERENCES usuarios(id)   ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_texp_sucursal FOREIGN KEY (sucursal_id) REFERENCES sucursales(id) ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Cola de exportaciones a PDF/Excel';

CREATE TABLE migraciones (
  version      VARCHAR(32)  NOT NULL,
  nombre       VARCHAR(160) NOT NULL,
  checksum     CHAR(64)     NOT NULL,
  aplicada_en  DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  duracion_ms  INT UNSIGNED NOT NULL DEFAULT 0,
  aplicada_por VARCHAR(60)  NULL,
  PRIMARY KEY (version)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Control de migraciones aplicadas';

SET FOREIGN_KEY_CHECKS = 1;
