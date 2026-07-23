-- =============================================================================
-- GochitoSystem — Esquema de base de datos PostgreSQL
-- Motor: PostgreSQL 16
--
-- Modelo BIMONETARIO: moneda base USD, cobro mayoritario en bolivares (VES).
-- =============================================================================

BEGIN;

-- Eliminar tablas existentes (orden inverso de dependencias)
DROP TABLE IF EXISTS migraciones CASCADE;
DROP TABLE IF EXISTS trabajos_exportacion CASCADE;
DROP TABLE IF EXISTS resumen_ventas_diario CASCADE;
DROP TABLE IF EXISTS idempotencia_solicitudes CASCADE;
DROP TABLE IF EXISTS auditoria CASCADE;
DROP TABLE IF EXISTS movimientos_caja CASCADE;
DROP TABLE IF EXISTS inventario_movimientos CASCADE;
DROP TABLE IF EXISTS ajuste_detalle CASCADE;
DROP TABLE IF EXISTS ajustes_inventario CASCADE;
DROP TABLE IF EXISTS devolucion_detalle CASCADE;
DROP TABLE IF EXISTS devoluciones CASCADE;
DROP TABLE IF EXISTS abono_aplicaciones CASCADE;
DROP TABLE IF EXISTS abonos CASCADE;
DROP TABLE IF EXISTS pagos CASCADE;
DROP TABLE IF EXISTS creditos CASCADE;
DROP TABLE IF EXISTS venta_detalle CASCADE;
DROP TABLE IF EXISTS ventas CASCADE;
DROP TABLE IF EXISTS compra_detalle CASCADE;
DROP TABLE IF EXISTS compras CASCADE;
DROP TABLE IF EXISTS consecutivos CASCADE;
DROP TABLE IF EXISTS producto_stock CASCADE;
DROP TABLE IF EXISTS producto_precios CASCADE;
DROP TABLE IF EXISTS producto_codigos CASCADE;
DROP TABLE IF EXISTS productos CASCADE;
DROP TABLE IF EXISTS turnos_caja CASCADE;
DROP TABLE IF EXISTS cajas CASCADE;
DROP TABLE IF EXISTS motivos_ajuste CASCADE;
DROP TABLE IF EXISTS metodos_pago CASCADE;
DROP TABLE IF EXISTS clientes CASCADE;
DROP TABLE IF EXISTS proveedores CASCADE;
DROP TABLE IF EXISTS categorias CASCADE;
DROP TABLE IF EXISTS tasas_cambio CASCADE;
DROP TABLE IF EXISTS parametros CASCADE;
DROP TABLE IF EXISTS configuracion CASCADE;
DROP TABLE IF EXISTS impuestos CASCADE;
DROP TABLE IF EXISTS unidades_medida CASCADE;
DROP TABLE IF EXISTS sesiones CASCADE;
DROP TABLE IF EXISTS usuario_sucursales CASCADE;
DROP TABLE IF EXISTS usuarios CASCADE;
DROP TABLE IF EXISTS rol_permisos CASCADE;
DROP TABLE IF EXISTS permisos CASCADE;
DROP TABLE IF EXISTS roles CASCADE;
DROP TABLE IF EXISTS sucursales CASCADE;

DROP TYPE IF EXISTS motivo_revocacion CASCADE;
DROP TYPE IF EXISTS tipo_impuesto CASCADE;
DROP TYPE IF EXISTS estado_turno CASCADE;
DROP TYPE IF EXISTS tipo_producto CASCADE;
DROP TYPE IF EXISTS tipo_codigo_producto CASCADE;
DROP TYPE IF EXISTS tipo_documento_consecutivo CASCADE;
DROP TYPE IF EXISTS tipo_tasa_fuente CASCADE;
DROP TYPE IF EXISTS tipo_metodo_pago_moneda CASCADE;
DROP TYPE IF EXISTS tipo_metodo_pago_tipo CASCADE;
DROP TYPE IF EXISTS condicion_pago CASCADE;
DROP TYPE IF EXISTS estado_venta CASCADE;
DROP TYPE IF EXISTS estado_compra CASCADE;
DROP TYPE IF EXISTS estado_credito CASCADE;
DROP TYPE IF EXISTS origen_credito CASCADE;
DROP TYPE IF EXISTS estado_abono CASCADE;
DROP TYPE IF EXISTS tipo_movimiento_inventario CASCADE;
DROP TYPE IF EXISTS tipo_documento_movimiento CASCADE;
DROP TYPE IF EXISTS estado_ajuste CASCADE;
DROP TYPE IF EXISTS tipo_ajuste CASCADE;
DROP TYPE IF EXISTS tipo_devolucion CASCADE;
DROP TYPE IF EXISTS forma_reintegro CASCADE;
DROP TYPE IF EXISTS estado_devolucion CASCADE;
DROP TYPE IF EXISTS tipo_movimiento_caja CASCADE;
DROP TYPE IF EXISTS documento_tipo_caja CASCADE;
DROP TYPE IF EXISTS estado_idempotencia CASCADE;
DROP TYPE IF EXISTS estado_exportacion CASCADE;
DROP TYPE IF EXISTS formato_exportacion CASCADE;
DROP TYPE IF EXISTS accion_auditoria CASCADE;
DROP TYPE IF EXISTS tipo_documento_identidad CASCADE;
DROP TYPE IF EXISTS tipo_parametro CASCADE;
DROP TYPE IF EXISTS regimen CASCADE;
DROP TYPE IF EXISTS codigo_rol CASCADE;

-- =============================================================================
-- TRIGGER FUNCTION: actualizar automaticamente actualizado_en
-- =============================================================================
CREATE OR REPLACE FUNCTION actualizar_actualizado_en()
RETURNS TRIGGER AS $$
BEGIN
    NEW.actualizado_en = CURRENT_TIMESTAMP(3);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- ENUM TYPES
-- =============================================================================
CREATE TYPE codigo_rol AS ENUM ('ADMIN', 'SUPERVISOR', 'CAJERO', 'BODEGUERO');
CREATE TYPE motivo_revocacion AS ENUM ('LOGOUT', 'ROTACION', 'REUSO_DETECTADO', 'ADMIN', 'EXPIRACION');
CREATE TYPE tipo_impuesto AS ENUM ('GRAVADO', 'EXENTO', 'EXCLUIDO', 'NO_APLICA');
CREATE TYPE estado_turno AS ENUM ('ABIERTO', 'CERRADO', 'CUADRADO');
CREATE TYPE tipo_producto AS ENUM ('SIMPLE', 'SERVICIO', 'COMPUESTO');
CREATE TYPE tipo_codigo_producto AS ENUM ('EAN13', 'EAN8', 'UPC', 'INTERNO', 'BALANZA', 'PLU');
CREATE TYPE tipo_documento_consecutivo AS ENUM ('VENTA', 'COMPRA', 'ABONO', 'DEVOLUCION_VENTA', 'DEVOLUCION_COMPRA', 'AJUSTE', 'TRASLADO');
CREATE TYPE tipo_tasa_fuente AS ENUM ('MANUAL', 'BCV', 'PARALELO', 'OTRO');
CREATE TYPE tipo_metodo_pago_moneda AS ENUM ('USD', 'VES');
CREATE TYPE tipo_metodo_pago_tipo AS ENUM ('EFECTIVO', 'TARJETA_DEBITO', 'TARJETA_CREDITO', 'TRANSFERENCIA', 'PAGO_MOVIL', 'CRIPTO', 'CREDITO', 'BONO', 'OTRO');
CREATE TYPE condicion_pago AS ENUM ('CONTADO', 'CREDITO');
CREATE TYPE estado_venta AS ENUM ('ABIERTA', 'CERRADA', 'ANULADA');
CREATE TYPE estado_compra AS ENUM ('BORRADOR', 'RECIBIDA', 'ANULADA');
CREATE TYPE estado_credito AS ENUM ('PENDIENTE', 'PARCIAL', 'PAGADO', 'VENCIDO', 'ANULADO');
CREATE TYPE origen_credito AS ENUM ('VENTA', 'SALDO_INICIAL', 'NOTA_DEBITO', 'AJUSTE');
CREATE TYPE estado_abono AS ENUM ('APLICADO', 'ANULADO');
CREATE TYPE tipo_movimiento_inventario AS ENUM ('INICIAL', 'ENTRADA_COMPRA', 'SALIDA_VENTA', 'DEVOLUCION_CLIENTE', 'DEVOLUCION_PROVEEDOR', 'AJUSTE_POSITIVO', 'AJUSTE_NEGATIVO', 'MERMA', 'TRASLADO_ENTRADA', 'TRASLADO_SALIDA', 'ANULACION_VENTA', 'ANULACION_COMPRA');
CREATE TYPE tipo_documento_movimiento AS ENUM ('VENTA', 'COMPRA', 'AJUSTE', 'DEVOLUCION', 'TRASLADO', 'INICIAL');
CREATE TYPE estado_ajuste AS ENUM ('BORRADOR', 'APLICADO', 'ANULADO');
CREATE TYPE tipo_ajuste AS ENUM ('AJUSTE_MANUAL', 'CONTEO_FISICO', 'MERMA', 'TRASLADO');
CREATE TYPE tipo_devolucion AS ENUM ('VENTA', 'COMPRA');
CREATE TYPE forma_reintegro AS ENUM ('EFECTIVO', 'NOTA_CREDITO', 'ABONO_CREDITO', 'CAMBIO_PRODUCTO');
CREATE TYPE estado_devolucion AS ENUM ('APLICADA', 'ANULADA');
CREATE TYPE tipo_movimiento_caja AS ENUM ('BASE', 'VENTA', 'ABONO', 'INGRESO', 'EGRESO', 'RETIRO', 'DEVOLUCION', 'VUELTAS', 'AJUSTE');
CREATE TYPE documento_tipo_caja AS ENUM ('VENTA', 'ABONO', 'DEVOLUCION', 'MANUAL');
CREATE TYPE estado_idempotencia AS ENUM ('EN_PROCESO', 'COMPLETADA', 'FALLIDA');
CREATE TYPE estado_exportacion AS ENUM ('PENDIENTE', 'PROCESANDO', 'COMPLETADO', 'FALLIDO');
CREATE TYPE formato_exportacion AS ENUM ('PDF', 'EXCEL', 'CSV');
CREATE TYPE accion_auditoria AS ENUM ('CREAR', 'ACTUALIZAR', 'ELIMINAR', 'ANULAR', 'LOGIN', 'LOGIN_FALLIDO', 'LOGOUT', 'EXPORTAR', 'AJUSTE_STOCK', 'CAMBIO_PRECIO', 'CAMBIO_COSTO', 'CAMBIO_TASA', 'CORRECCION_TASA', 'CAMBIO_PERMISOS', 'CAMBIO_CONFIG', 'RECONCILIACION');
CREATE TYPE tipo_documento_identidad AS ENUM ('CC', 'CE', 'NIT', 'PASAPORTE', 'SIN_IDENTIFICAR');
CREATE TYPE tipo_parametro AS ENUM ('STRING', 'INT', 'DECIMAL', 'BOOL', 'JSON');
CREATE TYPE regimen AS ENUM ('SIMPLIFICADO', 'COMUN', 'SIMPLE', 'NO_APLICA');

-- =============================================================================
-- 1. SEGURIDAD Y ORGANIZACION
-- =============================================================================

CREATE TABLE sucursales (
  id             BIGINT GENERATED BY DEFAULT AS IDENTITY NOT NULL,
  codigo         VARCHAR(20)  NOT NULL,
  nombre         VARCHAR(120) NOT NULL,
  direccion      VARCHAR(200),
  telefono       VARCHAR(40),
  es_principal   BOOLEAN      NOT NULL DEFAULT FALSE,
  esta_activa    BOOLEAN      NOT NULL DEFAULT TRUE,
  creado_en      TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_en TIMESTAMPTZ(3),
  eliminado_en   TIMESTAMPTZ(3),
  PRIMARY KEY (id)
);

CREATE UNIQUE INDEX uq_sucursales_codigo ON sucursales (codigo) WHERE eliminado_en IS NULL;

CREATE TABLE roles (
  id             BIGINT GENERATED BY DEFAULT AS IDENTITY NOT NULL,
  codigo         codigo_rol   NOT NULL,
  nombre         VARCHAR(80)  NOT NULL,
  descripcion    VARCHAR(200),
  es_sistema     BOOLEAN      NOT NULL DEFAULT FALSE,
  esta_activo    BOOLEAN      NOT NULL DEFAULT TRUE,
  creado_en      TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_en TIMESTAMPTZ(3),
  eliminado_en   TIMESTAMPTZ(3),
  PRIMARY KEY (id)
);

CREATE UNIQUE INDEX uq_roles_codigo ON roles (codigo) WHERE eliminado_en IS NULL;

CREATE TABLE permisos (
  id          BIGINT GENERATED BY DEFAULT AS IDENTITY NOT NULL,
  codigo      VARCHAR(60)  NOT NULL,
  modulo      VARCHAR(40)  NOT NULL,
  accion      VARCHAR(40)  NOT NULL,
  descripcion VARCHAR(200),
  creado_en   TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id)
);

CREATE UNIQUE INDEX uq_permisos_codigo ON permisos (codigo);
CREATE INDEX ix_permisos_modulo ON permisos (modulo);

CREATE TABLE rol_permisos (
  rol_id     BIGINT NOT NULL,
  permiso_id BIGINT NOT NULL,
  creado_en  TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (rol_id, permiso_id)
);

CREATE INDEX ix_rp_permiso ON rol_permisos (permiso_id);
ALTER TABLE rol_permisos ADD CONSTRAINT fk_rp_rol     FOREIGN KEY (rol_id)     REFERENCES roles(id)    ON DELETE RESTRICT;
ALTER TABLE rol_permisos ADD CONSTRAINT fk_rp_permiso FOREIGN KEY (permiso_id) REFERENCES permisos(id) ON DELETE RESTRICT;

CREATE TABLE usuarios (
  id                         BIGINT GENERATED BY DEFAULT AS IDENTITY NOT NULL,
  usuario                    VARCHAR(60)  NOT NULL,
  email                      VARCHAR(160),
  nombre_completo            VARCHAR(140) NOT NULL,
  documento                  VARCHAR(30),
  telefono                   VARCHAR(40),
  password_hash              CHAR(60)     NOT NULL,
  rol_id                     BIGINT NOT NULL,
  sucursal_predeterminada_id BIGINT,
  intentos_fallidos          INTEGER      NOT NULL DEFAULT 0 CHECK (intentos_fallidos >= 0),
  bloqueado_hasta            TIMESTAMPTZ(3),
  ultimo_acceso_en           TIMESTAMPTZ(3),
  debe_cambiar_password      BOOLEAN      NOT NULL DEFAULT FALSE,
  esta_activo                BOOLEAN      NOT NULL DEFAULT TRUE,
  creado_en                  TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_en             TIMESTAMPTZ(3),
  eliminado_en               TIMESTAMPTZ(3),
  PRIMARY KEY (id)
);

CREATE UNIQUE INDEX uq_usuarios_usuario ON usuarios (usuario) WHERE eliminado_en IS NULL;
CREATE UNIQUE INDEX uq_usuarios_email ON usuarios (email) WHERE eliminado_en IS NULL AND email IS NOT NULL;
CREATE INDEX ix_usuarios_rol ON usuarios (rol_id);
CREATE INDEX ix_usuarios_sucursal ON usuarios (sucursal_predeterminada_id);
ALTER TABLE usuarios ADD CONSTRAINT fk_usuarios_rol      FOREIGN KEY (rol_id)                     REFERENCES roles(id)      ON DELETE RESTRICT;
ALTER TABLE usuarios ADD CONSTRAINT fk_usuarios_sucursal FOREIGN KEY (sucursal_predeterminada_id) REFERENCES sucursales(id) ON DELETE SET NULL;

CREATE TRIGGER trg_usuarios_actualizado BEFORE UPDATE ON usuarios FOR EACH ROW EXECUTE FUNCTION actualizar_actualizado_en();

CREATE TABLE usuario_sucursales (
  usuario_id  BIGINT NOT NULL,
  sucursal_id BIGINT NOT NULL,
  rol_id      BIGINT NOT NULL,
  creado_en   TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (usuario_id, sucursal_id)
);

CREATE INDEX ix_us_sucursal ON usuario_sucursales (sucursal_id);
CREATE INDEX ix_us_rol ON usuario_sucursales (rol_id);
ALTER TABLE usuario_sucursales ADD CONSTRAINT fk_us_usuario  FOREIGN KEY (usuario_id)  REFERENCES usuarios(id)   ON DELETE RESTRICT;
ALTER TABLE usuario_sucursales ADD CONSTRAINT fk_us_sucursal FOREIGN KEY (sucursal_id) REFERENCES sucursales(id) ON DELETE RESTRICT;
ALTER TABLE usuario_sucursales ADD CONSTRAINT fk_us_rol      FOREIGN KEY (rol_id)      REFERENCES roles(id)      ON DELETE RESTRICT;

CREATE TABLE sesiones (
  id                 BIGINT GENERATED BY DEFAULT AS IDENTITY NOT NULL,
  usuario_id         BIGINT NOT NULL,
  token_hash         CHAR(64)     NOT NULL,
  familia_id         UUID         NOT NULL,
  reemplazada_por_id BIGINT,
  ip                 INET,
  user_agent         VARCHAR(255),
  expira_en          TIMESTAMPTZ(3) NOT NULL,
  revocada_en        TIMESTAMPTZ(3),
  motivo_revocacion  motivo_revocacion,
  creado_en          TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id)
);

CREATE UNIQUE INDEX uq_sesiones_token ON sesiones (token_hash);
CREATE INDEX ix_sesiones_usuario ON sesiones (usuario_id);
CREATE INDEX ix_sesiones_familia ON sesiones (familia_id);
ALTER TABLE sesiones ADD CONSTRAINT fk_sesiones_usuario   FOREIGN KEY (usuario_id)         REFERENCES usuarios(id) ON DELETE RESTRICT;
ALTER TABLE sesiones ADD CONSTRAINT fk_sesiones_reemplazo FOREIGN KEY (reemplazada_por_id) REFERENCES sesiones(id) ON DELETE SET NULL;

-- =============================================================================
-- 2. CATALOGOS BASE
-- =============================================================================

CREATE TABLE unidades_medida (
  id                  BIGINT GENERATED BY DEFAULT AS IDENTITY NOT NULL,
  codigo              VARCHAR(10) NOT NULL,
  nombre              VARCHAR(60) NOT NULL,
  es_permite_fraccion BOOLEAN     NOT NULL DEFAULT FALSE,
  decimales           INTEGER     NOT NULL DEFAULT 0 CHECK (decimales >= 0),
  esta_activa         BOOLEAN     NOT NULL DEFAULT TRUE,
  creado_en           TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_en      TIMESTAMPTZ(3),
  eliminado_en        TIMESTAMPTZ(3),
  PRIMARY KEY (id)
);

CREATE UNIQUE INDEX uq_um_codigo ON unidades_medida (codigo) WHERE eliminado_en IS NULL;
CREATE TRIGGER trg_um_actualizado BEFORE UPDATE ON unidades_medida FOR EACH ROW EXECUTE FUNCTION actualizar_actualizado_en();

CREATE TABLE impuestos (
  id             BIGINT GENERATED BY DEFAULT AS IDENTITY NOT NULL,
  codigo         VARCHAR(20) NOT NULL,
  nombre         VARCHAR(80) NOT NULL,
  tasa           DECIMAL(6,3) NOT NULL DEFAULT 0 CHECK (tasa >= 0 AND tasa <= 100),
  tipo           tipo_impuesto NOT NULL DEFAULT 'GRAVADO',
  vigente_desde  DATE NOT NULL,
  vigente_hasta  DATE,
  esta_activo    BOOLEAN     NOT NULL DEFAULT TRUE,
  creado_en      TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_en TIMESTAMPTZ(3),
  eliminado_en   TIMESTAMPTZ(3),
  PRIMARY KEY (id)
);

CREATE UNIQUE INDEX uq_impuestos_codigo ON impuestos (codigo) WHERE eliminado_en IS NULL;
CREATE TRIGGER trg_impuestos_actualizado BEFORE UPDATE ON impuestos FOR EACH ROW EXECUTE FUNCTION actualizar_actualizado_en();

CREATE TABLE configuracion (
  id                              INTEGER NOT NULL DEFAULT 1 CHECK (id = 1),
  nombre_negocio                  VARCHAR(120) NOT NULL,
  razon_social                    VARCHAR(160),
  nit                             VARCHAR(32),
  regimen                         regimen NOT NULL DEFAULT 'NO_APLICA',
  logo_ruta                       VARCHAR(255),
  direccion                       VARCHAR(200),
  telefono                        VARCHAR(40),
  email                           VARCHAR(160),
  moneda_base                     CHAR(3) NOT NULL DEFAULT 'USD',
  moneda_secundaria               CHAR(3) NOT NULL DEFAULT 'VES',
  moneda_base_simbolo             VARCHAR(5) NOT NULL DEFAULT '$',
  moneda_secundaria_simbolo       VARCHAR(5) NOT NULL DEFAULT 'Bs',
  decimales_usd                   INTEGER NOT NULL DEFAULT 2 CHECK (decimales_usd >= 0),
  decimales_bs                    INTEGER NOT NULL DEFAULT 2 CHECK (decimales_bs >= 0),
  redondeo_bs_multiplo            DECIMAL(10,2) NOT NULL DEFAULT 0,
  es_bloquea_venta_sin_tasa       BOOLEAN NOT NULL DEFAULT TRUE,
  impuesto_predeterminado_id      BIGINT,
  es_precio_incluye_impuesto      BOOLEAN NOT NULL DEFAULT TRUE,
  redondeo_multiplo               INTEGER NOT NULL DEFAULT 50 CHECK (redondeo_multiplo > 0),
  ticket_encabezado               VARCHAR(255),
  ticket_pie                      VARCHAR(255),
  ticket_mensaje_legal            VARCHAR(255),
  es_ticket_mostrar_logo          BOOLEAN NOT NULL DEFAULT TRUE,
  es_ticket_mostrar_nit           BOOLEAN NOT NULL DEFAULT TRUE,
  es_ticket_muestra_ambas_monedas BOOLEAN NOT NULL DEFAULT TRUE,
  es_ticket_muestra_tasa          BOOLEAN NOT NULL DEFAULT TRUE,
  ticket_ancho_mm                 INTEGER NOT NULL DEFAULT 80 CHECK (ticket_ancho_mm > 0),
  es_credito_requiere_autorizacion BOOLEAN NOT NULL DEFAULT FALSE,
  es_permite_stock_negativo       BOOLEAN NOT NULL DEFAULT FALSE,
  dias_plazo_credito_defecto      INTEGER NOT NULL DEFAULT 30 CHECK (dias_plazo_credito_defecto >= 0),
  zona_horaria                    VARCHAR(40) NOT NULL DEFAULT 'America/Caracas',
  actualizado_por                 BIGINT,
  creado_en                       TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_en                  TIMESTAMPTZ(3),
  PRIMARY KEY (id)
);

CREATE INDEX ix_config_impuesto ON configuracion (impuesto_predeterminado_id);
CREATE INDEX ix_config_usuario ON configuracion (actualizado_por);
ALTER TABLE configuracion ADD CONSTRAINT fk_config_impuesto FOREIGN KEY (impuesto_predeterminado_id) REFERENCES impuestos(id) ON DELETE RESTRICT;
ALTER TABLE configuracion ADD CONSTRAINT fk_config_usuario  FOREIGN KEY (actualizado_por)            REFERENCES usuarios(id)  ON DELETE SET NULL;

CREATE TABLE parametros (
  clave           VARCHAR(64)  NOT NULL,
  valor           VARCHAR(255) NOT NULL,
  tipo            tipo_parametro NOT NULL DEFAULT 'STRING',
  descripcion     VARCHAR(200),
  es_editable     BOOLEAN      NOT NULL DEFAULT TRUE,
  actualizado_por BIGINT,
  creado_en       TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_en  TIMESTAMPTZ(3),
  PRIMARY KEY (clave)
);

CREATE INDEX ix_parametros_usuario ON parametros (actualizado_por);
ALTER TABLE parametros ADD CONSTRAINT fk_parametros_usuario FOREIGN KEY (actualizado_por) REFERENCES usuarios(id) ON DELETE SET NULL;
CREATE TRIGGER trg_parametros_actualizado BEFORE UPDATE ON parametros FOR EACH ROW EXECUTE FUNCTION actualizar_actualizado_en();

CREATE TABLE tasas_cambio (
  id              BIGINT GENERATED BY DEFAULT AS IDENTITY NOT NULL,
  fecha           DATE NOT NULL,
  tasa            DECIMAL(18,6) NOT NULL CHECK (tasa > 0),
  fuente          tipo_tasa_fuente NOT NULL DEFAULT 'MANUAL',
  es_correccion   BOOLEAN NOT NULL DEFAULT FALSE,
  corrige_tasa_id BIGINT,
  notas           VARCHAR(255),
  usuario_id      BIGINT NOT NULL,
  creado_en       TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_en  TIMESTAMPTZ(3),
  eliminado_en    TIMESTAMPTZ(3),
  PRIMARY KEY (id)
);

CREATE UNIQUE INDEX uq_tasa_fecha_viva ON tasas_cambio (fecha) WHERE eliminado_en IS NULL;
CREATE INDEX ix_tasa_fecha ON tasas_cambio (fecha);
CREATE INDEX ix_tasa_usuario ON tasas_cambio (usuario_id);
CREATE INDEX ix_tasa_corrige ON tasas_cambio (corrige_tasa_id);
ALTER TABLE tasas_cambio ADD CONSTRAINT fk_tasa_usuario FOREIGN KEY (usuario_id)      REFERENCES usuarios(id)     ON DELETE RESTRICT;
ALTER TABLE tasas_cambio ADD CONSTRAINT fk_tasa_corrige FOREIGN KEY (corrige_tasa_id) REFERENCES tasas_cambio(id) ON DELETE RESTRICT;
CREATE TRIGGER trg_tasas_actualizado BEFORE UPDATE ON tasas_cambio FOR EACH ROW EXECUTE FUNCTION actualizar_actualizado_en();

CREATE TABLE categorias (
  id                 BIGINT GENERATED BY DEFAULT AS IDENTITY NOT NULL,
  categoria_padre_id BIGINT,
  codigo             VARCHAR(30),
  nombre             VARCHAR(100) NOT NULL,
  descripcion        VARCHAR(255),
  color_hex          CHAR(7),
  orden              INTEGER NOT NULL DEFAULT 0 CHECK (orden >= 0),
  esta_activa        BOOLEAN NOT NULL DEFAULT TRUE,
  creado_en          TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_en     TIMESTAMPTZ(3),
  eliminado_en       TIMESTAMPTZ(3),
  PRIMARY KEY (id)
);

CREATE UNIQUE INDEX uq_categorias_nombre ON categorias (nombre, COALESCE(categoria_padre_id, 0)) WHERE eliminado_en IS NULL;
CREATE INDEX ix_categorias_padre ON categorias (categoria_padre_id);
ALTER TABLE categorias ADD CONSTRAINT fk_categorias_padre FOREIGN KEY (categoria_padre_id) REFERENCES categorias(id) ON DELETE RESTRICT;
CREATE TRIGGER trg_categorias_actualizado BEFORE UPDATE ON categorias FOR EACH ROW EXECUTE FUNCTION actualizar_actualizado_en();

CREATE TABLE proveedores (
  id               BIGINT GENERATED BY DEFAULT AS IDENTITY NOT NULL,
  nit              VARCHAR(32),
  razon_social     VARCHAR(160) NOT NULL,
  nombre_comercial VARCHAR(120),
  contacto_nombre  VARCHAR(120),
  telefono         VARCHAR(40),
  email            VARCHAR(160),
  direccion        VARCHAR(200),
  ciudad           VARCHAR(80),
  dias_plazo       INTEGER NOT NULL DEFAULT 0 CHECK (dias_plazo >= 0),
  cupo_credito     DECIMAL(14,2) NOT NULL DEFAULT 0 CHECK (cupo_credito >= 0),
  saldo_actual     DECIMAL(14,2) NOT NULL DEFAULT 0 CHECK (saldo_actual >= 0),
  notas            VARCHAR(255),
  esta_activo      BOOLEAN NOT NULL DEFAULT TRUE,
  creado_en        TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_en   TIMESTAMPTZ(3),
  eliminado_en     TIMESTAMPTZ(3),
  PRIMARY KEY (id)
);

CREATE UNIQUE INDEX uq_proveedores_nit ON proveedores (nit) WHERE eliminado_en IS NULL AND nit IS NOT NULL;
CREATE INDEX ix_proveedores_razon ON proveedores (razon_social);
CREATE TRIGGER trg_proveedores_actualizado BEFORE UPDATE ON proveedores FOR EACH ROW EXECUTE FUNCTION actualizar_actualizado_en();

CREATE TABLE clientes (
  id                BIGINT GENERATED BY DEFAULT AS IDENTITY NOT NULL,
  tipo_documento    tipo_documento_identidad NOT NULL DEFAULT 'CC',
  documento         VARCHAR(30),
  nombre            VARCHAR(140) NOT NULL,
  telefono          VARCHAR(40),
  email             VARCHAR(160),
  direccion         VARCHAR(200),
  ciudad            VARCHAR(80),
  fecha_nacimiento  DATE,
  cupo_credito      DECIMAL(14,2) NOT NULL DEFAULT 0 CHECK (cupo_credito >= 0),
  dias_plazo        INTEGER NOT NULL DEFAULT 30 CHECK (dias_plazo >= 0),
  saldo_actual      DECIMAL(14,2) NOT NULL DEFAULT 0 CHECK (saldo_actual >= 0),
  es_permite_credito BOOLEAN NOT NULL DEFAULT FALSE,
  esta_bloqueado    BOOLEAN NOT NULL DEFAULT FALSE,
  motivo_bloqueo    VARCHAR(200),
  notas             VARCHAR(255),
  esta_activo       BOOLEAN NOT NULL DEFAULT TRUE,
  creado_en         TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_en    TIMESTAMPTZ(3),
  eliminado_en      TIMESTAMPTZ(3),
  PRIMARY KEY (id)
);

CREATE UNIQUE INDEX uq_clientes_documento ON clientes (tipo_documento, COALESCE(documento, '')) WHERE eliminado_en IS NULL;
CREATE INDEX ix_clientes_nombre ON clientes (nombre);
CREATE TRIGGER trg_clientes_actualizado BEFORE UPDATE ON clientes FOR EACH ROW EXECUTE FUNCTION actualizar_actualizado_en();

CREATE TABLE metodos_pago (
  id                   BIGINT GENERATED BY DEFAULT AS IDENTITY NOT NULL,
  codigo               VARCHAR(30) NOT NULL,
  nombre               VARCHAR(80) NOT NULL,
  tipo                 tipo_metodo_pago_tipo NOT NULL,
  moneda               tipo_metodo_pago_moneda NOT NULL DEFAULT 'VES',
  afecta_caja_efectivo BOOLEAN NOT NULL DEFAULT FALSE,
  requiere_referencia  BOOLEAN NOT NULL DEFAULT FALSE,
  es_permite_cambio    BOOLEAN NOT NULL DEFAULT FALSE,
  es_no_es_cobro       BOOLEAN NOT NULL DEFAULT FALSE,
  comision_porcentaje  DECIMAL(6,3) NOT NULL DEFAULT 0 CHECK (comision_porcentaje >= 0),
  orden                INTEGER NOT NULL DEFAULT 0 CHECK (orden >= 0),
  esta_activo          BOOLEAN NOT NULL DEFAULT TRUE,
  creado_en            TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_en       TIMESTAMPTZ(3),
  eliminado_en         TIMESTAMPTZ(3),
  PRIMARY KEY (id)
);

CREATE UNIQUE INDEX uq_metodos_codigo ON metodos_pago (codigo) WHERE eliminado_en IS NULL;
CREATE TRIGGER trg_metodos_pago_actualizado BEFORE UPDATE ON metodos_pago FOR EACH ROW EXECUTE FUNCTION actualizar_actualizado_en();

CREATE TABLE motivos_ajuste (
  id                       BIGINT GENERATED BY DEFAULT AS IDENTITY NOT NULL,
  codigo                   VARCHAR(30) NOT NULL,
  nombre                   VARCHAR(80) NOT NULL,
  signo                    INTEGER NOT NULL DEFAULT -1,
  es_perdida               BOOLEAN NOT NULL DEFAULT TRUE,
  es_requiere_autorizacion BOOLEAN NOT NULL DEFAULT FALSE,
  esta_activo              BOOLEAN NOT NULL DEFAULT TRUE,
  creado_en                TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_en           TIMESTAMPTZ(3),
  PRIMARY KEY (id)
);

CREATE UNIQUE INDEX uq_motivos_codigo ON motivos_ajuste (codigo);

CREATE TABLE cajas (
  id               BIGINT GENERATED BY DEFAULT AS IDENTITY NOT NULL,
  sucursal_id      BIGINT NOT NULL,
  codigo           VARCHAR(20) NOT NULL,
  nombre           VARCHAR(80) NOT NULL,
  impresora_nombre VARCHAR(120),
  esta_activa      BOOLEAN NOT NULL DEFAULT TRUE,
  creado_en        TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_en   TIMESTAMPTZ(3),
  eliminado_en     TIMESTAMPTZ(3),
  PRIMARY KEY (id)
);

CREATE UNIQUE INDEX uq_cajas_codigo ON cajas (sucursal_id, codigo) WHERE eliminado_en IS NULL;
ALTER TABLE cajas ADD CONSTRAINT fk_cajas_sucursal FOREIGN KEY (sucursal_id) REFERENCES sucursales(id) ON DELETE RESTRICT;
CREATE TRIGGER trg_cajas_actualizado BEFORE UPDATE ON cajas FOR EACH ROW EXECUTE FUNCTION actualizar_actualizado_en();

CREATE TABLE turnos_caja (
  id                        BIGINT GENERATED BY DEFAULT AS IDENTITY NOT NULL,
  caja_id                   BIGINT NOT NULL,
  sucursal_id               BIGINT NOT NULL,
  usuario_apertura_id       BIGINT NOT NULL,
  usuario_cierre_id         BIGINT,
  abierto_en                TIMESTAMPTZ(3) NOT NULL,
  cerrado_en                TIMESTAMPTZ(3),
  base_inicial_usd          DECIMAL(14,2) NOT NULL DEFAULT 0 CHECK (base_inicial_usd >= 0),
  base_inicial_bs           DECIMAL(18,2) NOT NULL DEFAULT 0 CHECK (base_inicial_bs >= 0),
  total_ventas_efectivo_usd DECIMAL(14,2) NOT NULL DEFAULT 0 CHECK (total_ventas_efectivo_usd >= 0),
  total_ventas_efectivo_bs  DECIMAL(18,2) NOT NULL DEFAULT 0 CHECK (total_ventas_efectivo_bs >= 0),
  total_ventas_otros_usd    DECIMAL(14,2) NOT NULL DEFAULT 0 CHECK (total_ventas_otros_usd >= 0),
  total_abonos_efectivo_usd DECIMAL(14,2) NOT NULL DEFAULT 0 CHECK (total_abonos_efectivo_usd >= 0),
  total_abonos_efectivo_bs  DECIMAL(18,2) NOT NULL DEFAULT 0 CHECK (total_abonos_efectivo_bs >= 0),
  total_ingresos_usd        DECIMAL(14,2) NOT NULL DEFAULT 0 CHECK (total_ingresos_usd >= 0),
  total_ingresos_bs         DECIMAL(18,2) NOT NULL DEFAULT 0 CHECK (total_ingresos_bs >= 0),
  total_egresos_usd         DECIMAL(14,2) NOT NULL DEFAULT 0 CHECK (total_egresos_usd >= 0),
  total_egresos_bs          DECIMAL(18,2) NOT NULL DEFAULT 0 CHECK (total_egresos_bs >= 0),
  total_retiros_usd         DECIMAL(14,2) NOT NULL DEFAULT 0 CHECK (total_retiros_usd >= 0),
  total_retiros_bs          DECIMAL(18,2) NOT NULL DEFAULT 0 CHECK (total_retiros_bs >= 0),
  total_vueltas_usd         DECIMAL(14,2) NOT NULL DEFAULT 0 CHECK (total_vueltas_usd >= 0),
  total_vueltas_bs          DECIMAL(18,2) NOT NULL DEFAULT 0 CHECK (total_vueltas_bs >= 0),
  esperado_usd              DECIMAL(14,2) NOT NULL DEFAULT 0,
  esperado_bs               DECIMAL(18,2) NOT NULL DEFAULT 0,
  contado_usd               DECIMAL(14,2),
  contado_bs                DECIMAL(18,2),
  diferencia_usd            DECIMAL(14,2),
  diferencia_bs             DECIMAL(18,2),
  detalle_denominaciones_usd JSONB,
  detalle_denominaciones_bs  JSONB,
  tasa_cierre               DECIMAL(18,6),
  observaciones             VARCHAR(255),
  estado                    estado_turno NOT NULL DEFAULT 'ABIERTO',
  creado_en                 TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_en            TIMESTAMPTZ(3),
  PRIMARY KEY (id)
);

CREATE UNIQUE INDEX uq_turno_abierto ON turnos_caja (caja_id) WHERE estado = 'ABIERTO';
CREATE INDEX ix_turno_sucursal ON turnos_caja (sucursal_id);
CREATE INDEX ix_turno_apertura ON turnos_caja (usuario_apertura_id);
CREATE INDEX ix_turno_cierre ON turnos_caja (usuario_cierre_id);
ALTER TABLE turnos_caja ADD CONSTRAINT fk_turno_caja     FOREIGN KEY (caja_id)             REFERENCES cajas(id)      ON DELETE RESTRICT;
ALTER TABLE turnos_caja ADD CONSTRAINT fk_turno_sucursal FOREIGN KEY (sucursal_id)         REFERENCES sucursales(id) ON DELETE RESTRICT;
ALTER TABLE turnos_caja ADD CONSTRAINT fk_turno_apertura FOREIGN KEY (usuario_apertura_id) REFERENCES usuarios(id)   ON DELETE RESTRICT;
ALTER TABLE turnos_caja ADD CONSTRAINT fk_turno_cierre   FOREIGN KEY (usuario_cierre_id)   REFERENCES usuarios(id)   ON DELETE RESTRICT;
CREATE TRIGGER trg_turnos_actualizado BEFORE UPDATE ON turnos_caja FOR EACH ROW EXECUTE FUNCTION actualizar_actualizado_en();

-- =============================================================================
-- 3. PRODUCTOS E INVENTARIO
-- =============================================================================

CREATE TABLE productos (
  id                        BIGINT GENERATED BY DEFAULT AS IDENTITY NOT NULL,
  sku                       VARCHAR(40) NOT NULL,
  nombre                    VARCHAR(160) NOT NULL,
  descripcion               VARCHAR(500),
  categoria_id              BIGINT NOT NULL,
  unidad_medida_id          BIGINT NOT NULL,
  impuesto_id               BIGINT NOT NULL,
  proveedor_preferido_id    BIGINT,
  tipo                      tipo_producto NOT NULL DEFAULT 'SIMPLE',
  precio_venta              DECIMAL(14,4) NOT NULL DEFAULT 0 CHECK (precio_venta >= 0),
  precio_venta_mayorista    DECIMAL(14,4) CHECK (precio_venta_mayorista >= 0),
  costo_promedio            DECIMAL(14,4) NOT NULL DEFAULT 0 CHECK (costo_promedio >= 0),
  ultimo_costo              DECIMAL(14,4) NOT NULL DEFAULT 0 CHECK (ultimo_costo >= 0),
  margen_objetivo           DECIMAL(6,3),
  es_precio_incluye_impuesto BOOLEAN NOT NULL DEFAULT TRUE,
  es_maneja_inventario      BOOLEAN NOT NULL DEFAULT TRUE,
  es_permite_fraccion       BOOLEAN NOT NULL DEFAULT FALSE,
  es_pesable                BOOLEAN NOT NULL DEFAULT FALSE,
  es_favorito_pos           BOOLEAN NOT NULL DEFAULT FALSE,
  imagen_ruta               VARCHAR(255),
  esta_activo               BOOLEAN NOT NULL DEFAULT TRUE,
  creado_por                BIGINT,
  creado_en                 TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_en            TIMESTAMPTZ(3),
  eliminado_en              TIMESTAMPTZ(3),
  PRIMARY KEY (id)
);

CREATE UNIQUE INDEX uq_productos_sku ON productos (sku) WHERE eliminado_en IS NULL;
CREATE INDEX ix_productos_categoria ON productos (categoria_id);
CREATE INDEX ix_productos_unidad ON productos (unidad_medida_id);
CREATE INDEX ix_productos_impuesto ON productos (impuesto_id);
CREATE INDEX ix_productos_proveedor ON productos (proveedor_preferido_id);
CREATE INDEX ix_productos_creado_por ON productos (creado_por);
CREATE INDEX ix_productos_favorito ON productos (es_favorito_pos) WHERE es_favorito_pos = TRUE;
CREATE INDEX ft_productos ON productos USING GIN (to_tsvector('spanish', COALESCE(nombre, '') || ' ' || COALESCE(descripcion, '')));
ALTER TABLE productos ADD CONSTRAINT fk_productos_categoria FOREIGN KEY (categoria_id)           REFERENCES categorias(id)       ON DELETE RESTRICT;
ALTER TABLE productos ADD CONSTRAINT fk_productos_unidad    FOREIGN KEY (unidad_medida_id)       REFERENCES unidades_medida(id)  ON DELETE RESTRICT;
ALTER TABLE productos ADD CONSTRAINT fk_productos_impuesto  FOREIGN KEY (impuesto_id)            REFERENCES impuestos(id)        ON DELETE RESTRICT;
ALTER TABLE productos ADD CONSTRAINT fk_productos_proveedor FOREIGN KEY (proveedor_preferido_id) REFERENCES proveedores(id)      ON DELETE SET NULL;
ALTER TABLE productos ADD CONSTRAINT fk_productos_creador   FOREIGN KEY (creado_por)             REFERENCES usuarios(id)         ON DELETE SET NULL;
CREATE TRIGGER trg_productos_actualizado BEFORE UPDATE ON productos FOR EACH ROW EXECUTE FUNCTION actualizar_actualizado_en();

CREATE TABLE producto_codigos (
  id                BIGINT GENERATED BY DEFAULT AS IDENTITY NOT NULL,
  producto_id       BIGINT NOT NULL,
  codigo            VARCHAR(64) NOT NULL,
  tipo              tipo_codigo_producto NOT NULL DEFAULT 'EAN13',
  factor_conversion DECIMAL(14,3) NOT NULL DEFAULT 1 CHECK (factor_conversion > 0),
  es_principal      BOOLEAN NOT NULL DEFAULT FALSE,
  creado_en         TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_en    TIMESTAMPTZ(3),
  eliminado_en      TIMESTAMPTZ(3),
  PRIMARY KEY (id)
);

CREATE UNIQUE INDEX uq_pcodigos_codigo ON producto_codigos (codigo) WHERE eliminado_en IS NULL;
CREATE INDEX ix_pcodigos_producto ON producto_codigos (producto_id);
ALTER TABLE producto_codigos ADD CONSTRAINT fk_pcodigos_producto FOREIGN KEY (producto_id) REFERENCES productos(id) ON DELETE RESTRICT;
CREATE TRIGGER trg_pcodigos_actualizado BEFORE UPDATE ON producto_codigos FOR EACH ROW EXECUTE FUNCTION actualizar_actualizado_en();

CREATE TABLE producto_precios (
  id                      BIGINT GENERATED BY DEFAULT AS IDENTITY NOT NULL,
  producto_id             BIGINT NOT NULL,
  precio_venta_anterior   DECIMAL(14,4) NOT NULL CHECK (precio_venta_anterior >= 0),
  precio_venta_nuevo      DECIMAL(14,4) NOT NULL CHECK (precio_venta_nuevo >= 0),
  costo_referencia        DECIMAL(14,4) NOT NULL DEFAULT 0 CHECK (costo_referencia >= 0),
  tasa_cambio_referencia  DECIMAL(18,6),
  motivo                  VARCHAR(200),
  vigente_desde           TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  usuario_id              BIGINT NOT NULL,
  creado_en               TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id)
);

CREATE INDEX ix_pprecios_producto ON producto_precios (producto_id, vigente_desde);
CREATE INDEX ix_pprecios_usuario ON producto_precios (usuario_id);
ALTER TABLE producto_precios ADD CONSTRAINT fk_pprecios_producto FOREIGN KEY (producto_id) REFERENCES productos(id) ON DELETE RESTRICT;
ALTER TABLE producto_precios ADD CONSTRAINT fk_pprecios_usuario  FOREIGN KEY (usuario_id)  REFERENCES usuarios(id)  ON DELETE RESTRICT;

CREATE TABLE producto_stock (
  producto_id       BIGINT NOT NULL,
  sucursal_id       BIGINT NOT NULL,
  cantidad          DECIMAL(14,3) NOT NULL DEFAULT 0 CHECK (cantidad >= 0),
  cantidad_reservada DECIMAL(14,3) NOT NULL DEFAULT 0 CHECK (cantidad_reservada >= 0),
  stock_minimo      DECIMAL(14,3) NOT NULL DEFAULT 0 CHECK (stock_minimo >= 0),
  stock_maximo      DECIMAL(14,3) CHECK (stock_maximo IS NULL OR stock_maximo >= 0),
  costo_promedio    DECIMAL(14,4) NOT NULL DEFAULT 0 CHECK (costo_promedio >= 0),
  ubicacion         VARCHAR(60),
  ultima_entrada_en TIMESTAMPTZ(3),
  ultima_salida_en  TIMESTAMPTZ(3),
  actualizado_en    TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (producto_id, sucursal_id)
);

CREATE INDEX ix_stock_suc_cant ON producto_stock (sucursal_id, cantidad);
ALTER TABLE producto_stock ADD CONSTRAINT fk_stock_producto FOREIGN KEY (producto_id) REFERENCES productos(id)  ON DELETE RESTRICT;
ALTER TABLE producto_stock ADD CONSTRAINT fk_stock_sucursal FOREIGN KEY (sucursal_id) REFERENCES sucursales(id) ON DELETE RESTRICT;

CREATE OR REPLACE FUNCTION actualizar_stock_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.actualizado_en = CURRENT_TIMESTAMP(3);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_stock_actualizado BEFORE UPDATE ON producto_stock FOR EACH ROW EXECUTE FUNCTION actualizar_stock_timestamp();

CREATE TABLE consecutivos (
  id             BIGINT GENERATED BY DEFAULT AS IDENTITY NOT NULL,
  sucursal_id    BIGINT NOT NULL,
  tipo_documento tipo_documento_consecutivo NOT NULL,
  anio           INTEGER NOT NULL CHECK (anio >= 2000 AND anio <= 2100),
  prefijo        VARCHAR(8) NOT NULL DEFAULT '',
  ultimo_numero  BIGINT NOT NULL DEFAULT 0 CHECK (ultimo_numero >= 0),
  resolucion     VARCHAR(60),
  rango_desde    BIGINT CHECK (rango_desde IS NULL OR rango_desde >= 0),
  rango_hasta    BIGINT CHECK (rango_hasta IS NULL OR rango_hasta >= 0),
  vigente_hasta  DATE,
  esta_activo    BOOLEAN NOT NULL DEFAULT TRUE,
  creado_en      TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_en TIMESTAMPTZ(3),
  PRIMARY KEY (id)
);

CREATE UNIQUE INDEX uq_consecutivos ON consecutivos (sucursal_id, tipo_documento, anio);
ALTER TABLE consecutivos ADD CONSTRAINT fk_consecutivos_sucursal FOREIGN KEY (sucursal_id) REFERENCES sucursales(id) ON DELETE RESTRICT;
CREATE TRIGGER trg_consecutivos_actualizado BEFORE UPDATE ON consecutivos FOR EACH ROW EXECUTE FUNCTION actualizar_actualizado_en();

-- =============================================================================
-- 4. COMPRAS
-- =============================================================================

CREATE TABLE compras (
  id                       BIGINT GENERATED BY DEFAULT AS IDENTITY NOT NULL,
  sucursal_id              BIGINT NOT NULL,
  proveedor_id             BIGINT NOT NULL,
  usuario_id               BIGINT NOT NULL,
  prefijo                  VARCHAR(8) NOT NULL DEFAULT '',
  numero                   BIGINT NOT NULL CHECK (numero >= 0),
  anio                     INTEGER NOT NULL CHECK (anio >= 2000 AND anio <= 2100),
  numero_factura_proveedor VARCHAR(60),
  fecha_documento          DATE NOT NULL,
  fecha_recepcion          TIMESTAMPTZ(3) NOT NULL,
  fecha_vencimiento        DATE,
  subtotal                 DECIMAL(14,2) NOT NULL DEFAULT 0 CHECK (subtotal >= 0),
  descuento_total          DECIMAL(14,2) NOT NULL DEFAULT 0 CHECK (descuento_total >= 0),
  impuesto_total           DECIMAL(14,2) NOT NULL DEFAULT 0 CHECK (impuesto_total >= 0),
  flete                    DECIMAL(14,2) NOT NULL DEFAULT 0 CHECK (flete >= 0),
  moneda_pago              tipo_metodo_pago_moneda NOT NULL DEFAULT 'USD',
  tasa_cambio              DECIMAL(18,6) NOT NULL CHECK (tasa_cambio > 0),
  total_usd                DECIMAL(14,2) NOT NULL DEFAULT 0 CHECK (total_usd >= 0),
  total_bs                 DECIMAL(18,2) NOT NULL DEFAULT 0 CHECK (total_bs >= 0),
  total_pagado_moneda      DECIMAL(18,4) NOT NULL DEFAULT 0 CHECK (total_pagado_moneda >= 0),
  saldo_pendiente          DECIMAL(14,2) NOT NULL DEFAULT 0 CHECK (saldo_pendiente >= 0),
  condicion_pago           condicion_pago NOT NULL DEFAULT 'CONTADO',
  estado                   estado_compra NOT NULL DEFAULT 'BORRADOR',
  observaciones            VARCHAR(255),
  clave_idempotencia       UUID,
  anulada_en               TIMESTAMPTZ(3),
  anulada_por              BIGINT,
  motivo_anulacion         VARCHAR(200),
  creado_en                TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_en           TIMESTAMPTZ(3),
  PRIMARY KEY (id)
);

CREATE UNIQUE INDEX uq_compras_numero ON compras (sucursal_id, anio, prefijo, numero);
CREATE UNIQUE INDEX uq_compras_idem ON compras (clave_idempotencia) WHERE clave_idempotencia IS NOT NULL;
CREATE INDEX ix_compras_proveedor ON compras (proveedor_id, fecha_recepcion);
CREATE INDEX ix_compras_usuario ON compras (usuario_id);
CREATE INDEX ix_compras_estado ON compras (estado, fecha_recepcion);
CREATE INDEX ix_compras_anulada_por ON compras (anulada_por);
ALTER TABLE compras ADD CONSTRAINT fk_compras_sucursal  FOREIGN KEY (sucursal_id)  REFERENCES sucursales(id)  ON DELETE RESTRICT;
ALTER TABLE compras ADD CONSTRAINT fk_compras_proveedor FOREIGN KEY (proveedor_id) REFERENCES proveedores(id) ON DELETE RESTRICT;
ALTER TABLE compras ADD CONSTRAINT fk_compras_usuario   FOREIGN KEY (usuario_id)   REFERENCES usuarios(id)    ON DELETE RESTRICT;
ALTER TABLE compras ADD CONSTRAINT fk_compras_anulada   FOREIGN KEY (anulada_por)  REFERENCES usuarios(id)    ON DELETE RESTRICT;
CREATE TRIGGER trg_compras_actualizado BEFORE UPDATE ON compras FOR EACH ROW EXECUTE FUNCTION actualizar_actualizado_en();

CREATE TABLE compra_detalle (
  id                  BIGINT GENERATED BY DEFAULT AS IDENTITY NOT NULL,
  compra_id           BIGINT NOT NULL,
  linea               INTEGER NOT NULL CHECK (linea >= 0),
  producto_id         BIGINT NOT NULL,
  descripcion         VARCHAR(160) NOT NULL,
  unidad_medida_id    BIGINT NOT NULL,
  cantidad            DECIMAL(14,3) NOT NULL CHECK (cantidad > 0),
  costo_unitario      DECIMAL(14,4) NOT NULL CHECK (costo_unitario >= 0),
  descuento_unitario  DECIMAL(14,4) NOT NULL DEFAULT 0 CHECK (descuento_unitario >= 0),
  flete_prorrateado   DECIMAL(14,2) NOT NULL DEFAULT 0 CHECK (flete_prorrateado >= 0),
  costo_unitario_neto DECIMAL(14,4) NOT NULL CHECK (costo_unitario_neto >= 0),
  impuesto_id         BIGINT NOT NULL,
  impuesto_tasa       DECIMAL(6,3) NOT NULL DEFAULT 0 CHECK (impuesto_tasa >= 0),
  impuesto_monto      DECIMAL(14,2) NOT NULL DEFAULT 0 CHECK (impuesto_monto >= 0),
  subtotal            DECIMAL(14,2) NOT NULL CHECK (subtotal >= 0),
  total_linea         DECIMAL(14,2) NOT NULL CHECK (total_linea >= 0),
  lote_codigo         VARCHAR(40),
  fecha_vencimiento   DATE,
  creado_en           TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id)
);

CREATE UNIQUE INDEX uq_cdet_linea ON compra_detalle (compra_id, linea);
CREATE INDEX ix_cdet_producto ON compra_detalle (producto_id);
CREATE INDEX ix_cdet_unidad ON compra_detalle (unidad_medida_id);
CREATE INDEX ix_cdet_impuesto ON compra_detalle (impuesto_id);
ALTER TABLE compra_detalle ADD CONSTRAINT fk_cdet_compra   FOREIGN KEY (compra_id)        REFERENCES compras(id)         ON DELETE RESTRICT;
ALTER TABLE compra_detalle ADD CONSTRAINT fk_cdet_producto FOREIGN KEY (producto_id)      REFERENCES productos(id)       ON DELETE RESTRICT;
ALTER TABLE compra_detalle ADD CONSTRAINT fk_cdet_unidad   FOREIGN KEY (unidad_medida_id) REFERENCES unidades_medida(id) ON DELETE RESTRICT;
ALTER TABLE compra_detalle ADD CONSTRAINT fk_cdet_impuesto FOREIGN KEY (impuesto_id)      REFERENCES impuestos(id)       ON DELETE RESTRICT;

-- =============================================================================
-- 5. VENTAS
-- =============================================================================

CREATE TABLE ventas (
  id                  BIGINT GENERATED BY DEFAULT AS IDENTITY NOT NULL,
  sucursal_id         BIGINT NOT NULL,
  turno_caja_id       BIGINT NOT NULL,
  usuario_id          BIGINT NOT NULL,
  cliente_id          BIGINT,
  prefijo             VARCHAR(8) NOT NULL DEFAULT '',
  numero              BIGINT NOT NULL CHECK (numero >= 0),
  anio                INTEGER NOT NULL CHECK (anio >= 2000 AND anio <= 2100),
  fecha               TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  subtotal_bruto      DECIMAL(14,2) NOT NULL DEFAULT 0 CHECK (subtotal_bruto >= 0),
  descuento_lineas    DECIMAL(14,2) NOT NULL DEFAULT 0 CHECK (descuento_lineas >= 0),
  descuento_documento DECIMAL(14,2) NOT NULL DEFAULT 0 CHECK (descuento_documento >= 0),
  base_gravable       DECIMAL(14,2) NOT NULL DEFAULT 0 CHECK (base_gravable >= 0),
  impuesto_total      DECIMAL(14,2) NOT NULL DEFAULT 0 CHECK (impuesto_total >= 0),
  redondeo            DECIMAL(14,2) NOT NULL DEFAULT 0,
  total_usd           DECIMAL(14,2) NOT NULL DEFAULT 0 CHECK (total_usd >= 0),
  tasa_cambio         DECIMAL(18,6) NOT NULL CHECK (tasa_cambio > 0),
  tasa_cambio_id      BIGINT,
  total_bs            DECIMAL(18,2) NOT NULL DEFAULT 0 CHECK (total_bs >= 0),
  redondeo_bs         DECIMAL(18,2) NOT NULL DEFAULT 0,
  costo_total         DECIMAL(14,2) NOT NULL DEFAULT 0 CHECK (costo_total >= 0),
  utilidad_total      DECIMAL(14,2) NOT NULL DEFAULT 0,
  total_pagado        DECIMAL(14,2) NOT NULL DEFAULT 0 CHECK (total_pagado >= 0),
  total_credito       DECIMAL(14,2) NOT NULL DEFAULT 0 CHECK (total_credito >= 0),
  cantidad_items      DECIMAL(14,3) NOT NULL DEFAULT 0 CHECK (cantidad_items >= 0),
  es_credito          BOOLEAN NOT NULL DEFAULT FALSE,
  estado              estado_venta NOT NULL DEFAULT 'ABIERTA',
  clave_idempotencia  UUID,
  observaciones       VARCHAR(255),
  anulada_en          TIMESTAMPTZ(3),
  anulada_por         BIGINT,
  autorizada_por      BIGINT,
  motivo_anulacion    VARCHAR(200),
  creado_en           TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_en      TIMESTAMPTZ(3),
  PRIMARY KEY (id)
);

CREATE UNIQUE INDEX uq_ventas_numero ON ventas (sucursal_id, anio, prefijo, numero);
CREATE UNIQUE INDEX uq_ventas_idem ON ventas (clave_idempotencia) WHERE clave_idempotencia IS NOT NULL;
CREATE INDEX ix_ventas_suc_fecha ON ventas (sucursal_id, fecha, estado);
CREATE INDEX ix_ventas_cliente ON ventas (cliente_id, fecha, estado);
CREATE INDEX ix_ventas_turno ON ventas (turno_caja_id);
CREATE INDEX ix_ventas_usuario ON ventas (usuario_id);
CREATE INDEX ix_ventas_tasa ON ventas (tasa_cambio_id);
CREATE INDEX ix_ventas_anulada_por ON ventas (anulada_por);
CREATE INDEX ix_ventas_autorizada_por ON ventas (autorizada_por);
ALTER TABLE ventas ADD CONSTRAINT fk_ventas_sucursal   FOREIGN KEY (sucursal_id)    REFERENCES sucursales(id)   ON DELETE RESTRICT;
ALTER TABLE ventas ADD CONSTRAINT fk_ventas_turno      FOREIGN KEY (turno_caja_id)  REFERENCES turnos_caja(id)  ON DELETE RESTRICT;
ALTER TABLE ventas ADD CONSTRAINT fk_ventas_usuario    FOREIGN KEY (usuario_id)     REFERENCES usuarios(id)     ON DELETE RESTRICT;
ALTER TABLE ventas ADD CONSTRAINT fk_ventas_cliente    FOREIGN KEY (cliente_id)     REFERENCES clientes(id)     ON DELETE RESTRICT;
ALTER TABLE ventas ADD CONSTRAINT fk_ventas_anulada    FOREIGN KEY (anulada_por)    REFERENCES usuarios(id)     ON DELETE RESTRICT;
ALTER TABLE ventas ADD CONSTRAINT fk_ventas_autorizada FOREIGN KEY (autorizada_por) REFERENCES usuarios(id)     ON DELETE RESTRICT;
ALTER TABLE ventas ADD CONSTRAINT fk_ventas_tasa       FOREIGN KEY (tasa_cambio_id) REFERENCES tasas_cambio(id) ON DELETE RESTRICT;
CREATE TRIGGER trg_ventas_actualizado BEFORE UPDATE ON ventas FOR EACH ROW EXECUTE FUNCTION actualizar_actualizado_en();

CREATE TABLE venta_detalle (
  id                        BIGINT GENERATED BY DEFAULT AS IDENTITY NOT NULL,
  venta_id                  BIGINT NOT NULL,
  linea                     INTEGER NOT NULL CHECK (linea >= 0),
  producto_id               BIGINT NOT NULL,
  descripcion               VARCHAR(160) NOT NULL,
  codigo_barras             VARCHAR(64),
  categoria_id              BIGINT NOT NULL,
  unidad_medida_id          BIGINT NOT NULL,
  cantidad                  DECIMAL(14,3) NOT NULL CHECK (cantidad > 0),
  precio_compra_unitario    DECIMAL(14,4) NOT NULL CHECK (precio_compra_unitario >= 0),
  precio_venta_unitario     DECIMAL(14,4) NOT NULL CHECK (precio_venta_unitario >= 0),
  descuento_unitario        DECIMAL(14,4) NOT NULL DEFAULT 0 CHECK (descuento_unitario >= 0),
  impuesto_id               BIGINT NOT NULL,
  impuesto_tasa             DECIMAL(6,3) NOT NULL DEFAULT 0 CHECK (impuesto_tasa >= 0),
  impuesto_monto            DECIMAL(14,2) NOT NULL DEFAULT 0 CHECK (impuesto_monto >= 0),
  es_precio_incluia_impuesto BOOLEAN NOT NULL DEFAULT TRUE,
  base_gravable             DECIMAL(14,2) NOT NULL CHECK (base_gravable >= 0),
  costo_total               DECIMAL(14,2) NOT NULL CHECK (costo_total >= 0),
  utilidad_unitaria         DECIMAL(14,4) NOT NULL,
  utilidad_total            DECIMAL(14,2) NOT NULL,
  total_linea               DECIMAL(14,2) NOT NULL CHECK (total_linea >= 0),
  cantidad_devuelta         DECIMAL(14,3) NOT NULL DEFAULT 0 CHECK (cantidad_devuelta >= 0),
  creado_en                 TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id)
);

CREATE UNIQUE INDEX uq_vdet_linea ON venta_detalle (venta_id, linea);
CREATE INDEX ix_vd_producto ON venta_detalle (producto_id, venta_id);
CREATE INDEX ix_vd_categoria ON venta_detalle (categoria_id);
CREATE INDEX ix_vd_unidad ON venta_detalle (unidad_medida_id);
CREATE INDEX ix_vd_impuesto ON venta_detalle (impuesto_id);
ALTER TABLE venta_detalle ADD CONSTRAINT fk_vdet_venta     FOREIGN KEY (venta_id)         REFERENCES ventas(id)          ON DELETE RESTRICT;
ALTER TABLE venta_detalle ADD CONSTRAINT fk_vdet_producto  FOREIGN KEY (producto_id)      REFERENCES productos(id)       ON DELETE RESTRICT;
ALTER TABLE venta_detalle ADD CONSTRAINT fk_vdet_categoria FOREIGN KEY (categoria_id)     REFERENCES categorias(id)      ON DELETE RESTRICT;
ALTER TABLE venta_detalle ADD CONSTRAINT fk_vdet_unidad    FOREIGN KEY (unidad_medida_id) REFERENCES unidades_medida(id) ON DELETE RESTRICT;
ALTER TABLE venta_detalle ADD CONSTRAINT fk_vdet_impuesto  FOREIGN KEY (impuesto_id)      REFERENCES impuestos(id)       ON DELETE RESTRICT;

CREATE TABLE creditos (
  id                           BIGINT GENERATED BY DEFAULT AS IDENTITY NOT NULL,
  sucursal_id                  BIGINT NOT NULL,
  cliente_id                   BIGINT NOT NULL,
  venta_id                     BIGINT,
  origen                       origen_credito NOT NULL DEFAULT 'VENTA',
  fecha_emision                DATE NOT NULL,
  fecha_vencimiento            DATE NOT NULL,
  dias_plazo                   INTEGER NOT NULL DEFAULT 30 CHECK (dias_plazo >= 0),
  monto_original_usd           DECIMAL(14,2) NOT NULL CHECK (monto_original_usd > 0),
  saldo_usd                    DECIMAL(14,2) NOT NULL CHECK (saldo_usd >= 0),
  tasa_cambio_origen           DECIMAL(18,6) NOT NULL CHECK (tasa_cambio_origen > 0),
  monto_original_bs_referencia DECIMAL(18,2) NOT NULL DEFAULT 0 CHECK (monto_original_bs_referencia >= 0),
  estado                       estado_credito NOT NULL DEFAULT 'PENDIENTE',
  autorizado_por               BIGINT,
  usuario_id                   BIGINT NOT NULL,
  observaciones                VARCHAR(255),
  pagado_en                    TIMESTAMPTZ(3),
  anulado_en                   TIMESTAMPTZ(3),
  anulado_por                  BIGINT,
  motivo_anulacion             VARCHAR(200),
  creado_en                    TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_en               TIMESTAMPTZ(3),
  PRIMARY KEY (id)
);

CREATE INDEX ix_cred_cliente ON creditos (cliente_id, estado, fecha_vencimiento);
CREATE INDEX ix_cred_sucursal ON creditos (sucursal_id);
CREATE INDEX ix_cred_venta ON creditos (venta_id);
CREATE INDEX ix_cred_usuario ON creditos (usuario_id);
CREATE INDEX ix_cred_autorizado ON creditos (autorizado_por);
CREATE INDEX ix_cred_anulado ON creditos (anulado_por);
ALTER TABLE creditos ADD CONSTRAINT fk_cred_sucursal   FOREIGN KEY (sucursal_id)    REFERENCES sucursales(id) ON DELETE RESTRICT;
ALTER TABLE creditos ADD CONSTRAINT fk_cred_cliente    FOREIGN KEY (cliente_id)     REFERENCES clientes(id)   ON DELETE RESTRICT;
ALTER TABLE creditos ADD CONSTRAINT fk_cred_venta      FOREIGN KEY (venta_id)       REFERENCES ventas(id)     ON DELETE RESTRICT;
ALTER TABLE creditos ADD CONSTRAINT fk_cred_usuario    FOREIGN KEY (usuario_id)     REFERENCES usuarios(id)   ON DELETE RESTRICT;
ALTER TABLE creditos ADD CONSTRAINT fk_cred_autorizado FOREIGN KEY (autorizado_por) REFERENCES usuarios(id)   ON DELETE RESTRICT;
ALTER TABLE creditos ADD CONSTRAINT fk_cred_anulado    FOREIGN KEY (anulado_por)    REFERENCES usuarios(id)   ON DELETE RESTRICT;

ALTER TABLE creditos ADD CONSTRAINT ck_cred_saldo CHECK (saldo_usd >= 0 AND saldo_usd <= monto_original_usd);
CREATE TRIGGER trg_creditos_actualizado BEFORE UPDATE ON creditos FOR EACH ROW EXECUTE FUNCTION actualizar_actualizado_en();

CREATE TABLE pagos (
  id                    BIGINT GENERATED BY DEFAULT AS IDENTITY NOT NULL,
  venta_id              BIGINT NOT NULL,
  sucursal_id           BIGINT NOT NULL,
  turno_caja_id         BIGINT NOT NULL,
  metodo_pago_id        BIGINT NOT NULL,
  moneda                tipo_metodo_pago_moneda NOT NULL,
  monto_moneda          DECIMAL(18,4) NOT NULL CHECK (monto_moneda > 0),
  tasa_aplicada         DECIMAL(18,6) NOT NULL CHECK (tasa_aplicada > 0),
  monto_usd             DECIMAL(14,2) NOT NULL CHECK (monto_usd > 0),
  monto_recibido_moneda DECIMAL(18,4),
  cambio_moneda         DECIMAL(18,4),
  cambio_moneda_codigo  tipo_metodo_pago_moneda,
  referencia            VARCHAR(60),
  franquicia            VARCHAR(40),
  comision              DECIMAL(14,2) NOT NULL DEFAULT 0 CHECK (comision >= 0),
  credito_id            BIGINT,
  estado                VARCHAR(10) NOT NULL DEFAULT 'APLICADO',
  usuario_id            BIGINT NOT NULL,
  fecha                 TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  creado_en             TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_en        TIMESTAMPTZ(3),
  PRIMARY KEY (id)
);

CREATE INDEX ix_pagos_venta ON pagos (venta_id);
CREATE INDEX ix_pagos_sucursal ON pagos (sucursal_id);
CREATE INDEX ix_pagos_turno ON pagos (turno_caja_id);
CREATE INDEX ix_pagos_metodo ON pagos (metodo_pago_id);
CREATE INDEX ix_pagos_credito ON pagos (credito_id);
CREATE INDEX ix_pagos_usuario ON pagos (usuario_id);
ALTER TABLE pagos ADD CONSTRAINT fk_pagos_venta   FOREIGN KEY (venta_id)       REFERENCES ventas(id)       ON DELETE RESTRICT;
ALTER TABLE pagos ADD CONSTRAINT fk_pagos_sucursal FOREIGN KEY (sucursal_id)   REFERENCES sucursales(id)   ON DELETE RESTRICT;
ALTER TABLE pagos ADD CONSTRAINT fk_pagos_turno   FOREIGN KEY (turno_caja_id)  REFERENCES turnos_caja(id)  ON DELETE RESTRICT;
ALTER TABLE pagos ADD CONSTRAINT fk_pagos_metodo  FOREIGN KEY (metodo_pago_id) REFERENCES metodos_pago(id) ON DELETE RESTRICT;
ALTER TABLE pagos ADD CONSTRAINT fk_pagos_credito FOREIGN KEY (credito_id)     REFERENCES creditos(id)     ON DELETE RESTRICT;
ALTER TABLE pagos ADD CONSTRAINT fk_pagos_usuario FOREIGN KEY (usuario_id)     REFERENCES usuarios(id)     ON DELETE RESTRICT;
ALTER TABLE pagos ADD CONSTRAINT ck_pagos_estado CHECK (estado IN ('APLICADO', 'ANULADO'));

CREATE TABLE abonos (
  id                 BIGINT GENERATED BY DEFAULT AS IDENTITY NOT NULL,
  sucursal_id        BIGINT NOT NULL,
  cliente_id         BIGINT NOT NULL,
  turno_caja_id      BIGINT NOT NULL,
  metodo_pago_id     BIGINT NOT NULL,
  usuario_id         BIGINT NOT NULL,
  prefijo            VARCHAR(8) NOT NULL DEFAULT '',
  numero             BIGINT NOT NULL CHECK (numero >= 0),
  anio               INTEGER NOT NULL CHECK (anio >= 2000 AND anio <= 2100),
  fecha              TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  moneda             tipo_metodo_pago_moneda NOT NULL,
  monto_moneda       DECIMAL(18,4) NOT NULL CHECK (monto_moneda > 0),
  tasa_aplicada      DECIMAL(18,6) NOT NULL CHECK (tasa_aplicada > 0),
  tasa_cambio_id     BIGINT,
  monto_usd          DECIMAL(14,2) NOT NULL CHECK (monto_usd > 0),
  monto_aplicado_usd DECIMAL(14,2) NOT NULL DEFAULT 0 CHECK (monto_aplicado_usd >= 0),
  saldo_a_favor_usd  DECIMAL(14,2) NOT NULL DEFAULT 0 CHECK (saldo_a_favor_usd >= 0),
  referencia         VARCHAR(60),
  observaciones      VARCHAR(255),
  estado             estado_abono NOT NULL DEFAULT 'APLICADO',
  clave_idempotencia UUID,
  anulado_en         TIMESTAMPTZ(3),
  anulado_por        BIGINT,
  motivo_anulacion   VARCHAR(200),
  creado_en          TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_en     TIMESTAMPTZ(3),
  PRIMARY KEY (id)
);

CREATE UNIQUE INDEX uq_abonos_numero ON abonos (sucursal_id, anio, prefijo, numero);
CREATE UNIQUE INDEX uq_abonos_idem ON abonos (clave_idempotencia) WHERE clave_idempotencia IS NOT NULL;
CREATE INDEX ix_abonos_cliente ON abonos (cliente_id, fecha);
CREATE INDEX ix_abonos_turno ON abonos (turno_caja_id);
CREATE INDEX ix_abonos_metodo ON abonos (metodo_pago_id);
CREATE INDEX ix_abonos_usuario ON abonos (usuario_id);
CREATE INDEX ix_abonos_tasa ON abonos (tasa_cambio_id);
CREATE INDEX ix_abonos_anulado ON abonos (anulado_por);
ALTER TABLE abonos ADD CONSTRAINT fk_abonos_sucursal   FOREIGN KEY (sucursal_id)    REFERENCES sucursales(id)   ON DELETE RESTRICT;
ALTER TABLE abonos ADD CONSTRAINT fk_abonos_cliente    FOREIGN KEY (cliente_id)     REFERENCES clientes(id)     ON DELETE RESTRICT;
ALTER TABLE abonos ADD CONSTRAINT fk_abonos_turno      FOREIGN KEY (turno_caja_id)  REFERENCES turnos_caja(id)  ON DELETE RESTRICT;
ALTER TABLE abonos ADD CONSTRAINT fk_abonos_metodo     FOREIGN KEY (metodo_pago_id) REFERENCES metodos_pago(id) ON DELETE RESTRICT;
ALTER TABLE abonos ADD CONSTRAINT fk_abonos_usuario    FOREIGN KEY (usuario_id)     REFERENCES usuarios(id)     ON DELETE RESTRICT;
ALTER TABLE abonos ADD CONSTRAINT fk_abonos_tasa       FOREIGN KEY (tasa_cambio_id) REFERENCES tasas_cambio(id) ON DELETE RESTRICT;
ALTER TABLE abonos ADD CONSTRAINT fk_abonos_anulado    FOREIGN KEY (anulado_por)    REFERENCES usuarios(id)     ON DELETE RESTRICT;
CREATE TRIGGER trg_abonos_actualizado BEFORE UPDATE ON abonos FOR EACH ROW EXECUTE FUNCTION actualizar_actualizado_en();

CREATE TABLE abono_aplicaciones (
  id                BIGINT GENERATED BY DEFAULT AS IDENTITY NOT NULL,
  abono_id          BIGINT NOT NULL,
  credito_id        BIGINT NOT NULL,
  monto_aplicado_usd DECIMAL(14,2) NOT NULL CHECK (monto_aplicado_usd > 0),
  creado_en         TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id)
);

CREATE INDEX ix_aa_abono ON abono_aplicaciones (abono_id);
CREATE INDEX ix_aa_credito ON abono_aplicaciones (credito_id);
ALTER TABLE abono_aplicaciones ADD CONSTRAINT fk_aa_abono   FOREIGN KEY (abono_id)   REFERENCES abonos(id)   ON DELETE RESTRICT;
ALTER TABLE abono_aplicaciones ADD CONSTRAINT fk_aa_credito FOREIGN KEY (credito_id) REFERENCES creditos(id) ON DELETE RESTRICT;

-- =============================================================================
-- 6. DEVOLUCIONES
-- =============================================================================

CREATE TABLE devoluciones (
  id                    BIGINT GENERATED BY DEFAULT AS IDENTITY NOT NULL,
  sucursal_id           BIGINT NOT NULL,
  turno_caja_id         BIGINT NOT NULL,
  usuario_id            BIGINT NOT NULL,
  tipo                  tipo_devolucion NOT NULL,
  venta_id              BIGINT,
  compra_id             BIGINT,
  cliente_id            BIGINT,
  proveedor_id          BIGINT,
  prefijo               VARCHAR(8) NOT NULL DEFAULT '',
  numero                BIGINT NOT NULL CHECK (numero >= 0),
  anio                  INTEGER NOT NULL CHECK (anio >= 2000 AND anio <= 2100),
  fecha                 TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  forma_reintegro       forma_reintegro,
  motivo                VARCHAR(255) NOT NULL,
  subtotal              DECIMAL(14,2) NOT NULL DEFAULT 0 CHECK (subtotal >= 0),
  impuesto_total        DECIMAL(14,2) NOT NULL DEFAULT 0 CHECK (impuesto_total >= 0),
  total_usd             DECIMAL(14,2) NOT NULL DEFAULT 0 CHECK (total_usd >= 0),
  estado                estado_devolucion NOT NULL DEFAULT 'APLICADA',
  anulada_en            TIMESTAMPTZ(3),
  anulada_por           BIGINT,
  motivo_anulacion      VARCHAR(200),
  creado_en             TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_en        TIMESTAMPTZ(3),
  PRIMARY KEY (id)
);

CREATE INDEX ix_dev_sucursal ON devoluciones (sucursal_id);
CREATE INDEX ix_dev_venta ON devoluciones (venta_id);
CREATE INDEX ix_dev_compra ON devoluciones (compra_id);
CREATE INDEX ix_dev_cliente ON devoluciones (cliente_id);
CREATE INDEX ix_dev_proveedor ON devoluciones (proveedor_id);
CREATE INDEX ix_dev_usuario ON devoluciones (usuario_id);
CREATE INDEX ix_dev_anulada ON devoluciones (anulada_por);
ALTER TABLE devoluciones ADD CONSTRAINT fk_dev_sucursal   FOREIGN KEY (sucursal_id)  REFERENCES sucursales(id)   ON DELETE RESTRICT;
ALTER TABLE devoluciones ADD CONSTRAINT fk_dev_turno      FOREIGN KEY (turno_caja_id) REFERENCES turnos_caja(id)  ON DELETE RESTRICT;
ALTER TABLE devoluciones ADD CONSTRAINT fk_dev_usuario    FOREIGN KEY (usuario_id)    REFERENCES usuarios(id)     ON DELETE RESTRICT;
ALTER TABLE devoluciones ADD CONSTRAINT fk_dev_venta      FOREIGN KEY (venta_id)      REFERENCES ventas(id)       ON DELETE RESTRICT;
ALTER TABLE devoluciones ADD CONSTRAINT fk_dev_compra     FOREIGN KEY (compra_id)     REFERENCES compras(id)      ON DELETE RESTRICT;
ALTER TABLE devoluciones ADD CONSTRAINT fk_dev_cliente    FOREIGN KEY (cliente_id)    REFERENCES clientes(id)     ON DELETE RESTRICT;
ALTER TABLE devoluciones ADD CONSTRAINT fk_dev_proveedor  FOREIGN KEY (proveedor_id)  REFERENCES proveedores(id)  ON DELETE RESTRICT;
ALTER TABLE devoluciones ADD CONSTRAINT fk_dev_anulada    FOREIGN KEY (anulada_por)   REFERENCES usuarios(id)     ON DELETE RESTRICT;
CREATE TRIGGER trg_devoluciones_actualizado BEFORE UPDATE ON devoluciones FOR EACH ROW EXECUTE FUNCTION actualizar_actualizado_en();

CREATE TABLE devolucion_detalle (
  id                BIGINT GENERATED BY DEFAULT AS IDENTITY NOT NULL,
  devolucion_id     BIGINT NOT NULL,
  linea             INTEGER NOT NULL CHECK (linea >= 0),
  venta_detalle_id  BIGINT,
  producto_id       BIGINT NOT NULL,
  descripcion       VARCHAR(160) NOT NULL,
  cantidad          DECIMAL(14,3) NOT NULL CHECK (cantidad > 0),
  costo_unitario    DECIMAL(14,4) NOT NULL CHECK (costo_unitario >= 0),
  precio_unitario   DECIMAL(14,4) NOT NULL CHECK (precio_unitario >= 0),
  impuesto_id       BIGINT NOT NULL,
  impuesto_tasa     DECIMAL(6,3) NOT NULL DEFAULT 0,
  subtotal          DECIMAL(14,2) NOT NULL CHECK (subtotal >= 0),
  total_linea       DECIMAL(14,2) NOT NULL CHECK (total_linea >= 0),
  creado_en         TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id)
);

CREATE UNIQUE INDEX uq_ddet_linea ON devolucion_detalle (devolucion_id, linea);
CREATE INDEX ix_ddet_producto ON devolucion_detalle (producto_id);
CREATE INDEX ix_ddet_vdetalle ON devolucion_detalle (venta_detalle_id);
CREATE INDEX ix_ddet_impuesto ON devolucion_detalle (impuesto_id);
ALTER TABLE devolucion_detalle ADD CONSTRAINT fk_ddet_devolucion  FOREIGN KEY (devolucion_id)    REFERENCES devoluciones(id)  ON DELETE RESTRICT;
ALTER TABLE devolucion_detalle ADD CONSTRAINT fk_ddet_vdetalle    FOREIGN KEY (venta_detalle_id) REFERENCES venta_detalle(id)  ON DELETE SET NULL;
ALTER TABLE devolucion_detalle ADD CONSTRAINT fk_ddet_producto    FOREIGN KEY (producto_id)      REFERENCES productos(id)     ON DELETE RESTRICT;
ALTER TABLE devolucion_detalle ADD CONSTRAINT fk_ddet_impuesto    FOREIGN KEY (impuesto_id)      REFERENCES impuestos(id)     ON DELETE RESTRICT;

-- =============================================================================
-- 7. AJUSTES DE INVENTARIO
-- =============================================================================

CREATE TABLE ajustes_inventario (
  id                BIGINT GENERATED BY DEFAULT AS IDENTITY NOT NULL,
  sucursal_id       BIGINT NOT NULL,
  tipo              tipo_ajuste NOT NULL DEFAULT 'AJUSTE_MANUAL',
  motivo_ajuste_id  BIGINT NOT NULL,
  usuario_id        BIGINT NOT NULL,
  prefijo           VARCHAR(8) NOT NULL DEFAULT '',
  numero            BIGINT NOT NULL CHECK (numero >= 0),
  anio              INTEGER NOT NULL CHECK (anio >= 2000 AND anio <= 2100),
  fecha             TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  observaciones     VARCHAR(255),
  estado            estado_ajuste NOT NULL DEFAULT 'BORRADOR',
  aplicado_en       TIMESTAMPTZ(3),
  anulado_en        TIMESTAMPTZ(3),
  anulado_por       BIGINT,
  motivo_anulacion  VARCHAR(200),
  creado_en         TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_en    TIMESTAMPTZ(3),
  PRIMARY KEY (id)
);

CREATE UNIQUE INDEX uq_ajustes_numero ON ajustes_inventario (sucursal_id, anio, prefijo, numero);
CREATE INDEX ix_ajustes_sucursal ON ajustes_inventario (sucursal_id);
CREATE INDEX ix_ajustes_motivo ON ajustes_inventario (motivo_ajuste_id);
CREATE INDEX ix_ajustes_usuario ON ajustes_inventario (usuario_id);
CREATE INDEX ix_ajustes_anulado ON ajustes_inventario (anulado_por);
ALTER TABLE ajustes_inventario ADD CONSTRAINT fk_ajustes_sucursal FOREIGN KEY (sucursal_id)      REFERENCES sucursales(id)     ON DELETE RESTRICT;
ALTER TABLE ajustes_inventario ADD CONSTRAINT fk_ajustes_motivo  FOREIGN KEY (motivo_ajuste_id)  REFERENCES motivos_ajuste(id) ON DELETE RESTRICT;
ALTER TABLE ajustes_inventario ADD CONSTRAINT fk_ajustes_usuario FOREIGN KEY (usuario_id)        REFERENCES usuarios(id)       ON DELETE RESTRICT;
ALTER TABLE ajustes_inventario ADD CONSTRAINT fk_ajustes_anulado FOREIGN KEY (anulado_por)       REFERENCES usuarios(id)       ON DELETE RESTRICT;
CREATE TRIGGER trg_ajustes_actualizado BEFORE UPDATE ON ajustes_inventario FOR EACH ROW EXECUTE FUNCTION actualizar_actualizado_en();

CREATE TABLE ajuste_detalle (
  id                         BIGINT GENERATED BY DEFAULT AS IDENTITY NOT NULL,
  ajuste_id                  BIGINT NOT NULL,
  linea                      INTEGER NOT NULL CHECK (linea >= 0),
  producto_id                BIGINT NOT NULL,
  descripcion                VARCHAR(160) NOT NULL,
  costo_unitario             DECIMAL(14,4) NOT NULL CHECK (costo_unitario >= 0),
  cantidad_sistema           DECIMAL(14,3) NOT NULL CHECK (cantidad_sistema >= 0),
  cantidad_fisica            DECIMAL(14,3) NOT NULL CHECK (cantidad_fisica >= 0),
  cantidad_diferencia        DECIMAL(14,3) NOT NULL,
  costo_total_diferencia     DECIMAL(14,2) NOT NULL,
  creado_en                  TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id)
);

CREATE UNIQUE INDEX uq_ajuste_linea ON ajuste_detalle (ajuste_id, linea);
CREATE INDEX ix_ajuste_detalle_producto ON ajuste_detalle (producto_id);
ALTER TABLE ajuste_detalle ADD CONSTRAINT fk_ajuste_detalle_ajuste   FOREIGN KEY (ajuste_id)   REFERENCES ajustes_inventario(id) ON DELETE RESTRICT;
ALTER TABLE ajuste_detalle ADD CONSTRAINT fk_ajuste_detalle_producto FOREIGN KEY (producto_id) REFERENCES productos(id)          ON DELETE RESTRICT;

-- =============================================================================
-- 8. MOVIMIENTOS Y AUDITORIA
-- =============================================================================

CREATE TABLE inventario_movimientos (
  id                        BIGINT GENERATED BY DEFAULT AS IDENTITY NOT NULL,
  sucursal_id               BIGINT NOT NULL,
  producto_id               BIGINT NOT NULL,
  tipo                      tipo_movimiento_inventario NOT NULL,
  signo                     INTEGER NOT NULL CHECK (signo IN (-1, 1)),
  cantidad                  DECIMAL(14,3) NOT NULL CHECK (cantidad > 0),
  costo_unitario            DECIMAL(14,4) NOT NULL CHECK (costo_unitario >= 0),
  costo_total               DECIMAL(14,2) NOT NULL,
  saldo_anterior            DECIMAL(14,3) NOT NULL,
  saldo_posterior           DECIMAL(14,3) NOT NULL,
  costo_promedio_anterior   DECIMAL(14,4) NOT NULL DEFAULT 0 CHECK (costo_promedio_anterior >= 0),
  costo_promedio_posterior  DECIMAL(14,4) NOT NULL DEFAULT 0 CHECK (costo_promedio_posterior >= 0),
  documento_tipo            tipo_documento_movimiento NOT NULL,
  venta_id                  BIGINT,
  compra_id                 BIGINT,
  ajuste_id                 BIGINT,
  devolucion_id             BIGINT,
  motivo_id                 BIGINT,
  usuario_id                BIGINT NOT NULL,
  nota                      VARCHAR(255),
  creado_en                 TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id)
);

CREATE INDEX ix_mov_prod_suc_fecha ON inventario_movimientos (producto_id, sucursal_id, creado_en);
CREATE INDEX ix_mov_suc_fecha_tipo ON inventario_movimientos (sucursal_id, creado_en, tipo);
CREATE INDEX ix_mov_venta ON inventario_movimientos (venta_id);
CREATE INDEX ix_mov_compra ON inventario_movimientos (compra_id);
CREATE INDEX ix_mov_ajuste ON inventario_movimientos (ajuste_id);
CREATE INDEX ix_mov_devolucion ON inventario_movimientos (devolucion_id);
CREATE INDEX ix_mov_motivo ON inventario_movimientos (motivo_id);
CREATE INDEX ix_mov_usuario ON inventario_movimientos (usuario_id);
ALTER TABLE inventario_movimientos ADD CONSTRAINT ck_mov_docs CHECK (
  CASE WHEN venta_id IS NOT NULL THEN 1 ELSE 0 END +
  CASE WHEN compra_id IS NOT NULL THEN 1 ELSE 0 END +
  CASE WHEN ajuste_id IS NOT NULL THEN 1 ELSE 0 END +
  CASE WHEN devolucion_id IS NOT NULL THEN 1 ELSE 0 END <= 1
);
ALTER TABLE inventario_movimientos ADD CONSTRAINT fk_mov_sucursal   FOREIGN KEY (sucursal_id)   REFERENCES sucursales(id)         ON DELETE RESTRICT;
ALTER TABLE inventario_movimientos ADD CONSTRAINT fk_mov_producto   FOREIGN KEY (producto_id)   REFERENCES productos(id)          ON DELETE RESTRICT;
ALTER TABLE inventario_movimientos ADD CONSTRAINT fk_mov_venta      FOREIGN KEY (venta_id)      REFERENCES ventas(id)             ON DELETE RESTRICT;
ALTER TABLE inventario_movimientos ADD CONSTRAINT fk_mov_compra     FOREIGN KEY (compra_id)     REFERENCES compras(id)            ON DELETE RESTRICT;
ALTER TABLE inventario_movimientos ADD CONSTRAINT fk_mov_ajuste     FOREIGN KEY (ajuste_id)     REFERENCES ajustes_inventario(id) ON DELETE RESTRICT;
ALTER TABLE inventario_movimientos ADD CONSTRAINT fk_mov_devolucion FOREIGN KEY (devolucion_id) REFERENCES devoluciones(id)       ON DELETE RESTRICT;
ALTER TABLE inventario_movimientos ADD CONSTRAINT fk_mov_motivo     FOREIGN KEY (motivo_id)     REFERENCES motivos_ajuste(id)     ON DELETE RESTRICT;
ALTER TABLE inventario_movimientos ADD CONSTRAINT fk_mov_usuario    FOREIGN KEY (usuario_id)    REFERENCES usuarios(id)           ON DELETE RESTRICT;

CREATE TABLE movimientos_caja (
  id                BIGINT GENERATED BY DEFAULT AS IDENTITY NOT NULL,
  turno_caja_id     BIGINT NOT NULL,
  sucursal_id       BIGINT NOT NULL,
  tipo              tipo_movimiento_caja NOT NULL,
  signo             INTEGER NOT NULL CHECK (signo IN (-1, 1)),
  moneda            tipo_metodo_pago_moneda NOT NULL,
  monto_moneda      DECIMAL(18,4) NOT NULL CHECK (monto_moneda > 0),
  tasa_aplicada     DECIMAL(18,6) NOT NULL CHECK (tasa_aplicada > 0),
  monto_usd         DECIMAL(14,2) NOT NULL CHECK (monto_usd >= 0),
  metodo_pago_id    BIGINT,
  concepto          VARCHAR(200) NOT NULL,
  documento_tipo    documento_tipo_caja NOT NULL DEFAULT 'MANUAL',
  documento_id      BIGINT,
  usuario_id        BIGINT NOT NULL,
  autorizado_por    BIGINT,
  fecha             TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  creado_en         TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id)
);

CREATE INDEX ix_mc_turno ON movimientos_caja (turno_caja_id);
CREATE INDEX ix_mc_sucursal ON movimientos_caja (sucursal_id);
CREATE INDEX ix_mc_metodo ON movimientos_caja (metodo_pago_id);
CREATE INDEX ix_mc_usuario ON movimientos_caja (usuario_id);
CREATE INDEX ix_mc_autorizado ON movimientos_caja (autorizado_por);
ALTER TABLE movimientos_caja ADD CONSTRAINT fk_mc_turno      FOREIGN KEY (turno_caja_id)  REFERENCES turnos_caja(id)  ON DELETE RESTRICT;
ALTER TABLE movimientos_caja ADD CONSTRAINT fk_mc_sucursal   FOREIGN KEY (sucursal_id)    REFERENCES sucursales(id)   ON DELETE RESTRICT;
ALTER TABLE movimientos_caja ADD CONSTRAINT fk_mc_metodo     FOREIGN KEY (metodo_pago_id) REFERENCES metodos_pago(id) ON DELETE RESTRICT;
ALTER TABLE movimientos_caja ADD CONSTRAINT fk_mc_usuario    FOREIGN KEY (usuario_id)     REFERENCES usuarios(id)     ON DELETE RESTRICT;
ALTER TABLE movimientos_caja ADD CONSTRAINT fk_mc_autorizado FOREIGN KEY (autorizado_por) REFERENCES usuarios(id)     ON DELETE RESTRICT;

CREATE TABLE auditoria (
  id            BIGINT GENERATED BY DEFAULT AS IDENTITY NOT NULL,
  ocurrido_en   TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  usuario_id    BIGINT,
  sucursal_id   BIGINT,
  accion        accion_auditoria NOT NULL,
  entidad       VARCHAR(60) NOT NULL,
  entidad_id    BIGINT,
  datos_antes   JSONB,
  datos_despues JSONB,
  ip            INET,
  user_agent    VARCHAR(255),
  request_id    CHAR(26),
  creado_en     TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id)
);

CREATE INDEX ix_aud_entidad ON auditoria (entidad, entidad_id, ocurrido_en);
CREATE INDEX ix_aud_usuario ON auditoria (usuario_id, ocurrido_en);
CREATE INDEX ix_aud_sucursal ON auditoria (sucursal_id);
ALTER TABLE auditoria ADD CONSTRAINT fk_aud_usuario  FOREIGN KEY (usuario_id)  REFERENCES usuarios(id)   ON DELETE SET NULL;
ALTER TABLE auditoria ADD CONSTRAINT fk_aud_sucursal FOREIGN KEY (sucursal_id) REFERENCES sucursales(id) ON DELETE SET NULL;

CREATE TABLE idempotencia_solicitudes (
  clave           CHAR(36) NOT NULL,
  usuario_id      BIGINT NOT NULL,
  endpoint        VARCHAR(120) NOT NULL,
  huella_payload  CHAR(64) NOT NULL,
  estado          estado_idempotencia NOT NULL DEFAULT 'EN_PROCESO',
  http_status     INTEGER,
  respuesta_json  JSONB,
  recurso_tipo    VARCHAR(40),
  recurso_id      BIGINT,
  creado_en       TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expira_en       TIMESTAMPTZ(3) NOT NULL,
  PRIMARY KEY (clave)
);

CREATE INDEX ix_idem_usuario ON idempotencia_solicitudes (usuario_id);
CREATE INDEX ix_idem_expira ON idempotencia_solicitudes (expira_en);
ALTER TABLE idempotencia_solicitudes ADD CONSTRAINT fk_idem_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE RESTRICT;

CREATE TABLE resumen_ventas_diario (
  fecha                   DATE NOT NULL,
  sucursal_id             BIGINT NOT NULL,
  producto_id             BIGINT NOT NULL,
  categoria_id            BIGINT NOT NULL,
  cantidad_vendida        DECIMAL(14,3) NOT NULL DEFAULT 0 CHECK (cantidad_vendida >= 0),
  cantidad_devuelta       DECIMAL(14,3) NOT NULL DEFAULT 0 CHECK (cantidad_devuelta >= 0),
  venta_neta_usd          DECIMAL(14,2) NOT NULL DEFAULT 0 CHECK (venta_neta_usd >= 0),
  venta_neta_bs           DECIMAL(18,2) NOT NULL DEFAULT 0 CHECK (venta_neta_bs >= 0),
  impuesto_total_usd      DECIMAL(14,2) NOT NULL DEFAULT 0 CHECK (impuesto_total_usd >= 0),
  impuesto_total_bs       DECIMAL(18,2) NOT NULL DEFAULT 0 CHECK (impuesto_total_bs >= 0),
  costo_total_usd         DECIMAL(14,2) NOT NULL DEFAULT 0 CHECK (costo_total_usd >= 0),
  costo_total_bs          DECIMAL(18,2) NOT NULL DEFAULT 0 CHECK (costo_total_bs >= 0),
  utilidad_total_usd      DECIMAL(14,2) NOT NULL DEFAULT 0,
  utilidad_total_bs       DECIMAL(18,2) NOT NULL DEFAULT 0,
  numero_ventas           INTEGER NOT NULL DEFAULT 0 CHECK (numero_ventas >= 0),
  tasa_promedio_ponderada DECIMAL(18,6) NOT NULL DEFAULT 0 CHECK (tasa_promedio_ponderada >= 0),
  calculado_en            TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (fecha, sucursal_id, producto_id)
);

CREATE INDEX ix_rvd_suc_fecha ON resumen_ventas_diario (sucursal_id, fecha);
CREATE INDEX ix_rvd_producto ON resumen_ventas_diario (producto_id);
CREATE INDEX ix_rvd_categoria ON resumen_ventas_diario (categoria_id);
ALTER TABLE resumen_ventas_diario ADD CONSTRAINT fk_rvd_sucursal  FOREIGN KEY (sucursal_id) REFERENCES sucursales(id) ON DELETE RESTRICT;
ALTER TABLE resumen_ventas_diario ADD CONSTRAINT fk_rvd_producto  FOREIGN KEY (producto_id) REFERENCES productos(id)  ON DELETE RESTRICT;
ALTER TABLE resumen_ventas_diario ADD CONSTRAINT fk_rvd_categoria FOREIGN KEY (categoria_id) REFERENCES categorias(id) ON DELETE RESTRICT;

CREATE TABLE trabajos_exportacion (
  id              BIGINT GENERATED BY DEFAULT AS IDENTITY NOT NULL,
  usuario_id      BIGINT NOT NULL,
  sucursal_id     BIGINT NOT NULL,
  tipo_reporte    VARCHAR(60) NOT NULL,
  formato         formato_exportacion NOT NULL,
  parametros_json JSONB NOT NULL,
  estado          estado_exportacion NOT NULL DEFAULT 'PENDIENTE',
  archivo_ruta    VARCHAR(255),
  archivo_bytes   BIGINT,
  filas_generadas INTEGER,
  error_mensaje   VARCHAR(500),
  iniciado_en     TIMESTAMPTZ(3),
  finalizado_en   TIMESTAMPTZ(3),
  expira_en       TIMESTAMPTZ(3),
  creado_en       TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id)
);

CREATE INDEX ix_texp_usuario ON trabajos_exportacion (usuario_id);
CREATE INDEX ix_texp_sucursal ON trabajos_exportacion (sucursal_id);
CREATE INDEX ix_texp_estado ON trabajos_exportacion (estado);
ALTER TABLE trabajos_exportacion ADD CONSTRAINT fk_texp_usuario  FOREIGN KEY (usuario_id)  REFERENCES usuarios(id)   ON DELETE RESTRICT;
ALTER TABLE trabajos_exportacion ADD CONSTRAINT fk_texp_sucursal FOREIGN KEY (sucursal_id) REFERENCES sucursales(id) ON DELETE RESTRICT;

CREATE TABLE migraciones (
  version      VARCHAR(32) NOT NULL,
  nombre       VARCHAR(160) NOT NULL,
  checksum     CHAR(64) NOT NULL,
  aplicada_en  TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  duracion_ms  INTEGER NOT NULL DEFAULT 0 CHECK (duracion_ms >= 0),
  aplicada_por VARCHAR(60),
  PRIMARY KEY (version)
);

-- =============================================================================
-- COMMENTS
-- =============================================================================

COMMENT ON TABLE sucursales IS 'Sucursales / puntos de venta';
COMMENT ON TABLE roles IS 'Roles de usuario (RBAC)';
COMMENT ON TABLE permisos IS 'Catalogo granular de permisos';
COMMENT ON TABLE rol_permisos IS 'Permisos por rol';
COMMENT ON TABLE usuarios IS 'Usuarios del sistema';
COMMENT ON TABLE usuario_sucursales IS 'Sucursales por usuario';
COMMENT ON TABLE sesiones IS 'Refresh tokens rotativos';
COMMENT ON TABLE unidades_medida IS 'Unidades de medida';
COMMENT ON TABLE impuestos IS 'Impuestos (IVA Venezuela 16, exento, excluido)';
COMMENT ON TABLE configuracion IS 'Configuracion global (fila unica id=1)';
COMMENT ON TABLE parametros IS 'Parametros clave-valor';
COMMENT ON TABLE tasas_cambio IS 'Tasa USD->Bs por dia (registro manual)';
COMMENT ON TABLE categorias IS 'Categorias de productos (jerarquicas)';
COMMENT ON TABLE proveedores IS 'Proveedores; saldo en USD';
COMMENT ON TABLE clientes IS 'Clientes; deuda en USD';
COMMENT ON TABLE metodos_pago IS 'Metodos de pago con su moneda';
COMMENT ON TABLE motivos_ajuste IS 'Motivos de ajuste de inventario';
COMMENT ON TABLE cajas IS 'Cajas por sucursal';
COMMENT ON TABLE turnos_caja IS 'Turnos de caja, arqueo separado USD/Bs';
COMMENT ON TABLE productos IS 'Productos; precios y costos en USD';
COMMENT ON TABLE producto_codigos IS 'Codigos de barras por producto (unicidad global)';
COMMENT ON TABLE producto_precios IS 'Historial de precios de venta';
COMMENT ON TABLE producto_stock IS 'Existencia y costo promedio por producto y sucursal';
COMMENT ON TABLE consecutivos IS 'Consecutivos de documentos';
COMMENT ON TABLE compras IS 'Compras a proveedores';
COMMENT ON TABLE compra_detalle IS 'Renglones de compra';
COMMENT ON TABLE ventas IS 'Ventas; snapshot de tasa y totales en USD y Bs';
COMMENT ON TABLE venta_detalle IS 'Renglones de venta con snapshot de costo y utilidad USD';
COMMENT ON TABLE creditos IS 'Creditos/cartera; saldo en USD';
COMMENT ON TABLE pagos IS 'Pagos de una venta (mixto entre monedas)';
COMMENT ON TABLE abonos IS 'Abonos a creditos de clientes';
COMMENT ON TABLE abono_aplicaciones IS 'Aplicacion de abono a creditos especificos';
COMMENT ON TABLE devoluciones IS 'Devoluciones de venta o compra';
COMMENT ON TABLE devolucion_detalle IS 'Renglones de devolucion';
COMMENT ON TABLE ajustes_inventario IS 'Ajustes de inventario (conteo fisico, merma, etc)';
COMMENT ON TABLE ajuste_detalle IS 'Renglones de ajuste de inventario';
COMMENT ON TABLE inventario_movimientos IS 'Libro mayor de inventario (append-only kardex)';
COMMENT ON TABLE movimientos_caja IS 'Movimientos de caja (efectivo y otros)';
COMMENT ON TABLE auditoria IS 'Auditoria de acciones importantes';
COMMENT ON TABLE idempotencia_solicitudes IS 'Solicitudes con clave de idempotencia';
COMMENT ON TABLE resumen_ventas_diario IS 'Resumen de ventas por dia y sucursal';
COMMENT ON TABLE trabajos_exportacion IS 'Trabajos de exportacion asincronos';
COMMENT ON TABLE migraciones IS 'Registro de migraciones aplicadas';

COMMIT;
