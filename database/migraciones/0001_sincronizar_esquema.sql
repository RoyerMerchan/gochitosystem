-- =============================================================================
-- Sincronizacion idempotente de la BD de produccion con schema.pg.sql
-- Generado automaticamente. NO borra datos: solo agrega lo que falte.
-- Ejecutar:  psql -U USUARIO -d BD -v ON_ERROR_STOP=0 -f sincronizar-prod.sql
-- =============================================================================

-- Funcion de trigger (idempotente por CREATE OR REPLACE)
CREATE OR REPLACE FUNCTION actualizar_actualizado_en()
RETURNS TRIGGER AS $$
BEGIN
    NEW.actualizado_en = CURRENT_TIMESTAMP(3);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Enums: crear si faltan y agregar valores nuevos
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname='codigo_rol') THEN CREATE TYPE codigo_rol AS ENUM ('ADMIN', 'SUPERVISOR', 'CAJERO', 'BODEGUERO'); END IF; END $$;
ALTER TYPE codigo_rol ADD VALUE IF NOT EXISTS 'ADMIN';
ALTER TYPE codigo_rol ADD VALUE IF NOT EXISTS 'SUPERVISOR';
ALTER TYPE codigo_rol ADD VALUE IF NOT EXISTS 'CAJERO';
ALTER TYPE codigo_rol ADD VALUE IF NOT EXISTS 'BODEGUERO';
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname='motivo_revocacion') THEN CREATE TYPE motivo_revocacion AS ENUM ('LOGOUT', 'ROTACION', 'REUSO_DETECTADO', 'ADMIN', 'EXPIRACION'); END IF; END $$;
ALTER TYPE motivo_revocacion ADD VALUE IF NOT EXISTS 'LOGOUT';
ALTER TYPE motivo_revocacion ADD VALUE IF NOT EXISTS 'ROTACION';
ALTER TYPE motivo_revocacion ADD VALUE IF NOT EXISTS 'REUSO_DETECTADO';
ALTER TYPE motivo_revocacion ADD VALUE IF NOT EXISTS 'ADMIN';
ALTER TYPE motivo_revocacion ADD VALUE IF NOT EXISTS 'EXPIRACION';
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname='tipo_impuesto') THEN CREATE TYPE tipo_impuesto AS ENUM ('GRAVADO', 'EXENTO', 'EXCLUIDO', 'NO_APLICA'); END IF; END $$;
ALTER TYPE tipo_impuesto ADD VALUE IF NOT EXISTS 'GRAVADO';
ALTER TYPE tipo_impuesto ADD VALUE IF NOT EXISTS 'EXENTO';
ALTER TYPE tipo_impuesto ADD VALUE IF NOT EXISTS 'EXCLUIDO';
ALTER TYPE tipo_impuesto ADD VALUE IF NOT EXISTS 'NO_APLICA';
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname='estado_turno') THEN CREATE TYPE estado_turno AS ENUM ('ABIERTO', 'CERRADO', 'CUADRADO'); END IF; END $$;
ALTER TYPE estado_turno ADD VALUE IF NOT EXISTS 'ABIERTO';
ALTER TYPE estado_turno ADD VALUE IF NOT EXISTS 'CERRADO';
ALTER TYPE estado_turno ADD VALUE IF NOT EXISTS 'CUADRADO';
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname='tipo_producto') THEN CREATE TYPE tipo_producto AS ENUM ('SIMPLE', 'SERVICIO', 'COMPUESTO'); END IF; END $$;
ALTER TYPE tipo_producto ADD VALUE IF NOT EXISTS 'SIMPLE';
ALTER TYPE tipo_producto ADD VALUE IF NOT EXISTS 'SERVICIO';
ALTER TYPE tipo_producto ADD VALUE IF NOT EXISTS 'COMPUESTO';
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname='tipo_codigo_producto') THEN CREATE TYPE tipo_codigo_producto AS ENUM ('EAN13', 'EAN8', 'UPC', 'INTERNO', 'BALANZA', 'PLU'); END IF; END $$;
ALTER TYPE tipo_codigo_producto ADD VALUE IF NOT EXISTS 'EAN13';
ALTER TYPE tipo_codigo_producto ADD VALUE IF NOT EXISTS 'EAN8';
ALTER TYPE tipo_codigo_producto ADD VALUE IF NOT EXISTS 'UPC';
ALTER TYPE tipo_codigo_producto ADD VALUE IF NOT EXISTS 'INTERNO';
ALTER TYPE tipo_codigo_producto ADD VALUE IF NOT EXISTS 'BALANZA';
ALTER TYPE tipo_codigo_producto ADD VALUE IF NOT EXISTS 'PLU';
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname='tipo_documento_consecutivo') THEN CREATE TYPE tipo_documento_consecutivo AS ENUM ('VENTA', 'COMPRA', 'ABONO', 'DEVOLUCION_VENTA', 'DEVOLUCION_COMPRA', 'AJUSTE', 'TRASLADO'); END IF; END $$;
ALTER TYPE tipo_documento_consecutivo ADD VALUE IF NOT EXISTS 'VENTA';
ALTER TYPE tipo_documento_consecutivo ADD VALUE IF NOT EXISTS 'COMPRA';
ALTER TYPE tipo_documento_consecutivo ADD VALUE IF NOT EXISTS 'ABONO';
ALTER TYPE tipo_documento_consecutivo ADD VALUE IF NOT EXISTS 'DEVOLUCION_VENTA';
ALTER TYPE tipo_documento_consecutivo ADD VALUE IF NOT EXISTS 'DEVOLUCION_COMPRA';
ALTER TYPE tipo_documento_consecutivo ADD VALUE IF NOT EXISTS 'AJUSTE';
ALTER TYPE tipo_documento_consecutivo ADD VALUE IF NOT EXISTS 'TRASLADO';
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname='tipo_tasa_fuente') THEN CREATE TYPE tipo_tasa_fuente AS ENUM ('MANUAL', 'BCV', 'PARALELO', 'OTRO'); END IF; END $$;
ALTER TYPE tipo_tasa_fuente ADD VALUE IF NOT EXISTS 'MANUAL';
ALTER TYPE tipo_tasa_fuente ADD VALUE IF NOT EXISTS 'BCV';
ALTER TYPE tipo_tasa_fuente ADD VALUE IF NOT EXISTS 'PARALELO';
ALTER TYPE tipo_tasa_fuente ADD VALUE IF NOT EXISTS 'OTRO';
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname='tipo_metodo_pago_moneda') THEN CREATE TYPE tipo_metodo_pago_moneda AS ENUM ('USD', 'VES'); END IF; END $$;
ALTER TYPE tipo_metodo_pago_moneda ADD VALUE IF NOT EXISTS 'USD';
ALTER TYPE tipo_metodo_pago_moneda ADD VALUE IF NOT EXISTS 'VES';
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname='tipo_metodo_pago_tipo') THEN CREATE TYPE tipo_metodo_pago_tipo AS ENUM ('EFECTIVO', 'TARJETA_DEBITO', 'TARJETA_CREDITO', 'TRANSFERENCIA', 'PAGO_MOVIL', 'CRIPTO', 'CREDITO', 'BONO', 'OTRO'); END IF; END $$;
ALTER TYPE tipo_metodo_pago_tipo ADD VALUE IF NOT EXISTS 'EFECTIVO';
ALTER TYPE tipo_metodo_pago_tipo ADD VALUE IF NOT EXISTS 'TARJETA_DEBITO';
ALTER TYPE tipo_metodo_pago_tipo ADD VALUE IF NOT EXISTS 'TARJETA_CREDITO';
ALTER TYPE tipo_metodo_pago_tipo ADD VALUE IF NOT EXISTS 'TRANSFERENCIA';
ALTER TYPE tipo_metodo_pago_tipo ADD VALUE IF NOT EXISTS 'PAGO_MOVIL';
ALTER TYPE tipo_metodo_pago_tipo ADD VALUE IF NOT EXISTS 'CRIPTO';
ALTER TYPE tipo_metodo_pago_tipo ADD VALUE IF NOT EXISTS 'CREDITO';
ALTER TYPE tipo_metodo_pago_tipo ADD VALUE IF NOT EXISTS 'BONO';
ALTER TYPE tipo_metodo_pago_tipo ADD VALUE IF NOT EXISTS 'OTRO';
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname='condicion_pago') THEN CREATE TYPE condicion_pago AS ENUM ('CONTADO', 'CREDITO'); END IF; END $$;
ALTER TYPE condicion_pago ADD VALUE IF NOT EXISTS 'CONTADO';
ALTER TYPE condicion_pago ADD VALUE IF NOT EXISTS 'CREDITO';
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname='estado_venta') THEN CREATE TYPE estado_venta AS ENUM ('ABIERTA', 'CERRADA', 'ANULADA'); END IF; END $$;
ALTER TYPE estado_venta ADD VALUE IF NOT EXISTS 'ABIERTA';
ALTER TYPE estado_venta ADD VALUE IF NOT EXISTS 'CERRADA';
ALTER TYPE estado_venta ADD VALUE IF NOT EXISTS 'ANULADA';
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname='estado_compra') THEN CREATE TYPE estado_compra AS ENUM ('BORRADOR', 'RECIBIDA', 'ANULADA'); END IF; END $$;
ALTER TYPE estado_compra ADD VALUE IF NOT EXISTS 'BORRADOR';
ALTER TYPE estado_compra ADD VALUE IF NOT EXISTS 'RECIBIDA';
ALTER TYPE estado_compra ADD VALUE IF NOT EXISTS 'ANULADA';
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname='estado_credito') THEN CREATE TYPE estado_credito AS ENUM ('PENDIENTE', 'PARCIAL', 'PAGADO', 'VENCIDO', 'ANULADO'); END IF; END $$;
ALTER TYPE estado_credito ADD VALUE IF NOT EXISTS 'PENDIENTE';
ALTER TYPE estado_credito ADD VALUE IF NOT EXISTS 'PARCIAL';
ALTER TYPE estado_credito ADD VALUE IF NOT EXISTS 'PAGADO';
ALTER TYPE estado_credito ADD VALUE IF NOT EXISTS 'VENCIDO';
ALTER TYPE estado_credito ADD VALUE IF NOT EXISTS 'ANULADO';
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname='origen_credito') THEN CREATE TYPE origen_credito AS ENUM ('VENTA', 'SALDO_INICIAL', 'NOTA_DEBITO', 'AJUSTE'); END IF; END $$;
ALTER TYPE origen_credito ADD VALUE IF NOT EXISTS 'VENTA';
ALTER TYPE origen_credito ADD VALUE IF NOT EXISTS 'SALDO_INICIAL';
ALTER TYPE origen_credito ADD VALUE IF NOT EXISTS 'NOTA_DEBITO';
ALTER TYPE origen_credito ADD VALUE IF NOT EXISTS 'AJUSTE';
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname='estado_abono') THEN CREATE TYPE estado_abono AS ENUM ('APLICADO', 'ANULADO'); END IF; END $$;
ALTER TYPE estado_abono ADD VALUE IF NOT EXISTS 'APLICADO';
ALTER TYPE estado_abono ADD VALUE IF NOT EXISTS 'ANULADO';
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname='tipo_movimiento_inventario') THEN CREATE TYPE tipo_movimiento_inventario AS ENUM ('INICIAL', 'ENTRADA_COMPRA', 'SALIDA_VENTA', 'DEVOLUCION_CLIENTE', 'DEVOLUCION_PROVEEDOR', 'AJUSTE_POSITIVO', 'AJUSTE_NEGATIVO', 'MERMA', 'TRASLADO_ENTRADA', 'TRASLADO_SALIDA', 'ANULACION_VENTA', 'ANULACION_COMPRA'); END IF; END $$;
ALTER TYPE tipo_movimiento_inventario ADD VALUE IF NOT EXISTS 'INICIAL';
ALTER TYPE tipo_movimiento_inventario ADD VALUE IF NOT EXISTS 'ENTRADA_COMPRA';
ALTER TYPE tipo_movimiento_inventario ADD VALUE IF NOT EXISTS 'SALIDA_VENTA';
ALTER TYPE tipo_movimiento_inventario ADD VALUE IF NOT EXISTS 'DEVOLUCION_CLIENTE';
ALTER TYPE tipo_movimiento_inventario ADD VALUE IF NOT EXISTS 'DEVOLUCION_PROVEEDOR';
ALTER TYPE tipo_movimiento_inventario ADD VALUE IF NOT EXISTS 'AJUSTE_POSITIVO';
ALTER TYPE tipo_movimiento_inventario ADD VALUE IF NOT EXISTS 'AJUSTE_NEGATIVO';
ALTER TYPE tipo_movimiento_inventario ADD VALUE IF NOT EXISTS 'MERMA';
ALTER TYPE tipo_movimiento_inventario ADD VALUE IF NOT EXISTS 'TRASLADO_ENTRADA';
ALTER TYPE tipo_movimiento_inventario ADD VALUE IF NOT EXISTS 'TRASLADO_SALIDA';
ALTER TYPE tipo_movimiento_inventario ADD VALUE IF NOT EXISTS 'ANULACION_VENTA';
ALTER TYPE tipo_movimiento_inventario ADD VALUE IF NOT EXISTS 'ANULACION_COMPRA';
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname='tipo_documento_movimiento') THEN CREATE TYPE tipo_documento_movimiento AS ENUM ('VENTA', 'COMPRA', 'AJUSTE', 'DEVOLUCION', 'TRASLADO', 'INICIAL'); END IF; END $$;
ALTER TYPE tipo_documento_movimiento ADD VALUE IF NOT EXISTS 'VENTA';
ALTER TYPE tipo_documento_movimiento ADD VALUE IF NOT EXISTS 'COMPRA';
ALTER TYPE tipo_documento_movimiento ADD VALUE IF NOT EXISTS 'AJUSTE';
ALTER TYPE tipo_documento_movimiento ADD VALUE IF NOT EXISTS 'DEVOLUCION';
ALTER TYPE tipo_documento_movimiento ADD VALUE IF NOT EXISTS 'TRASLADO';
ALTER TYPE tipo_documento_movimiento ADD VALUE IF NOT EXISTS 'INICIAL';
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname='estado_ajuste') THEN CREATE TYPE estado_ajuste AS ENUM ('BORRADOR', 'APLICADO', 'ANULADO'); END IF; END $$;
ALTER TYPE estado_ajuste ADD VALUE IF NOT EXISTS 'BORRADOR';
ALTER TYPE estado_ajuste ADD VALUE IF NOT EXISTS 'APLICADO';
ALTER TYPE estado_ajuste ADD VALUE IF NOT EXISTS 'ANULADO';
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname='tipo_ajuste') THEN CREATE TYPE tipo_ajuste AS ENUM ('AJUSTE_MANUAL', 'CONTEO_FISICO', 'MERMA', 'TRASLADO'); END IF; END $$;
ALTER TYPE tipo_ajuste ADD VALUE IF NOT EXISTS 'AJUSTE_MANUAL';
ALTER TYPE tipo_ajuste ADD VALUE IF NOT EXISTS 'CONTEO_FISICO';
ALTER TYPE tipo_ajuste ADD VALUE IF NOT EXISTS 'MERMA';
ALTER TYPE tipo_ajuste ADD VALUE IF NOT EXISTS 'TRASLADO';
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname='tipo_devolucion') THEN CREATE TYPE tipo_devolucion AS ENUM ('VENTA', 'COMPRA'); END IF; END $$;
ALTER TYPE tipo_devolucion ADD VALUE IF NOT EXISTS 'VENTA';
ALTER TYPE tipo_devolucion ADD VALUE IF NOT EXISTS 'COMPRA';
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname='forma_reintegro') THEN CREATE TYPE forma_reintegro AS ENUM ('EFECTIVO', 'NOTA_CREDITO', 'ABONO_CREDITO', 'CAMBIO_PRODUCTO'); END IF; END $$;
ALTER TYPE forma_reintegro ADD VALUE IF NOT EXISTS 'EFECTIVO';
ALTER TYPE forma_reintegro ADD VALUE IF NOT EXISTS 'NOTA_CREDITO';
ALTER TYPE forma_reintegro ADD VALUE IF NOT EXISTS 'ABONO_CREDITO';
ALTER TYPE forma_reintegro ADD VALUE IF NOT EXISTS 'CAMBIO_PRODUCTO';
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname='estado_devolucion') THEN CREATE TYPE estado_devolucion AS ENUM ('APLICADA', 'ANULADA'); END IF; END $$;
ALTER TYPE estado_devolucion ADD VALUE IF NOT EXISTS 'APLICADA';
ALTER TYPE estado_devolucion ADD VALUE IF NOT EXISTS 'ANULADA';
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname='tipo_movimiento_caja') THEN CREATE TYPE tipo_movimiento_caja AS ENUM ('BASE', 'VENTA', 'ABONO', 'INGRESO', 'EGRESO', 'RETIRO', 'DEVOLUCION', 'VUELTAS', 'AJUSTE'); END IF; END $$;
ALTER TYPE tipo_movimiento_caja ADD VALUE IF NOT EXISTS 'BASE';
ALTER TYPE tipo_movimiento_caja ADD VALUE IF NOT EXISTS 'VENTA';
ALTER TYPE tipo_movimiento_caja ADD VALUE IF NOT EXISTS 'ABONO';
ALTER TYPE tipo_movimiento_caja ADD VALUE IF NOT EXISTS 'INGRESO';
ALTER TYPE tipo_movimiento_caja ADD VALUE IF NOT EXISTS 'EGRESO';
ALTER TYPE tipo_movimiento_caja ADD VALUE IF NOT EXISTS 'RETIRO';
ALTER TYPE tipo_movimiento_caja ADD VALUE IF NOT EXISTS 'DEVOLUCION';
ALTER TYPE tipo_movimiento_caja ADD VALUE IF NOT EXISTS 'VUELTAS';
ALTER TYPE tipo_movimiento_caja ADD VALUE IF NOT EXISTS 'AJUSTE';
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname='documento_tipo_caja') THEN CREATE TYPE documento_tipo_caja AS ENUM ('VENTA', 'ABONO', 'DEVOLUCION', 'MANUAL'); END IF; END $$;
ALTER TYPE documento_tipo_caja ADD VALUE IF NOT EXISTS 'VENTA';
ALTER TYPE documento_tipo_caja ADD VALUE IF NOT EXISTS 'ABONO';
ALTER TYPE documento_tipo_caja ADD VALUE IF NOT EXISTS 'DEVOLUCION';
ALTER TYPE documento_tipo_caja ADD VALUE IF NOT EXISTS 'MANUAL';
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname='estado_idempotencia') THEN CREATE TYPE estado_idempotencia AS ENUM ('EN_PROCESO', 'COMPLETADA', 'FALLIDA'); END IF; END $$;
ALTER TYPE estado_idempotencia ADD VALUE IF NOT EXISTS 'EN_PROCESO';
ALTER TYPE estado_idempotencia ADD VALUE IF NOT EXISTS 'COMPLETADA';
ALTER TYPE estado_idempotencia ADD VALUE IF NOT EXISTS 'FALLIDA';
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname='estado_exportacion') THEN CREATE TYPE estado_exportacion AS ENUM ('PENDIENTE', 'PROCESANDO', 'COMPLETADO', 'FALLIDO'); END IF; END $$;
ALTER TYPE estado_exportacion ADD VALUE IF NOT EXISTS 'PENDIENTE';
ALTER TYPE estado_exportacion ADD VALUE IF NOT EXISTS 'PROCESANDO';
ALTER TYPE estado_exportacion ADD VALUE IF NOT EXISTS 'COMPLETADO';
ALTER TYPE estado_exportacion ADD VALUE IF NOT EXISTS 'FALLIDO';
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname='formato_exportacion') THEN CREATE TYPE formato_exportacion AS ENUM ('PDF', 'EXCEL', 'CSV'); END IF; END $$;
ALTER TYPE formato_exportacion ADD VALUE IF NOT EXISTS 'PDF';
ALTER TYPE formato_exportacion ADD VALUE IF NOT EXISTS 'EXCEL';
ALTER TYPE formato_exportacion ADD VALUE IF NOT EXISTS 'CSV';
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname='accion_auditoria') THEN CREATE TYPE accion_auditoria AS ENUM ('CREAR', 'ACTUALIZAR', 'ELIMINAR', 'ANULAR', 'LOGIN', 'LOGIN_FALLIDO', 'LOGOUT', 'EXPORTAR', 'AJUSTE_STOCK', 'CAMBIO_PRECIO', 'CAMBIO_COSTO', 'CAMBIO_TASA', 'CORRECCION_TASA', 'CAMBIO_PERMISOS', 'CAMBIO_CONFIG', 'RECONCILIACION'); END IF; END $$;
ALTER TYPE accion_auditoria ADD VALUE IF NOT EXISTS 'CREAR';
ALTER TYPE accion_auditoria ADD VALUE IF NOT EXISTS 'ACTUALIZAR';
ALTER TYPE accion_auditoria ADD VALUE IF NOT EXISTS 'ELIMINAR';
ALTER TYPE accion_auditoria ADD VALUE IF NOT EXISTS 'ANULAR';
ALTER TYPE accion_auditoria ADD VALUE IF NOT EXISTS 'LOGIN';
ALTER TYPE accion_auditoria ADD VALUE IF NOT EXISTS 'LOGIN_FALLIDO';
ALTER TYPE accion_auditoria ADD VALUE IF NOT EXISTS 'LOGOUT';
ALTER TYPE accion_auditoria ADD VALUE IF NOT EXISTS 'EXPORTAR';
ALTER TYPE accion_auditoria ADD VALUE IF NOT EXISTS 'AJUSTE_STOCK';
ALTER TYPE accion_auditoria ADD VALUE IF NOT EXISTS 'CAMBIO_PRECIO';
ALTER TYPE accion_auditoria ADD VALUE IF NOT EXISTS 'CAMBIO_COSTO';
ALTER TYPE accion_auditoria ADD VALUE IF NOT EXISTS 'CAMBIO_TASA';
ALTER TYPE accion_auditoria ADD VALUE IF NOT EXISTS 'CORRECCION_TASA';
ALTER TYPE accion_auditoria ADD VALUE IF NOT EXISTS 'CAMBIO_PERMISOS';
ALTER TYPE accion_auditoria ADD VALUE IF NOT EXISTS 'CAMBIO_CONFIG';
ALTER TYPE accion_auditoria ADD VALUE IF NOT EXISTS 'RECONCILIACION';
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname='tipo_documento_identidad') THEN CREATE TYPE tipo_documento_identidad AS ENUM ('CC', 'CE', 'NIT', 'PASAPORTE', 'SIN_IDENTIFICAR'); END IF; END $$;
ALTER TYPE tipo_documento_identidad ADD VALUE IF NOT EXISTS 'CC';
ALTER TYPE tipo_documento_identidad ADD VALUE IF NOT EXISTS 'CE';
ALTER TYPE tipo_documento_identidad ADD VALUE IF NOT EXISTS 'NIT';
ALTER TYPE tipo_documento_identidad ADD VALUE IF NOT EXISTS 'PASAPORTE';
ALTER TYPE tipo_documento_identidad ADD VALUE IF NOT EXISTS 'SIN_IDENTIFICAR';
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname='tipo_parametro') THEN CREATE TYPE tipo_parametro AS ENUM ('STRING', 'INT', 'DECIMAL', 'BOOL', 'JSON'); END IF; END $$;
ALTER TYPE tipo_parametro ADD VALUE IF NOT EXISTS 'STRING';
ALTER TYPE tipo_parametro ADD VALUE IF NOT EXISTS 'INT';
ALTER TYPE tipo_parametro ADD VALUE IF NOT EXISTS 'DECIMAL';
ALTER TYPE tipo_parametro ADD VALUE IF NOT EXISTS 'BOOL';
ALTER TYPE tipo_parametro ADD VALUE IF NOT EXISTS 'JSON';
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname='regimen') THEN CREATE TYPE regimen AS ENUM ('SIMPLIFICADO', 'COMUN', 'SIMPLE', 'NO_APLICA'); END IF; END $$;
ALTER TYPE regimen ADD VALUE IF NOT EXISTS 'SIMPLIFICADO';
ALTER TYPE regimen ADD VALUE IF NOT EXISTS 'COMUN';
ALTER TYPE regimen ADD VALUE IF NOT EXISTS 'SIMPLE';
ALTER TYPE regimen ADD VALUE IF NOT EXISTS 'NO_APLICA';

-- Tablas y columnas
CREATE TABLE IF NOT EXISTS sucursales (
  id             BIGINT GENERATED BY DEFAULT AS IDENTITY NOT NULL,
  codigo         VARCHAR(20)  NOT NULL,
  nombre         VARCHAR(120) NOT NULL,
  direccion      VARCHAR(200),
  telefono       VARCHAR(40),
  es_principal   BOOLEAN      NOT NULL DEFAULT FALSE,
  esta_activa    BOOLEAN      NOT NULL DEFAULT TRUE,
  creado_en      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_en TIMESTAMP(3),
  eliminado_en   TIMESTAMP(3),
  PRIMARY KEY (id)
);
ALTER TABLE sucursales ADD COLUMN IF NOT EXISTS id             BIGINT GENERATED BY DEFAULT AS IDENTITY NOT NULL;
ALTER TABLE sucursales ADD COLUMN IF NOT EXISTS codigo         VARCHAR(20)  NOT NULL;
ALTER TABLE sucursales ADD COLUMN IF NOT EXISTS nombre         VARCHAR(120) NOT NULL;
ALTER TABLE sucursales ADD COLUMN IF NOT EXISTS direccion      VARCHAR(200);
ALTER TABLE sucursales ADD COLUMN IF NOT EXISTS telefono       VARCHAR(40);
ALTER TABLE sucursales ADD COLUMN IF NOT EXISTS es_principal   BOOLEAN      NOT NULL DEFAULT FALSE;
ALTER TABLE sucursales ADD COLUMN IF NOT EXISTS esta_activa    BOOLEAN      NOT NULL DEFAULT TRUE;
ALTER TABLE sucursales ADD COLUMN IF NOT EXISTS creado_en      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE sucursales ADD COLUMN IF NOT EXISTS actualizado_en TIMESTAMP(3);
ALTER TABLE sucursales ADD COLUMN IF NOT EXISTS eliminado_en   TIMESTAMP(3);

CREATE TABLE IF NOT EXISTS roles (
  id             BIGINT GENERATED BY DEFAULT AS IDENTITY NOT NULL,
  codigo         codigo_rol   NOT NULL,
  nombre         VARCHAR(80)  NOT NULL,
  descripcion    VARCHAR(200),
  es_sistema     BOOLEAN      NOT NULL DEFAULT FALSE,
  esta_activo    BOOLEAN      NOT NULL DEFAULT TRUE,
  creado_en      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_en TIMESTAMP(3),
  eliminado_en   TIMESTAMP(3),
  PRIMARY KEY (id)
);
ALTER TABLE roles ADD COLUMN IF NOT EXISTS id             BIGINT GENERATED BY DEFAULT AS IDENTITY NOT NULL;
ALTER TABLE roles ADD COLUMN IF NOT EXISTS codigo         codigo_rol   NOT NULL;
ALTER TABLE roles ADD COLUMN IF NOT EXISTS nombre         VARCHAR(80)  NOT NULL;
ALTER TABLE roles ADD COLUMN IF NOT EXISTS descripcion    VARCHAR(200);
ALTER TABLE roles ADD COLUMN IF NOT EXISTS es_sistema     BOOLEAN      NOT NULL DEFAULT FALSE;
ALTER TABLE roles ADD COLUMN IF NOT EXISTS esta_activo    BOOLEAN      NOT NULL DEFAULT TRUE;
ALTER TABLE roles ADD COLUMN IF NOT EXISTS creado_en      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE roles ADD COLUMN IF NOT EXISTS actualizado_en TIMESTAMP(3);
ALTER TABLE roles ADD COLUMN IF NOT EXISTS eliminado_en   TIMESTAMP(3);

CREATE TABLE IF NOT EXISTS permisos (
  id          BIGINT GENERATED BY DEFAULT AS IDENTITY NOT NULL,
  codigo      VARCHAR(60)  NOT NULL,
  modulo      VARCHAR(40)  NOT NULL,
  accion      VARCHAR(40)  NOT NULL,
  descripcion VARCHAR(200),
  creado_en   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id)
);
ALTER TABLE permisos ADD COLUMN IF NOT EXISTS id          BIGINT GENERATED BY DEFAULT AS IDENTITY NOT NULL;
ALTER TABLE permisos ADD COLUMN IF NOT EXISTS codigo      VARCHAR(60)  NOT NULL;
ALTER TABLE permisos ADD COLUMN IF NOT EXISTS modulo      VARCHAR(40)  NOT NULL;
ALTER TABLE permisos ADD COLUMN IF NOT EXISTS accion      VARCHAR(40)  NOT NULL;
ALTER TABLE permisos ADD COLUMN IF NOT EXISTS descripcion VARCHAR(200);
ALTER TABLE permisos ADD COLUMN IF NOT EXISTS creado_en   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE TABLE IF NOT EXISTS rol_permisos (
  rol_id     BIGINT NOT NULL,
  permiso_id BIGINT NOT NULL,
  creado_en  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (rol_id, permiso_id)
);
ALTER TABLE rol_permisos ADD COLUMN IF NOT EXISTS rol_id     BIGINT NOT NULL;
ALTER TABLE rol_permisos ADD COLUMN IF NOT EXISTS permiso_id BIGINT NOT NULL;
ALTER TABLE rol_permisos ADD COLUMN IF NOT EXISTS creado_en  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE TABLE IF NOT EXISTS usuarios (
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
  bloqueado_hasta            TIMESTAMP(3),
  ultimo_acceso_en           TIMESTAMP(3),
  debe_cambiar_password      BOOLEAN      NOT NULL DEFAULT FALSE,
  esta_activo                BOOLEAN      NOT NULL DEFAULT TRUE,
  creado_en                  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_en             TIMESTAMP(3),
  eliminado_en               TIMESTAMP(3),
  PRIMARY KEY (id)
);
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS id                         BIGINT GENERATED BY DEFAULT AS IDENTITY NOT NULL;
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS usuario                    VARCHAR(60)  NOT NULL;
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS email                      VARCHAR(160);
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS nombre_completo            VARCHAR(140) NOT NULL;
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS documento                  VARCHAR(30);
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS telefono                   VARCHAR(40);
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS password_hash              CHAR(60)     NOT NULL;
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS rol_id                     BIGINT NOT NULL;
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS sucursal_predeterminada_id BIGINT;
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS intentos_fallidos          INTEGER      NOT NULL DEFAULT 0 CHECK (intentos_fallidos >= 0);
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS bloqueado_hasta            TIMESTAMP(3);
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS ultimo_acceso_en           TIMESTAMP(3);
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS debe_cambiar_password      BOOLEAN      NOT NULL DEFAULT FALSE;
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS esta_activo                BOOLEAN      NOT NULL DEFAULT TRUE;
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS creado_en                  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS actualizado_en             TIMESTAMP(3);
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS eliminado_en               TIMESTAMP(3);

CREATE TABLE IF NOT EXISTS usuario_sucursales (
  usuario_id  BIGINT NOT NULL,
  sucursal_id BIGINT NOT NULL,
  rol_id      BIGINT NOT NULL,
  creado_en   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (usuario_id, sucursal_id)
);
ALTER TABLE usuario_sucursales ADD COLUMN IF NOT EXISTS usuario_id  BIGINT NOT NULL;
ALTER TABLE usuario_sucursales ADD COLUMN IF NOT EXISTS sucursal_id BIGINT NOT NULL;
ALTER TABLE usuario_sucursales ADD COLUMN IF NOT EXISTS rol_id      BIGINT NOT NULL;
ALTER TABLE usuario_sucursales ADD COLUMN IF NOT EXISTS creado_en   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE TABLE IF NOT EXISTS sesiones (
  id                 BIGINT GENERATED BY DEFAULT AS IDENTITY NOT NULL,
  usuario_id         BIGINT NOT NULL,
  token_hash         CHAR(64)     NOT NULL,
  familia_id         UUID         NOT NULL,
  reemplazada_por_id BIGINT,
  ip                 INET,
  user_agent         VARCHAR(255),
  expira_en          TIMESTAMP(3) NOT NULL,
  revocada_en        TIMESTAMP(3),
  motivo_revocacion  motivo_revocacion,
  creado_en          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id)
);
ALTER TABLE sesiones ADD COLUMN IF NOT EXISTS id                 BIGINT GENERATED BY DEFAULT AS IDENTITY NOT NULL;
ALTER TABLE sesiones ADD COLUMN IF NOT EXISTS usuario_id         BIGINT NOT NULL;
ALTER TABLE sesiones ADD COLUMN IF NOT EXISTS token_hash         CHAR(64)     NOT NULL;
ALTER TABLE sesiones ADD COLUMN IF NOT EXISTS familia_id         UUID         NOT NULL;
ALTER TABLE sesiones ADD COLUMN IF NOT EXISTS reemplazada_por_id BIGINT;
ALTER TABLE sesiones ADD COLUMN IF NOT EXISTS ip                 INET;
ALTER TABLE sesiones ADD COLUMN IF NOT EXISTS user_agent         VARCHAR(255);
ALTER TABLE sesiones ADD COLUMN IF NOT EXISTS expira_en          TIMESTAMP(3) NOT NULL;
ALTER TABLE sesiones ADD COLUMN IF NOT EXISTS revocada_en        TIMESTAMP(3);
ALTER TABLE sesiones ADD COLUMN IF NOT EXISTS motivo_revocacion  motivo_revocacion;
ALTER TABLE sesiones ADD COLUMN IF NOT EXISTS creado_en          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE TABLE IF NOT EXISTS unidades_medida (
  id                  BIGINT GENERATED BY DEFAULT AS IDENTITY NOT NULL,
  codigo              VARCHAR(10) NOT NULL,
  nombre              VARCHAR(60) NOT NULL,
  es_permite_fraccion BOOLEAN     NOT NULL DEFAULT FALSE,
  decimales           INTEGER     NOT NULL DEFAULT 0 CHECK (decimales >= 0),
  esta_activa         BOOLEAN     NOT NULL DEFAULT TRUE,
  creado_en           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_en      TIMESTAMP(3),
  eliminado_en        TIMESTAMP(3),
  PRIMARY KEY (id)
);
ALTER TABLE unidades_medida ADD COLUMN IF NOT EXISTS id                  BIGINT GENERATED BY DEFAULT AS IDENTITY NOT NULL;
ALTER TABLE unidades_medida ADD COLUMN IF NOT EXISTS codigo              VARCHAR(10) NOT NULL;
ALTER TABLE unidades_medida ADD COLUMN IF NOT EXISTS nombre              VARCHAR(60) NOT NULL;
ALTER TABLE unidades_medida ADD COLUMN IF NOT EXISTS es_permite_fraccion BOOLEAN     NOT NULL DEFAULT FALSE;
ALTER TABLE unidades_medida ADD COLUMN IF NOT EXISTS decimales           INTEGER     NOT NULL DEFAULT 0 CHECK (decimales >= 0);
ALTER TABLE unidades_medida ADD COLUMN IF NOT EXISTS esta_activa         BOOLEAN     NOT NULL DEFAULT TRUE;
ALTER TABLE unidades_medida ADD COLUMN IF NOT EXISTS creado_en           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE unidades_medida ADD COLUMN IF NOT EXISTS actualizado_en      TIMESTAMP(3);
ALTER TABLE unidades_medida ADD COLUMN IF NOT EXISTS eliminado_en        TIMESTAMP(3);

CREATE TABLE IF NOT EXISTS impuestos (
  id             BIGINT GENERATED BY DEFAULT AS IDENTITY NOT NULL,
  codigo         VARCHAR(20) NOT NULL,
  nombre         VARCHAR(80) NOT NULL,
  tasa           DECIMAL(6,3) NOT NULL DEFAULT 0 CHECK (tasa >= 0 AND tasa <= 100),
  tipo           tipo_impuesto NOT NULL DEFAULT 'GRAVADO',
  vigente_desde  DATE NOT NULL,
  vigente_hasta  DATE,
  esta_activo    BOOLEAN     NOT NULL DEFAULT TRUE,
  creado_en      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_en TIMESTAMP(3),
  eliminado_en   TIMESTAMP(3),
  PRIMARY KEY (id)
);
ALTER TABLE impuestos ADD COLUMN IF NOT EXISTS id             BIGINT GENERATED BY DEFAULT AS IDENTITY NOT NULL;
ALTER TABLE impuestos ADD COLUMN IF NOT EXISTS codigo         VARCHAR(20) NOT NULL;
ALTER TABLE impuestos ADD COLUMN IF NOT EXISTS nombre         VARCHAR(80) NOT NULL;
ALTER TABLE impuestos ADD COLUMN IF NOT EXISTS tasa           DECIMAL(6,3) NOT NULL DEFAULT 0 CHECK (tasa >= 0 AND tasa <= 100);
ALTER TABLE impuestos ADD COLUMN IF NOT EXISTS tipo           tipo_impuesto NOT NULL DEFAULT 'GRAVADO';
ALTER TABLE impuestos ADD COLUMN IF NOT EXISTS vigente_desde  DATE NOT NULL;
ALTER TABLE impuestos ADD COLUMN IF NOT EXISTS vigente_hasta  DATE;
ALTER TABLE impuestos ADD COLUMN IF NOT EXISTS esta_activo    BOOLEAN     NOT NULL DEFAULT TRUE;
ALTER TABLE impuestos ADD COLUMN IF NOT EXISTS creado_en      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE impuestos ADD COLUMN IF NOT EXISTS actualizado_en TIMESTAMP(3);
ALTER TABLE impuestos ADD COLUMN IF NOT EXISTS eliminado_en   TIMESTAMP(3);

CREATE TABLE IF NOT EXISTS configuracion (
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
  creado_en                       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_en                  TIMESTAMP(3),
  PRIMARY KEY (id)
);
ALTER TABLE configuracion ADD COLUMN IF NOT EXISTS id                              INTEGER NOT NULL DEFAULT 1 CHECK (id = 1);
ALTER TABLE configuracion ADD COLUMN IF NOT EXISTS nombre_negocio                  VARCHAR(120) NOT NULL;
ALTER TABLE configuracion ADD COLUMN IF NOT EXISTS razon_social                    VARCHAR(160);
ALTER TABLE configuracion ADD COLUMN IF NOT EXISTS nit                             VARCHAR(32);
ALTER TABLE configuracion ADD COLUMN IF NOT EXISTS regimen                         regimen NOT NULL DEFAULT 'NO_APLICA';
ALTER TABLE configuracion ADD COLUMN IF NOT EXISTS logo_ruta                       VARCHAR(255);
ALTER TABLE configuracion ADD COLUMN IF NOT EXISTS direccion                       VARCHAR(200);
ALTER TABLE configuracion ADD COLUMN IF NOT EXISTS telefono                        VARCHAR(40);
ALTER TABLE configuracion ADD COLUMN IF NOT EXISTS email                           VARCHAR(160);
ALTER TABLE configuracion ADD COLUMN IF NOT EXISTS moneda_base                     CHAR(3) NOT NULL DEFAULT 'USD';
ALTER TABLE configuracion ADD COLUMN IF NOT EXISTS moneda_secundaria               CHAR(3) NOT NULL DEFAULT 'VES';
ALTER TABLE configuracion ADD COLUMN IF NOT EXISTS moneda_base_simbolo             VARCHAR(5) NOT NULL DEFAULT '$';
ALTER TABLE configuracion ADD COLUMN IF NOT EXISTS moneda_secundaria_simbolo       VARCHAR(5) NOT NULL DEFAULT 'Bs';
ALTER TABLE configuracion ADD COLUMN IF NOT EXISTS decimales_usd                   INTEGER NOT NULL DEFAULT 2 CHECK (decimales_usd >= 0);
ALTER TABLE configuracion ADD COLUMN IF NOT EXISTS decimales_bs                    INTEGER NOT NULL DEFAULT 2 CHECK (decimales_bs >= 0);
ALTER TABLE configuracion ADD COLUMN IF NOT EXISTS redondeo_bs_multiplo            DECIMAL(10,2) NOT NULL DEFAULT 0;
ALTER TABLE configuracion ADD COLUMN IF NOT EXISTS es_bloquea_venta_sin_tasa       BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE configuracion ADD COLUMN IF NOT EXISTS impuesto_predeterminado_id      BIGINT;
ALTER TABLE configuracion ADD COLUMN IF NOT EXISTS es_precio_incluye_impuesto      BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE configuracion ADD COLUMN IF NOT EXISTS redondeo_multiplo               INTEGER NOT NULL DEFAULT 50 CHECK (redondeo_multiplo > 0);
ALTER TABLE configuracion ADD COLUMN IF NOT EXISTS ticket_encabezado               VARCHAR(255);
ALTER TABLE configuracion ADD COLUMN IF NOT EXISTS ticket_pie                      VARCHAR(255);
ALTER TABLE configuracion ADD COLUMN IF NOT EXISTS ticket_mensaje_legal            VARCHAR(255);
ALTER TABLE configuracion ADD COLUMN IF NOT EXISTS es_ticket_mostrar_logo          BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE configuracion ADD COLUMN IF NOT EXISTS es_ticket_mostrar_nit           BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE configuracion ADD COLUMN IF NOT EXISTS es_ticket_muestra_ambas_monedas BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE configuracion ADD COLUMN IF NOT EXISTS es_ticket_muestra_tasa          BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE configuracion ADD COLUMN IF NOT EXISTS ticket_ancho_mm                 INTEGER NOT NULL DEFAULT 80 CHECK (ticket_ancho_mm > 0);
ALTER TABLE configuracion ADD COLUMN IF NOT EXISTS es_credito_requiere_autorizacion BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE configuracion ADD COLUMN IF NOT EXISTS es_permite_stock_negativo       BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE configuracion ADD COLUMN IF NOT EXISTS dias_plazo_credito_defecto      INTEGER NOT NULL DEFAULT 30 CHECK (dias_plazo_credito_defecto >= 0);
ALTER TABLE configuracion ADD COLUMN IF NOT EXISTS zona_horaria                    VARCHAR(40) NOT NULL DEFAULT 'America/Caracas';
ALTER TABLE configuracion ADD COLUMN IF NOT EXISTS actualizado_por                 BIGINT;
ALTER TABLE configuracion ADD COLUMN IF NOT EXISTS creado_en                       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE configuracion ADD COLUMN IF NOT EXISTS actualizado_en                  TIMESTAMP(3);

CREATE TABLE IF NOT EXISTS parametros (
  clave           VARCHAR(64)  NOT NULL,
  valor           VARCHAR(255) NOT NULL,
  tipo            tipo_parametro NOT NULL DEFAULT 'STRING',
  descripcion     VARCHAR(200),
  es_editable     BOOLEAN      NOT NULL DEFAULT TRUE,
  actualizado_por BIGINT,
  creado_en       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_en  TIMESTAMP(3),
  PRIMARY KEY (clave)
);
ALTER TABLE parametros ADD COLUMN IF NOT EXISTS clave           VARCHAR(64)  NOT NULL;
ALTER TABLE parametros ADD COLUMN IF NOT EXISTS valor           VARCHAR(255) NOT NULL;
ALTER TABLE parametros ADD COLUMN IF NOT EXISTS tipo            tipo_parametro NOT NULL DEFAULT 'STRING';
ALTER TABLE parametros ADD COLUMN IF NOT EXISTS descripcion     VARCHAR(200);
ALTER TABLE parametros ADD COLUMN IF NOT EXISTS es_editable     BOOLEAN      NOT NULL DEFAULT TRUE;
ALTER TABLE parametros ADD COLUMN IF NOT EXISTS actualizado_por BIGINT;
ALTER TABLE parametros ADD COLUMN IF NOT EXISTS creado_en       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE parametros ADD COLUMN IF NOT EXISTS actualizado_en  TIMESTAMP(3);

CREATE TABLE IF NOT EXISTS tasas_cambio (
  id              BIGINT GENERATED BY DEFAULT AS IDENTITY NOT NULL,
  fecha           DATE NOT NULL,
  tasa            DECIMAL(18,6) NOT NULL CHECK (tasa > 0),
  fuente          tipo_tasa_fuente NOT NULL DEFAULT 'MANUAL',
  es_correccion   BOOLEAN NOT NULL DEFAULT FALSE,
  corrige_tasa_id BIGINT,
  notas           VARCHAR(255),
  usuario_id      BIGINT NOT NULL,
  creado_en       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_en  TIMESTAMP(3),
  eliminado_en    TIMESTAMP(3),
  PRIMARY KEY (id)
);
ALTER TABLE tasas_cambio ADD COLUMN IF NOT EXISTS id              BIGINT GENERATED BY DEFAULT AS IDENTITY NOT NULL;
ALTER TABLE tasas_cambio ADD COLUMN IF NOT EXISTS fecha           DATE NOT NULL;
ALTER TABLE tasas_cambio ADD COLUMN IF NOT EXISTS tasa            DECIMAL(18,6) NOT NULL CHECK (tasa > 0);
ALTER TABLE tasas_cambio ADD COLUMN IF NOT EXISTS fuente          tipo_tasa_fuente NOT NULL DEFAULT 'MANUAL';
ALTER TABLE tasas_cambio ADD COLUMN IF NOT EXISTS es_correccion   BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE tasas_cambio ADD COLUMN IF NOT EXISTS corrige_tasa_id BIGINT;
ALTER TABLE tasas_cambio ADD COLUMN IF NOT EXISTS notas           VARCHAR(255);
ALTER TABLE tasas_cambio ADD COLUMN IF NOT EXISTS usuario_id      BIGINT NOT NULL;
ALTER TABLE tasas_cambio ADD COLUMN IF NOT EXISTS creado_en       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE tasas_cambio ADD COLUMN IF NOT EXISTS actualizado_en  TIMESTAMP(3);
ALTER TABLE tasas_cambio ADD COLUMN IF NOT EXISTS eliminado_en    TIMESTAMP(3);

CREATE TABLE IF NOT EXISTS categorias (
  id                 BIGINT GENERATED BY DEFAULT AS IDENTITY NOT NULL,
  categoria_padre_id BIGINT,
  codigo             VARCHAR(30),
  nombre             VARCHAR(100) NOT NULL,
  descripcion        VARCHAR(255),
  color_hex          CHAR(7),
  orden              INTEGER NOT NULL DEFAULT 0 CHECK (orden >= 0),
  esta_activa        BOOLEAN NOT NULL DEFAULT TRUE,
  creado_en          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_en     TIMESTAMP(3),
  eliminado_en       TIMESTAMP(3),
  PRIMARY KEY (id)
);
ALTER TABLE categorias ADD COLUMN IF NOT EXISTS id                 BIGINT GENERATED BY DEFAULT AS IDENTITY NOT NULL;
ALTER TABLE categorias ADD COLUMN IF NOT EXISTS categoria_padre_id BIGINT;
ALTER TABLE categorias ADD COLUMN IF NOT EXISTS codigo             VARCHAR(30);
ALTER TABLE categorias ADD COLUMN IF NOT EXISTS nombre             VARCHAR(100) NOT NULL;
ALTER TABLE categorias ADD COLUMN IF NOT EXISTS descripcion        VARCHAR(255);
ALTER TABLE categorias ADD COLUMN IF NOT EXISTS color_hex          CHAR(7);
ALTER TABLE categorias ADD COLUMN IF NOT EXISTS orden              INTEGER NOT NULL DEFAULT 0 CHECK (orden >= 0);
ALTER TABLE categorias ADD COLUMN IF NOT EXISTS esta_activa        BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE categorias ADD COLUMN IF NOT EXISTS creado_en          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE categorias ADD COLUMN IF NOT EXISTS actualizado_en     TIMESTAMP(3);
ALTER TABLE categorias ADD COLUMN IF NOT EXISTS eliminado_en       TIMESTAMP(3);

CREATE TABLE IF NOT EXISTS proveedores (
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
  creado_en        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_en   TIMESTAMP(3),
  eliminado_en     TIMESTAMP(3),
  PRIMARY KEY (id)
);
ALTER TABLE proveedores ADD COLUMN IF NOT EXISTS id               BIGINT GENERATED BY DEFAULT AS IDENTITY NOT NULL;
ALTER TABLE proveedores ADD COLUMN IF NOT EXISTS nit              VARCHAR(32);
ALTER TABLE proveedores ADD COLUMN IF NOT EXISTS razon_social     VARCHAR(160) NOT NULL;
ALTER TABLE proveedores ADD COLUMN IF NOT EXISTS nombre_comercial VARCHAR(120);
ALTER TABLE proveedores ADD COLUMN IF NOT EXISTS contacto_nombre  VARCHAR(120);
ALTER TABLE proveedores ADD COLUMN IF NOT EXISTS telefono         VARCHAR(40);
ALTER TABLE proveedores ADD COLUMN IF NOT EXISTS email            VARCHAR(160);
ALTER TABLE proveedores ADD COLUMN IF NOT EXISTS direccion        VARCHAR(200);
ALTER TABLE proveedores ADD COLUMN IF NOT EXISTS ciudad           VARCHAR(80);
ALTER TABLE proveedores ADD COLUMN IF NOT EXISTS dias_plazo       INTEGER NOT NULL DEFAULT 0 CHECK (dias_plazo >= 0);
ALTER TABLE proveedores ADD COLUMN IF NOT EXISTS cupo_credito     DECIMAL(14,2) NOT NULL DEFAULT 0 CHECK (cupo_credito >= 0);
ALTER TABLE proveedores ADD COLUMN IF NOT EXISTS saldo_actual     DECIMAL(14,2) NOT NULL DEFAULT 0 CHECK (saldo_actual >= 0);
ALTER TABLE proveedores ADD COLUMN IF NOT EXISTS notas            VARCHAR(255);
ALTER TABLE proveedores ADD COLUMN IF NOT EXISTS esta_activo      BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE proveedores ADD COLUMN IF NOT EXISTS creado_en        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE proveedores ADD COLUMN IF NOT EXISTS actualizado_en   TIMESTAMP(3);
ALTER TABLE proveedores ADD COLUMN IF NOT EXISTS eliminado_en     TIMESTAMP(3);

CREATE TABLE IF NOT EXISTS clientes (
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
  creado_en         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_en    TIMESTAMP(3),
  eliminado_en      TIMESTAMP(3),
  PRIMARY KEY (id)
);
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS id                BIGINT GENERATED BY DEFAULT AS IDENTITY NOT NULL;
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS tipo_documento    tipo_documento_identidad NOT NULL DEFAULT 'CC';
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS documento         VARCHAR(30);
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS nombre            VARCHAR(140) NOT NULL;
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS telefono          VARCHAR(40);
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS email             VARCHAR(160);
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS direccion         VARCHAR(200);
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS ciudad            VARCHAR(80);
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS fecha_nacimiento  DATE;
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS cupo_credito      DECIMAL(14,2) NOT NULL DEFAULT 0 CHECK (cupo_credito >= 0);
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS dias_plazo        INTEGER NOT NULL DEFAULT 30 CHECK (dias_plazo >= 0);
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS saldo_actual      DECIMAL(14,2) NOT NULL DEFAULT 0 CHECK (saldo_actual >= 0);
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS es_permite_credito BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS esta_bloqueado    BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS motivo_bloqueo    VARCHAR(200);
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS notas             VARCHAR(255);
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS esta_activo       BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS creado_en         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS actualizado_en    TIMESTAMP(3);
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS eliminado_en      TIMESTAMP(3);

CREATE TABLE IF NOT EXISTS metodos_pago (
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
  creado_en            TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_en       TIMESTAMP(3),
  eliminado_en         TIMESTAMP(3),
  PRIMARY KEY (id)
);
ALTER TABLE metodos_pago ADD COLUMN IF NOT EXISTS id                   BIGINT GENERATED BY DEFAULT AS IDENTITY NOT NULL;
ALTER TABLE metodos_pago ADD COLUMN IF NOT EXISTS codigo               VARCHAR(30) NOT NULL;
ALTER TABLE metodos_pago ADD COLUMN IF NOT EXISTS nombre               VARCHAR(80) NOT NULL;
ALTER TABLE metodos_pago ADD COLUMN IF NOT EXISTS tipo                 tipo_metodo_pago_tipo NOT NULL;
ALTER TABLE metodos_pago ADD COLUMN IF NOT EXISTS moneda               tipo_metodo_pago_moneda NOT NULL DEFAULT 'VES';
ALTER TABLE metodos_pago ADD COLUMN IF NOT EXISTS afecta_caja_efectivo BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE metodos_pago ADD COLUMN IF NOT EXISTS requiere_referencia  BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE metodos_pago ADD COLUMN IF NOT EXISTS es_permite_cambio    BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE metodos_pago ADD COLUMN IF NOT EXISTS es_no_es_cobro       BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE metodos_pago ADD COLUMN IF NOT EXISTS comision_porcentaje  DECIMAL(6,3) NOT NULL DEFAULT 0 CHECK (comision_porcentaje >= 0);
ALTER TABLE metodos_pago ADD COLUMN IF NOT EXISTS orden                INTEGER NOT NULL DEFAULT 0 CHECK (orden >= 0);
ALTER TABLE metodos_pago ADD COLUMN IF NOT EXISTS esta_activo          BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE metodos_pago ADD COLUMN IF NOT EXISTS creado_en            TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE metodos_pago ADD COLUMN IF NOT EXISTS actualizado_en       TIMESTAMP(3);
ALTER TABLE metodos_pago ADD COLUMN IF NOT EXISTS eliminado_en         TIMESTAMP(3);

CREATE TABLE IF NOT EXISTS motivos_ajuste (
  id                       BIGINT GENERATED BY DEFAULT AS IDENTITY NOT NULL,
  codigo                   VARCHAR(30) NOT NULL,
  nombre                   VARCHAR(80) NOT NULL,
  signo                    INTEGER NOT NULL DEFAULT -1,
  es_perdida               BOOLEAN NOT NULL DEFAULT TRUE,
  es_requiere_autorizacion BOOLEAN NOT NULL DEFAULT FALSE,
  esta_activo              BOOLEAN NOT NULL DEFAULT TRUE,
  creado_en                TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_en           TIMESTAMP(3),
  PRIMARY KEY (id)
);
ALTER TABLE motivos_ajuste ADD COLUMN IF NOT EXISTS id                       BIGINT GENERATED BY DEFAULT AS IDENTITY NOT NULL;
ALTER TABLE motivos_ajuste ADD COLUMN IF NOT EXISTS codigo                   VARCHAR(30) NOT NULL;
ALTER TABLE motivos_ajuste ADD COLUMN IF NOT EXISTS nombre                   VARCHAR(80) NOT NULL;
ALTER TABLE motivos_ajuste ADD COLUMN IF NOT EXISTS signo                    INTEGER NOT NULL DEFAULT -1;
ALTER TABLE motivos_ajuste ADD COLUMN IF NOT EXISTS es_perdida               BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE motivos_ajuste ADD COLUMN IF NOT EXISTS es_requiere_autorizacion BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE motivos_ajuste ADD COLUMN IF NOT EXISTS esta_activo              BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE motivos_ajuste ADD COLUMN IF NOT EXISTS creado_en                TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE motivos_ajuste ADD COLUMN IF NOT EXISTS actualizado_en           TIMESTAMP(3);

CREATE TABLE IF NOT EXISTS cajas (
  id               BIGINT GENERATED BY DEFAULT AS IDENTITY NOT NULL,
  sucursal_id      BIGINT NOT NULL,
  codigo           VARCHAR(20) NOT NULL,
  nombre           VARCHAR(80) NOT NULL,
  impresora_nombre VARCHAR(120),
  esta_activa      BOOLEAN NOT NULL DEFAULT TRUE,
  creado_en        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_en   TIMESTAMP(3),
  eliminado_en     TIMESTAMP(3),
  PRIMARY KEY (id)
);
ALTER TABLE cajas ADD COLUMN IF NOT EXISTS id               BIGINT GENERATED BY DEFAULT AS IDENTITY NOT NULL;
ALTER TABLE cajas ADD COLUMN IF NOT EXISTS sucursal_id      BIGINT NOT NULL;
ALTER TABLE cajas ADD COLUMN IF NOT EXISTS codigo           VARCHAR(20) NOT NULL;
ALTER TABLE cajas ADD COLUMN IF NOT EXISTS nombre           VARCHAR(80) NOT NULL;
ALTER TABLE cajas ADD COLUMN IF NOT EXISTS impresora_nombre VARCHAR(120);
ALTER TABLE cajas ADD COLUMN IF NOT EXISTS esta_activa      BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE cajas ADD COLUMN IF NOT EXISTS creado_en        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE cajas ADD COLUMN IF NOT EXISTS actualizado_en   TIMESTAMP(3);
ALTER TABLE cajas ADD COLUMN IF NOT EXISTS eliminado_en     TIMESTAMP(3);

CREATE TABLE IF NOT EXISTS turnos_caja (
  id                        BIGINT GENERATED BY DEFAULT AS IDENTITY NOT NULL,
  caja_id                   BIGINT NOT NULL,
  sucursal_id               BIGINT NOT NULL,
  usuario_apertura_id       BIGINT NOT NULL,
  usuario_cierre_id         BIGINT,
  abierto_en                TIMESTAMP(3) NOT NULL,
  cerrado_en                TIMESTAMP(3),
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
  creado_en                 TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_en            TIMESTAMP(3),
  PRIMARY KEY (id)
);
ALTER TABLE turnos_caja ADD COLUMN IF NOT EXISTS id                        BIGINT GENERATED BY DEFAULT AS IDENTITY NOT NULL;
ALTER TABLE turnos_caja ADD COLUMN IF NOT EXISTS caja_id                   BIGINT NOT NULL;
ALTER TABLE turnos_caja ADD COLUMN IF NOT EXISTS sucursal_id               BIGINT NOT NULL;
ALTER TABLE turnos_caja ADD COLUMN IF NOT EXISTS usuario_apertura_id       BIGINT NOT NULL;
ALTER TABLE turnos_caja ADD COLUMN IF NOT EXISTS usuario_cierre_id         BIGINT;
ALTER TABLE turnos_caja ADD COLUMN IF NOT EXISTS abierto_en                TIMESTAMP(3) NOT NULL;
ALTER TABLE turnos_caja ADD COLUMN IF NOT EXISTS cerrado_en                TIMESTAMP(3);
ALTER TABLE turnos_caja ADD COLUMN IF NOT EXISTS base_inicial_usd          DECIMAL(14,2) NOT NULL DEFAULT 0 CHECK (base_inicial_usd >= 0);
ALTER TABLE turnos_caja ADD COLUMN IF NOT EXISTS base_inicial_bs           DECIMAL(18,2) NOT NULL DEFAULT 0 CHECK (base_inicial_bs >= 0);
ALTER TABLE turnos_caja ADD COLUMN IF NOT EXISTS total_ventas_efectivo_usd DECIMAL(14,2) NOT NULL DEFAULT 0 CHECK (total_ventas_efectivo_usd >= 0);
ALTER TABLE turnos_caja ADD COLUMN IF NOT EXISTS total_ventas_efectivo_bs  DECIMAL(18,2) NOT NULL DEFAULT 0 CHECK (total_ventas_efectivo_bs >= 0);
ALTER TABLE turnos_caja ADD COLUMN IF NOT EXISTS total_ventas_otros_usd    DECIMAL(14,2) NOT NULL DEFAULT 0 CHECK (total_ventas_otros_usd >= 0);
ALTER TABLE turnos_caja ADD COLUMN IF NOT EXISTS total_abonos_efectivo_usd DECIMAL(14,2) NOT NULL DEFAULT 0 CHECK (total_abonos_efectivo_usd >= 0);
ALTER TABLE turnos_caja ADD COLUMN IF NOT EXISTS total_abonos_efectivo_bs  DECIMAL(18,2) NOT NULL DEFAULT 0 CHECK (total_abonos_efectivo_bs >= 0);
ALTER TABLE turnos_caja ADD COLUMN IF NOT EXISTS total_ingresos_usd        DECIMAL(14,2) NOT NULL DEFAULT 0 CHECK (total_ingresos_usd >= 0);
ALTER TABLE turnos_caja ADD COLUMN IF NOT EXISTS total_ingresos_bs         DECIMAL(18,2) NOT NULL DEFAULT 0 CHECK (total_ingresos_bs >= 0);
ALTER TABLE turnos_caja ADD COLUMN IF NOT EXISTS total_egresos_usd         DECIMAL(14,2) NOT NULL DEFAULT 0 CHECK (total_egresos_usd >= 0);
ALTER TABLE turnos_caja ADD COLUMN IF NOT EXISTS total_egresos_bs          DECIMAL(18,2) NOT NULL DEFAULT 0 CHECK (total_egresos_bs >= 0);
ALTER TABLE turnos_caja ADD COLUMN IF NOT EXISTS total_retiros_usd         DECIMAL(14,2) NOT NULL DEFAULT 0 CHECK (total_retiros_usd >= 0);
ALTER TABLE turnos_caja ADD COLUMN IF NOT EXISTS total_retiros_bs          DECIMAL(18,2) NOT NULL DEFAULT 0 CHECK (total_retiros_bs >= 0);
ALTER TABLE turnos_caja ADD COLUMN IF NOT EXISTS total_vueltas_usd         DECIMAL(14,2) NOT NULL DEFAULT 0 CHECK (total_vueltas_usd >= 0);
ALTER TABLE turnos_caja ADD COLUMN IF NOT EXISTS total_vueltas_bs          DECIMAL(18,2) NOT NULL DEFAULT 0 CHECK (total_vueltas_bs >= 0);
ALTER TABLE turnos_caja ADD COLUMN IF NOT EXISTS esperado_usd              DECIMAL(14,2) NOT NULL DEFAULT 0;
ALTER TABLE turnos_caja ADD COLUMN IF NOT EXISTS esperado_bs               DECIMAL(18,2) NOT NULL DEFAULT 0;
ALTER TABLE turnos_caja ADD COLUMN IF NOT EXISTS contado_usd               DECIMAL(14,2);
ALTER TABLE turnos_caja ADD COLUMN IF NOT EXISTS contado_bs                DECIMAL(18,2);
ALTER TABLE turnos_caja ADD COLUMN IF NOT EXISTS diferencia_usd            DECIMAL(14,2);
ALTER TABLE turnos_caja ADD COLUMN IF NOT EXISTS diferencia_bs             DECIMAL(18,2);
ALTER TABLE turnos_caja ADD COLUMN IF NOT EXISTS detalle_denominaciones_usd JSONB;
ALTER TABLE turnos_caja ADD COLUMN IF NOT EXISTS detalle_denominaciones_bs  JSONB;
ALTER TABLE turnos_caja ADD COLUMN IF NOT EXISTS tasa_cierre               DECIMAL(18,6);
ALTER TABLE turnos_caja ADD COLUMN IF NOT EXISTS observaciones             VARCHAR(255);
ALTER TABLE turnos_caja ADD COLUMN IF NOT EXISTS estado                    estado_turno NOT NULL DEFAULT 'ABIERTO';
ALTER TABLE turnos_caja ADD COLUMN IF NOT EXISTS creado_en                 TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE turnos_caja ADD COLUMN IF NOT EXISTS actualizado_en            TIMESTAMP(3);

CREATE TABLE IF NOT EXISTS productos (
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
  creado_en                 TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_en            TIMESTAMP(3),
  eliminado_en              TIMESTAMP(3),
  PRIMARY KEY (id)
);
ALTER TABLE productos ADD COLUMN IF NOT EXISTS id                        BIGINT GENERATED BY DEFAULT AS IDENTITY NOT NULL;
ALTER TABLE productos ADD COLUMN IF NOT EXISTS sku                       VARCHAR(40) NOT NULL;
ALTER TABLE productos ADD COLUMN IF NOT EXISTS nombre                    VARCHAR(160) NOT NULL;
ALTER TABLE productos ADD COLUMN IF NOT EXISTS descripcion               VARCHAR(500);
ALTER TABLE productos ADD COLUMN IF NOT EXISTS categoria_id              BIGINT NOT NULL;
ALTER TABLE productos ADD COLUMN IF NOT EXISTS unidad_medida_id          BIGINT NOT NULL;
ALTER TABLE productos ADD COLUMN IF NOT EXISTS impuesto_id               BIGINT NOT NULL;
ALTER TABLE productos ADD COLUMN IF NOT EXISTS proveedor_preferido_id    BIGINT;
ALTER TABLE productos ADD COLUMN IF NOT EXISTS tipo                      tipo_producto NOT NULL DEFAULT 'SIMPLE';
ALTER TABLE productos ADD COLUMN IF NOT EXISTS precio_venta              DECIMAL(14,4) NOT NULL DEFAULT 0 CHECK (precio_venta >= 0);
ALTER TABLE productos ADD COLUMN IF NOT EXISTS precio_venta_mayorista    DECIMAL(14,4) CHECK (precio_venta_mayorista >= 0);
ALTER TABLE productos ADD COLUMN IF NOT EXISTS costo_promedio            DECIMAL(14,4) NOT NULL DEFAULT 0 CHECK (costo_promedio >= 0);
ALTER TABLE productos ADD COLUMN IF NOT EXISTS ultimo_costo              DECIMAL(14,4) NOT NULL DEFAULT 0 CHECK (ultimo_costo >= 0);
ALTER TABLE productos ADD COLUMN IF NOT EXISTS margen_objetivo           DECIMAL(6,3);
ALTER TABLE productos ADD COLUMN IF NOT EXISTS es_precio_incluye_impuesto BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE productos ADD COLUMN IF NOT EXISTS es_maneja_inventario      BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE productos ADD COLUMN IF NOT EXISTS es_permite_fraccion       BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE productos ADD COLUMN IF NOT EXISTS es_pesable                BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE productos ADD COLUMN IF NOT EXISTS es_favorito_pos           BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE productos ADD COLUMN IF NOT EXISTS imagen_ruta               VARCHAR(255);
ALTER TABLE productos ADD COLUMN IF NOT EXISTS esta_activo               BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE productos ADD COLUMN IF NOT EXISTS creado_por                BIGINT;
ALTER TABLE productos ADD COLUMN IF NOT EXISTS creado_en                 TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE productos ADD COLUMN IF NOT EXISTS actualizado_en            TIMESTAMP(3);
ALTER TABLE productos ADD COLUMN IF NOT EXISTS eliminado_en              TIMESTAMP(3);

CREATE TABLE IF NOT EXISTS producto_codigos (
  id                BIGINT GENERATED BY DEFAULT AS IDENTITY NOT NULL,
  producto_id       BIGINT NOT NULL,
  codigo            VARCHAR(64) NOT NULL,
  tipo              tipo_codigo_producto NOT NULL DEFAULT 'EAN13',
  factor_conversion DECIMAL(14,3) NOT NULL DEFAULT 1 CHECK (factor_conversion > 0),
  es_principal      BOOLEAN NOT NULL DEFAULT FALSE,
  creado_en         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_en    TIMESTAMP(3),
  eliminado_en      TIMESTAMP(3),
  PRIMARY KEY (id)
);
ALTER TABLE producto_codigos ADD COLUMN IF NOT EXISTS id                BIGINT GENERATED BY DEFAULT AS IDENTITY NOT NULL;
ALTER TABLE producto_codigos ADD COLUMN IF NOT EXISTS producto_id       BIGINT NOT NULL;
ALTER TABLE producto_codigos ADD COLUMN IF NOT EXISTS codigo            VARCHAR(64) NOT NULL;
ALTER TABLE producto_codigos ADD COLUMN IF NOT EXISTS tipo              tipo_codigo_producto NOT NULL DEFAULT 'EAN13';
ALTER TABLE producto_codigos ADD COLUMN IF NOT EXISTS factor_conversion DECIMAL(14,3) NOT NULL DEFAULT 1 CHECK (factor_conversion > 0);
ALTER TABLE producto_codigos ADD COLUMN IF NOT EXISTS es_principal      BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE producto_codigos ADD COLUMN IF NOT EXISTS creado_en         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE producto_codigos ADD COLUMN IF NOT EXISTS actualizado_en    TIMESTAMP(3);
ALTER TABLE producto_codigos ADD COLUMN IF NOT EXISTS eliminado_en      TIMESTAMP(3);

CREATE TABLE IF NOT EXISTS producto_precios (
  id                      BIGINT GENERATED BY DEFAULT AS IDENTITY NOT NULL,
  producto_id             BIGINT NOT NULL,
  precio_venta_anterior   DECIMAL(14,4) NOT NULL CHECK (precio_venta_anterior >= 0),
  precio_venta_nuevo      DECIMAL(14,4) NOT NULL CHECK (precio_venta_nuevo >= 0),
  costo_referencia        DECIMAL(14,4) NOT NULL DEFAULT 0 CHECK (costo_referencia >= 0),
  tasa_cambio_referencia  DECIMAL(18,6),
  motivo                  VARCHAR(200),
  vigente_desde           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  usuario_id              BIGINT NOT NULL,
  creado_en               TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id)
);
ALTER TABLE producto_precios ADD COLUMN IF NOT EXISTS id                      BIGINT GENERATED BY DEFAULT AS IDENTITY NOT NULL;
ALTER TABLE producto_precios ADD COLUMN IF NOT EXISTS producto_id             BIGINT NOT NULL;
ALTER TABLE producto_precios ADD COLUMN IF NOT EXISTS precio_venta_anterior   DECIMAL(14,4) NOT NULL CHECK (precio_venta_anterior >= 0);
ALTER TABLE producto_precios ADD COLUMN IF NOT EXISTS precio_venta_nuevo      DECIMAL(14,4) NOT NULL CHECK (precio_venta_nuevo >= 0);
ALTER TABLE producto_precios ADD COLUMN IF NOT EXISTS costo_referencia        DECIMAL(14,4) NOT NULL DEFAULT 0 CHECK (costo_referencia >= 0);
ALTER TABLE producto_precios ADD COLUMN IF NOT EXISTS tasa_cambio_referencia  DECIMAL(18,6);
ALTER TABLE producto_precios ADD COLUMN IF NOT EXISTS motivo                  VARCHAR(200);
ALTER TABLE producto_precios ADD COLUMN IF NOT EXISTS vigente_desde           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE producto_precios ADD COLUMN IF NOT EXISTS usuario_id              BIGINT NOT NULL;
ALTER TABLE producto_precios ADD COLUMN IF NOT EXISTS creado_en               TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE TABLE IF NOT EXISTS producto_stock (
  producto_id       BIGINT NOT NULL,
  sucursal_id       BIGINT NOT NULL,
  cantidad          DECIMAL(14,3) NOT NULL DEFAULT 0 CHECK (cantidad >= 0),
  cantidad_reservada DECIMAL(14,3) NOT NULL DEFAULT 0 CHECK (cantidad_reservada >= 0),
  stock_minimo      DECIMAL(14,3) NOT NULL DEFAULT 0 CHECK (stock_minimo >= 0),
  stock_maximo      DECIMAL(14,3) CHECK (stock_maximo IS NULL OR stock_maximo >= 0),
  costo_promedio    DECIMAL(14,4) NOT NULL DEFAULT 0 CHECK (costo_promedio >= 0),
  ubicacion         VARCHAR(60),
  ultima_entrada_en TIMESTAMP(3),
  ultima_salida_en  TIMESTAMP(3),
  actualizado_en    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (producto_id, sucursal_id)
);
ALTER TABLE producto_stock ADD COLUMN IF NOT EXISTS producto_id       BIGINT NOT NULL;
ALTER TABLE producto_stock ADD COLUMN IF NOT EXISTS sucursal_id       BIGINT NOT NULL;
ALTER TABLE producto_stock ADD COLUMN IF NOT EXISTS cantidad          DECIMAL(14,3) NOT NULL DEFAULT 0 CHECK (cantidad >= 0);
ALTER TABLE producto_stock ADD COLUMN IF NOT EXISTS cantidad_reservada DECIMAL(14,3) NOT NULL DEFAULT 0 CHECK (cantidad_reservada >= 0);
ALTER TABLE producto_stock ADD COLUMN IF NOT EXISTS stock_minimo      DECIMAL(14,3) NOT NULL DEFAULT 0 CHECK (stock_minimo >= 0);
ALTER TABLE producto_stock ADD COLUMN IF NOT EXISTS stock_maximo      DECIMAL(14,3) CHECK (stock_maximo IS NULL OR stock_maximo >= 0);
ALTER TABLE producto_stock ADD COLUMN IF NOT EXISTS costo_promedio    DECIMAL(14,4) NOT NULL DEFAULT 0 CHECK (costo_promedio >= 0);
ALTER TABLE producto_stock ADD COLUMN IF NOT EXISTS ubicacion         VARCHAR(60);
ALTER TABLE producto_stock ADD COLUMN IF NOT EXISTS ultima_entrada_en TIMESTAMP(3);
ALTER TABLE producto_stock ADD COLUMN IF NOT EXISTS ultima_salida_en  TIMESTAMP(3);
ALTER TABLE producto_stock ADD COLUMN IF NOT EXISTS actualizado_en    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE TABLE IF NOT EXISTS consecutivos (
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
  creado_en      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_en TIMESTAMP(3),
  PRIMARY KEY (id)
);
ALTER TABLE consecutivos ADD COLUMN IF NOT EXISTS id             BIGINT GENERATED BY DEFAULT AS IDENTITY NOT NULL;
ALTER TABLE consecutivos ADD COLUMN IF NOT EXISTS sucursal_id    BIGINT NOT NULL;
ALTER TABLE consecutivos ADD COLUMN IF NOT EXISTS tipo_documento tipo_documento_consecutivo NOT NULL;
ALTER TABLE consecutivos ADD COLUMN IF NOT EXISTS anio           INTEGER NOT NULL CHECK (anio >= 2000 AND anio <= 2100);
ALTER TABLE consecutivos ADD COLUMN IF NOT EXISTS prefijo        VARCHAR(8) NOT NULL DEFAULT '';
ALTER TABLE consecutivos ADD COLUMN IF NOT EXISTS ultimo_numero  BIGINT NOT NULL DEFAULT 0 CHECK (ultimo_numero >= 0);
ALTER TABLE consecutivos ADD COLUMN IF NOT EXISTS resolucion     VARCHAR(60);
ALTER TABLE consecutivos ADD COLUMN IF NOT EXISTS rango_desde    BIGINT CHECK (rango_desde IS NULL OR rango_desde >= 0);
ALTER TABLE consecutivos ADD COLUMN IF NOT EXISTS rango_hasta    BIGINT CHECK (rango_hasta IS NULL OR rango_hasta >= 0);
ALTER TABLE consecutivos ADD COLUMN IF NOT EXISTS vigente_hasta  DATE;
ALTER TABLE consecutivos ADD COLUMN IF NOT EXISTS esta_activo    BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE consecutivos ADD COLUMN IF NOT EXISTS creado_en      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE consecutivos ADD COLUMN IF NOT EXISTS actualizado_en TIMESTAMP(3);

CREATE TABLE IF NOT EXISTS compras (
  id                       BIGINT GENERATED BY DEFAULT AS IDENTITY NOT NULL,
  sucursal_id              BIGINT NOT NULL,
  proveedor_id             BIGINT NOT NULL,
  usuario_id               BIGINT NOT NULL,
  prefijo                  VARCHAR(8) NOT NULL DEFAULT '',
  numero                   BIGINT NOT NULL CHECK (numero >= 0),
  anio                     INTEGER NOT NULL CHECK (anio >= 2000 AND anio <= 2100),
  numero_factura_proveedor VARCHAR(60),
  fecha_documento          DATE NOT NULL,
  fecha_recepcion          TIMESTAMP(3) NOT NULL,
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
  anulada_en               TIMESTAMP(3),
  anulada_por              BIGINT,
  motivo_anulacion         VARCHAR(200),
  creado_en                TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_en           TIMESTAMP(3),
  PRIMARY KEY (id)
);
ALTER TABLE compras ADD COLUMN IF NOT EXISTS id                       BIGINT GENERATED BY DEFAULT AS IDENTITY NOT NULL;
ALTER TABLE compras ADD COLUMN IF NOT EXISTS sucursal_id              BIGINT NOT NULL;
ALTER TABLE compras ADD COLUMN IF NOT EXISTS proveedor_id             BIGINT NOT NULL;
ALTER TABLE compras ADD COLUMN IF NOT EXISTS usuario_id               BIGINT NOT NULL;
ALTER TABLE compras ADD COLUMN IF NOT EXISTS prefijo                  VARCHAR(8) NOT NULL DEFAULT '';
ALTER TABLE compras ADD COLUMN IF NOT EXISTS numero                   BIGINT NOT NULL CHECK (numero >= 0);
ALTER TABLE compras ADD COLUMN IF NOT EXISTS anio                     INTEGER NOT NULL CHECK (anio >= 2000 AND anio <= 2100);
ALTER TABLE compras ADD COLUMN IF NOT EXISTS numero_factura_proveedor VARCHAR(60);
ALTER TABLE compras ADD COLUMN IF NOT EXISTS fecha_documento          DATE NOT NULL;
ALTER TABLE compras ADD COLUMN IF NOT EXISTS fecha_recepcion          TIMESTAMP(3) NOT NULL;
ALTER TABLE compras ADD COLUMN IF NOT EXISTS fecha_vencimiento        DATE;
ALTER TABLE compras ADD COLUMN IF NOT EXISTS subtotal                 DECIMAL(14,2) NOT NULL DEFAULT 0 CHECK (subtotal >= 0);
ALTER TABLE compras ADD COLUMN IF NOT EXISTS descuento_total          DECIMAL(14,2) NOT NULL DEFAULT 0 CHECK (descuento_total >= 0);
ALTER TABLE compras ADD COLUMN IF NOT EXISTS impuesto_total           DECIMAL(14,2) NOT NULL DEFAULT 0 CHECK (impuesto_total >= 0);
ALTER TABLE compras ADD COLUMN IF NOT EXISTS flete                    DECIMAL(14,2) NOT NULL DEFAULT 0 CHECK (flete >= 0);
ALTER TABLE compras ADD COLUMN IF NOT EXISTS moneda_pago              tipo_metodo_pago_moneda NOT NULL DEFAULT 'USD';
ALTER TABLE compras ADD COLUMN IF NOT EXISTS tasa_cambio              DECIMAL(18,6) NOT NULL CHECK (tasa_cambio > 0);
ALTER TABLE compras ADD COLUMN IF NOT EXISTS total_usd                DECIMAL(14,2) NOT NULL DEFAULT 0 CHECK (total_usd >= 0);
ALTER TABLE compras ADD COLUMN IF NOT EXISTS total_bs                 DECIMAL(18,2) NOT NULL DEFAULT 0 CHECK (total_bs >= 0);
ALTER TABLE compras ADD COLUMN IF NOT EXISTS total_pagado_moneda      DECIMAL(18,4) NOT NULL DEFAULT 0 CHECK (total_pagado_moneda >= 0);
ALTER TABLE compras ADD COLUMN IF NOT EXISTS saldo_pendiente          DECIMAL(14,2) NOT NULL DEFAULT 0 CHECK (saldo_pendiente >= 0);
ALTER TABLE compras ADD COLUMN IF NOT EXISTS condicion_pago           condicion_pago NOT NULL DEFAULT 'CONTADO';
ALTER TABLE compras ADD COLUMN IF NOT EXISTS estado                   estado_compra NOT NULL DEFAULT 'BORRADOR';
ALTER TABLE compras ADD COLUMN IF NOT EXISTS observaciones            VARCHAR(255);
ALTER TABLE compras ADD COLUMN IF NOT EXISTS clave_idempotencia       UUID;
ALTER TABLE compras ADD COLUMN IF NOT EXISTS anulada_en               TIMESTAMP(3);
ALTER TABLE compras ADD COLUMN IF NOT EXISTS anulada_por              BIGINT;
ALTER TABLE compras ADD COLUMN IF NOT EXISTS motivo_anulacion         VARCHAR(200);
ALTER TABLE compras ADD COLUMN IF NOT EXISTS creado_en                TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE compras ADD COLUMN IF NOT EXISTS actualizado_en           TIMESTAMP(3);

CREATE TABLE IF NOT EXISTS compra_detalle (
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
  creado_en           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id)
);
ALTER TABLE compra_detalle ADD COLUMN IF NOT EXISTS id                  BIGINT GENERATED BY DEFAULT AS IDENTITY NOT NULL;
ALTER TABLE compra_detalle ADD COLUMN IF NOT EXISTS compra_id           BIGINT NOT NULL;
ALTER TABLE compra_detalle ADD COLUMN IF NOT EXISTS linea               INTEGER NOT NULL CHECK (linea >= 0);
ALTER TABLE compra_detalle ADD COLUMN IF NOT EXISTS producto_id         BIGINT NOT NULL;
ALTER TABLE compra_detalle ADD COLUMN IF NOT EXISTS descripcion         VARCHAR(160) NOT NULL;
ALTER TABLE compra_detalle ADD COLUMN IF NOT EXISTS unidad_medida_id    BIGINT NOT NULL;
ALTER TABLE compra_detalle ADD COLUMN IF NOT EXISTS cantidad            DECIMAL(14,3) NOT NULL CHECK (cantidad > 0);
ALTER TABLE compra_detalle ADD COLUMN IF NOT EXISTS costo_unitario      DECIMAL(14,4) NOT NULL CHECK (costo_unitario >= 0);
ALTER TABLE compra_detalle ADD COLUMN IF NOT EXISTS descuento_unitario  DECIMAL(14,4) NOT NULL DEFAULT 0 CHECK (descuento_unitario >= 0);
ALTER TABLE compra_detalle ADD COLUMN IF NOT EXISTS flete_prorrateado   DECIMAL(14,2) NOT NULL DEFAULT 0 CHECK (flete_prorrateado >= 0);
ALTER TABLE compra_detalle ADD COLUMN IF NOT EXISTS costo_unitario_neto DECIMAL(14,4) NOT NULL CHECK (costo_unitario_neto >= 0);
ALTER TABLE compra_detalle ADD COLUMN IF NOT EXISTS impuesto_id         BIGINT NOT NULL;
ALTER TABLE compra_detalle ADD COLUMN IF NOT EXISTS impuesto_tasa       DECIMAL(6,3) NOT NULL DEFAULT 0 CHECK (impuesto_tasa >= 0);
ALTER TABLE compra_detalle ADD COLUMN IF NOT EXISTS impuesto_monto      DECIMAL(14,2) NOT NULL DEFAULT 0 CHECK (impuesto_monto >= 0);
ALTER TABLE compra_detalle ADD COLUMN IF NOT EXISTS subtotal            DECIMAL(14,2) NOT NULL CHECK (subtotal >= 0);
ALTER TABLE compra_detalle ADD COLUMN IF NOT EXISTS total_linea         DECIMAL(14,2) NOT NULL CHECK (total_linea >= 0);
ALTER TABLE compra_detalle ADD COLUMN IF NOT EXISTS lote_codigo         VARCHAR(40);
ALTER TABLE compra_detalle ADD COLUMN IF NOT EXISTS fecha_vencimiento   DATE;
ALTER TABLE compra_detalle ADD COLUMN IF NOT EXISTS creado_en           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE TABLE IF NOT EXISTS ventas (
  id                  BIGINT GENERATED BY DEFAULT AS IDENTITY NOT NULL,
  sucursal_id         BIGINT NOT NULL,
  turno_caja_id       BIGINT NOT NULL,
  usuario_id          BIGINT NOT NULL,
  cliente_id          BIGINT,
  prefijo             VARCHAR(8) NOT NULL DEFAULT '',
  numero              BIGINT NOT NULL CHECK (numero >= 0),
  anio                INTEGER NOT NULL CHECK (anio >= 2000 AND anio <= 2100),
  fecha               TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
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
  anulada_en          TIMESTAMP(3),
  anulada_por         BIGINT,
  autorizada_por      BIGINT,
  motivo_anulacion    VARCHAR(200),
  creado_en           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_en      TIMESTAMP(3),
  PRIMARY KEY (id)
);
ALTER TABLE ventas ADD COLUMN IF NOT EXISTS id                  BIGINT GENERATED BY DEFAULT AS IDENTITY NOT NULL;
ALTER TABLE ventas ADD COLUMN IF NOT EXISTS sucursal_id         BIGINT NOT NULL;
ALTER TABLE ventas ADD COLUMN IF NOT EXISTS turno_caja_id       BIGINT NOT NULL;
ALTER TABLE ventas ADD COLUMN IF NOT EXISTS usuario_id          BIGINT NOT NULL;
ALTER TABLE ventas ADD COLUMN IF NOT EXISTS cliente_id          BIGINT;
ALTER TABLE ventas ADD COLUMN IF NOT EXISTS prefijo             VARCHAR(8) NOT NULL DEFAULT '';
ALTER TABLE ventas ADD COLUMN IF NOT EXISTS numero              BIGINT NOT NULL CHECK (numero >= 0);
ALTER TABLE ventas ADD COLUMN IF NOT EXISTS anio                INTEGER NOT NULL CHECK (anio >= 2000 AND anio <= 2100);
ALTER TABLE ventas ADD COLUMN IF NOT EXISTS fecha               TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE ventas ADD COLUMN IF NOT EXISTS subtotal_bruto      DECIMAL(14,2) NOT NULL DEFAULT 0 CHECK (subtotal_bruto >= 0);
ALTER TABLE ventas ADD COLUMN IF NOT EXISTS descuento_lineas    DECIMAL(14,2) NOT NULL DEFAULT 0 CHECK (descuento_lineas >= 0);
ALTER TABLE ventas ADD COLUMN IF NOT EXISTS descuento_documento DECIMAL(14,2) NOT NULL DEFAULT 0 CHECK (descuento_documento >= 0);
ALTER TABLE ventas ADD COLUMN IF NOT EXISTS base_gravable       DECIMAL(14,2) NOT NULL DEFAULT 0 CHECK (base_gravable >= 0);
ALTER TABLE ventas ADD COLUMN IF NOT EXISTS impuesto_total      DECIMAL(14,2) NOT NULL DEFAULT 0 CHECK (impuesto_total >= 0);
ALTER TABLE ventas ADD COLUMN IF NOT EXISTS redondeo            DECIMAL(14,2) NOT NULL DEFAULT 0;
ALTER TABLE ventas ADD COLUMN IF NOT EXISTS total_usd           DECIMAL(14,2) NOT NULL DEFAULT 0 CHECK (total_usd >= 0);
ALTER TABLE ventas ADD COLUMN IF NOT EXISTS tasa_cambio         DECIMAL(18,6) NOT NULL CHECK (tasa_cambio > 0);
ALTER TABLE ventas ADD COLUMN IF NOT EXISTS tasa_cambio_id      BIGINT;
ALTER TABLE ventas ADD COLUMN IF NOT EXISTS total_bs            DECIMAL(18,2) NOT NULL DEFAULT 0 CHECK (total_bs >= 0);
ALTER TABLE ventas ADD COLUMN IF NOT EXISTS redondeo_bs         DECIMAL(18,2) NOT NULL DEFAULT 0;
ALTER TABLE ventas ADD COLUMN IF NOT EXISTS costo_total         DECIMAL(14,2) NOT NULL DEFAULT 0 CHECK (costo_total >= 0);
ALTER TABLE ventas ADD COLUMN IF NOT EXISTS utilidad_total      DECIMAL(14,2) NOT NULL DEFAULT 0;
ALTER TABLE ventas ADD COLUMN IF NOT EXISTS total_pagado        DECIMAL(14,2) NOT NULL DEFAULT 0 CHECK (total_pagado >= 0);
ALTER TABLE ventas ADD COLUMN IF NOT EXISTS total_credito       DECIMAL(14,2) NOT NULL DEFAULT 0 CHECK (total_credito >= 0);
ALTER TABLE ventas ADD COLUMN IF NOT EXISTS cantidad_items      DECIMAL(14,3) NOT NULL DEFAULT 0 CHECK (cantidad_items >= 0);
ALTER TABLE ventas ADD COLUMN IF NOT EXISTS es_credito          BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE ventas ADD COLUMN IF NOT EXISTS estado              estado_venta NOT NULL DEFAULT 'ABIERTA';
ALTER TABLE ventas ADD COLUMN IF NOT EXISTS clave_idempotencia  UUID;
ALTER TABLE ventas ADD COLUMN IF NOT EXISTS observaciones       VARCHAR(255);
ALTER TABLE ventas ADD COLUMN IF NOT EXISTS anulada_en          TIMESTAMP(3);
ALTER TABLE ventas ADD COLUMN IF NOT EXISTS anulada_por         BIGINT;
ALTER TABLE ventas ADD COLUMN IF NOT EXISTS autorizada_por      BIGINT;
ALTER TABLE ventas ADD COLUMN IF NOT EXISTS motivo_anulacion    VARCHAR(200);
ALTER TABLE ventas ADD COLUMN IF NOT EXISTS creado_en           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE ventas ADD COLUMN IF NOT EXISTS actualizado_en      TIMESTAMP(3);

CREATE TABLE IF NOT EXISTS venta_detalle (
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
  creado_en                 TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id)
);
ALTER TABLE venta_detalle ADD COLUMN IF NOT EXISTS id                        BIGINT GENERATED BY DEFAULT AS IDENTITY NOT NULL;
ALTER TABLE venta_detalle ADD COLUMN IF NOT EXISTS venta_id                  BIGINT NOT NULL;
ALTER TABLE venta_detalle ADD COLUMN IF NOT EXISTS linea                     INTEGER NOT NULL CHECK (linea >= 0);
ALTER TABLE venta_detalle ADD COLUMN IF NOT EXISTS producto_id               BIGINT NOT NULL;
ALTER TABLE venta_detalle ADD COLUMN IF NOT EXISTS descripcion               VARCHAR(160) NOT NULL;
ALTER TABLE venta_detalle ADD COLUMN IF NOT EXISTS codigo_barras             VARCHAR(64);
ALTER TABLE venta_detalle ADD COLUMN IF NOT EXISTS categoria_id              BIGINT NOT NULL;
ALTER TABLE venta_detalle ADD COLUMN IF NOT EXISTS unidad_medida_id          BIGINT NOT NULL;
ALTER TABLE venta_detalle ADD COLUMN IF NOT EXISTS cantidad                  DECIMAL(14,3) NOT NULL CHECK (cantidad > 0);
ALTER TABLE venta_detalle ADD COLUMN IF NOT EXISTS precio_compra_unitario    DECIMAL(14,4) NOT NULL CHECK (precio_compra_unitario >= 0);
ALTER TABLE venta_detalle ADD COLUMN IF NOT EXISTS precio_venta_unitario     DECIMAL(14,4) NOT NULL CHECK (precio_venta_unitario >= 0);
ALTER TABLE venta_detalle ADD COLUMN IF NOT EXISTS descuento_unitario        DECIMAL(14,4) NOT NULL DEFAULT 0 CHECK (descuento_unitario >= 0);
ALTER TABLE venta_detalle ADD COLUMN IF NOT EXISTS impuesto_id               BIGINT NOT NULL;
ALTER TABLE venta_detalle ADD COLUMN IF NOT EXISTS impuesto_tasa             DECIMAL(6,3) NOT NULL DEFAULT 0 CHECK (impuesto_tasa >= 0);
ALTER TABLE venta_detalle ADD COLUMN IF NOT EXISTS impuesto_monto            DECIMAL(14,2) NOT NULL DEFAULT 0 CHECK (impuesto_monto >= 0);
ALTER TABLE venta_detalle ADD COLUMN IF NOT EXISTS es_precio_incluia_impuesto BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE venta_detalle ADD COLUMN IF NOT EXISTS base_gravable             DECIMAL(14,2) NOT NULL CHECK (base_gravable >= 0);
ALTER TABLE venta_detalle ADD COLUMN IF NOT EXISTS costo_total               DECIMAL(14,2) NOT NULL CHECK (costo_total >= 0);
ALTER TABLE venta_detalle ADD COLUMN IF NOT EXISTS utilidad_unitaria         DECIMAL(14,4) NOT NULL;
ALTER TABLE venta_detalle ADD COLUMN IF NOT EXISTS utilidad_total            DECIMAL(14,2) NOT NULL;
ALTER TABLE venta_detalle ADD COLUMN IF NOT EXISTS total_linea               DECIMAL(14,2) NOT NULL CHECK (total_linea >= 0);
ALTER TABLE venta_detalle ADD COLUMN IF NOT EXISTS cantidad_devuelta         DECIMAL(14,3) NOT NULL DEFAULT 0 CHECK (cantidad_devuelta >= 0);
ALTER TABLE venta_detalle ADD COLUMN IF NOT EXISTS creado_en                 TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE TABLE IF NOT EXISTS creditos (
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
  pagado_en                    TIMESTAMP(3),
  anulado_en                   TIMESTAMP(3),
  anulado_por                  BIGINT,
  motivo_anulacion             VARCHAR(200),
  creado_en                    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_en               TIMESTAMP(3),
  PRIMARY KEY (id)
);
ALTER TABLE creditos ADD COLUMN IF NOT EXISTS id                           BIGINT GENERATED BY DEFAULT AS IDENTITY NOT NULL;
ALTER TABLE creditos ADD COLUMN IF NOT EXISTS sucursal_id                  BIGINT NOT NULL;
ALTER TABLE creditos ADD COLUMN IF NOT EXISTS cliente_id                   BIGINT NOT NULL;
ALTER TABLE creditos ADD COLUMN IF NOT EXISTS venta_id                     BIGINT;
ALTER TABLE creditos ADD COLUMN IF NOT EXISTS origen                       origen_credito NOT NULL DEFAULT 'VENTA';
ALTER TABLE creditos ADD COLUMN IF NOT EXISTS fecha_emision                DATE NOT NULL;
ALTER TABLE creditos ADD COLUMN IF NOT EXISTS fecha_vencimiento            DATE NOT NULL;
ALTER TABLE creditos ADD COLUMN IF NOT EXISTS dias_plazo                   INTEGER NOT NULL DEFAULT 30 CHECK (dias_plazo >= 0);
ALTER TABLE creditos ADD COLUMN IF NOT EXISTS monto_original_usd           DECIMAL(14,2) NOT NULL CHECK (monto_original_usd > 0);
ALTER TABLE creditos ADD COLUMN IF NOT EXISTS saldo_usd                    DECIMAL(14,2) NOT NULL CHECK (saldo_usd >= 0);
ALTER TABLE creditos ADD COLUMN IF NOT EXISTS tasa_cambio_origen           DECIMAL(18,6) NOT NULL CHECK (tasa_cambio_origen > 0);
ALTER TABLE creditos ADD COLUMN IF NOT EXISTS monto_original_bs_referencia DECIMAL(18,2) NOT NULL DEFAULT 0 CHECK (monto_original_bs_referencia >= 0);
ALTER TABLE creditos ADD COLUMN IF NOT EXISTS estado                       estado_credito NOT NULL DEFAULT 'PENDIENTE';
ALTER TABLE creditos ADD COLUMN IF NOT EXISTS autorizado_por               BIGINT;
ALTER TABLE creditos ADD COLUMN IF NOT EXISTS usuario_id                   BIGINT NOT NULL;
ALTER TABLE creditos ADD COLUMN IF NOT EXISTS observaciones                VARCHAR(255);
ALTER TABLE creditos ADD COLUMN IF NOT EXISTS pagado_en                    TIMESTAMP(3);
ALTER TABLE creditos ADD COLUMN IF NOT EXISTS anulado_en                   TIMESTAMP(3);
ALTER TABLE creditos ADD COLUMN IF NOT EXISTS anulado_por                  BIGINT;
ALTER TABLE creditos ADD COLUMN IF NOT EXISTS motivo_anulacion             VARCHAR(200);
ALTER TABLE creditos ADD COLUMN IF NOT EXISTS creado_en                    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE creditos ADD COLUMN IF NOT EXISTS actualizado_en               TIMESTAMP(3);

CREATE TABLE IF NOT EXISTS pagos (
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
  fecha                 TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  creado_en             TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_en        TIMESTAMP(3),
  PRIMARY KEY (id)
);
ALTER TABLE pagos ADD COLUMN IF NOT EXISTS id                    BIGINT GENERATED BY DEFAULT AS IDENTITY NOT NULL;
ALTER TABLE pagos ADD COLUMN IF NOT EXISTS venta_id              BIGINT NOT NULL;
ALTER TABLE pagos ADD COLUMN IF NOT EXISTS sucursal_id           BIGINT NOT NULL;
ALTER TABLE pagos ADD COLUMN IF NOT EXISTS turno_caja_id         BIGINT NOT NULL;
ALTER TABLE pagos ADD COLUMN IF NOT EXISTS metodo_pago_id        BIGINT NOT NULL;
ALTER TABLE pagos ADD COLUMN IF NOT EXISTS moneda                tipo_metodo_pago_moneda NOT NULL;
ALTER TABLE pagos ADD COLUMN IF NOT EXISTS monto_moneda          DECIMAL(18,4) NOT NULL CHECK (monto_moneda > 0);
ALTER TABLE pagos ADD COLUMN IF NOT EXISTS tasa_aplicada         DECIMAL(18,6) NOT NULL CHECK (tasa_aplicada > 0);
ALTER TABLE pagos ADD COLUMN IF NOT EXISTS monto_usd             DECIMAL(14,2) NOT NULL CHECK (monto_usd > 0);
ALTER TABLE pagos ADD COLUMN IF NOT EXISTS monto_recibido_moneda DECIMAL(18,4);
ALTER TABLE pagos ADD COLUMN IF NOT EXISTS cambio_moneda         DECIMAL(18,4);
ALTER TABLE pagos ADD COLUMN IF NOT EXISTS cambio_moneda_codigo  tipo_metodo_pago_moneda;
ALTER TABLE pagos ADD COLUMN IF NOT EXISTS referencia            VARCHAR(60);
ALTER TABLE pagos ADD COLUMN IF NOT EXISTS franquicia            VARCHAR(40);
ALTER TABLE pagos ADD COLUMN IF NOT EXISTS comision              DECIMAL(14,2) NOT NULL DEFAULT 0 CHECK (comision >= 0);
ALTER TABLE pagos ADD COLUMN IF NOT EXISTS credito_id            BIGINT;
ALTER TABLE pagos ADD COLUMN IF NOT EXISTS estado                VARCHAR(10) NOT NULL DEFAULT 'APLICADO';
ALTER TABLE pagos ADD COLUMN IF NOT EXISTS usuario_id            BIGINT NOT NULL;
ALTER TABLE pagos ADD COLUMN IF NOT EXISTS fecha                 TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE pagos ADD COLUMN IF NOT EXISTS creado_en             TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE pagos ADD COLUMN IF NOT EXISTS actualizado_en        TIMESTAMP(3);

CREATE TABLE IF NOT EXISTS abonos (
  id                 BIGINT GENERATED BY DEFAULT AS IDENTITY NOT NULL,
  sucursal_id        BIGINT NOT NULL,
  cliente_id         BIGINT NOT NULL,
  turno_caja_id      BIGINT NOT NULL,
  metodo_pago_id     BIGINT NOT NULL,
  usuario_id         BIGINT NOT NULL,
  prefijo            VARCHAR(8) NOT NULL DEFAULT '',
  numero             BIGINT NOT NULL CHECK (numero >= 0),
  anio               INTEGER NOT NULL CHECK (anio >= 2000 AND anio <= 2100),
  fecha              TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
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
  anulado_en         TIMESTAMP(3),
  anulado_por        BIGINT,
  motivo_anulacion   VARCHAR(200),
  creado_en          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_en     TIMESTAMP(3),
  PRIMARY KEY (id)
);
ALTER TABLE abonos ADD COLUMN IF NOT EXISTS id                 BIGINT GENERATED BY DEFAULT AS IDENTITY NOT NULL;
ALTER TABLE abonos ADD COLUMN IF NOT EXISTS sucursal_id        BIGINT NOT NULL;
ALTER TABLE abonos ADD COLUMN IF NOT EXISTS cliente_id         BIGINT NOT NULL;
ALTER TABLE abonos ADD COLUMN IF NOT EXISTS turno_caja_id      BIGINT NOT NULL;
ALTER TABLE abonos ADD COLUMN IF NOT EXISTS metodo_pago_id     BIGINT NOT NULL;
ALTER TABLE abonos ADD COLUMN IF NOT EXISTS usuario_id         BIGINT NOT NULL;
ALTER TABLE abonos ADD COLUMN IF NOT EXISTS prefijo            VARCHAR(8) NOT NULL DEFAULT '';
ALTER TABLE abonos ADD COLUMN IF NOT EXISTS numero             BIGINT NOT NULL CHECK (numero >= 0);
ALTER TABLE abonos ADD COLUMN IF NOT EXISTS anio               INTEGER NOT NULL CHECK (anio >= 2000 AND anio <= 2100);
ALTER TABLE abonos ADD COLUMN IF NOT EXISTS fecha              TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE abonos ADD COLUMN IF NOT EXISTS moneda             tipo_metodo_pago_moneda NOT NULL;
ALTER TABLE abonos ADD COLUMN IF NOT EXISTS monto_moneda       DECIMAL(18,4) NOT NULL CHECK (monto_moneda > 0);
ALTER TABLE abonos ADD COLUMN IF NOT EXISTS tasa_aplicada      DECIMAL(18,6) NOT NULL CHECK (tasa_aplicada > 0);
ALTER TABLE abonos ADD COLUMN IF NOT EXISTS tasa_cambio_id     BIGINT;
ALTER TABLE abonos ADD COLUMN IF NOT EXISTS monto_usd          DECIMAL(14,2) NOT NULL CHECK (monto_usd > 0);
ALTER TABLE abonos ADD COLUMN IF NOT EXISTS monto_aplicado_usd DECIMAL(14,2) NOT NULL DEFAULT 0 CHECK (monto_aplicado_usd >= 0);
ALTER TABLE abonos ADD COLUMN IF NOT EXISTS saldo_a_favor_usd  DECIMAL(14,2) NOT NULL DEFAULT 0 CHECK (saldo_a_favor_usd >= 0);
ALTER TABLE abonos ADD COLUMN IF NOT EXISTS referencia         VARCHAR(60);
ALTER TABLE abonos ADD COLUMN IF NOT EXISTS observaciones      VARCHAR(255);
ALTER TABLE abonos ADD COLUMN IF NOT EXISTS estado             estado_abono NOT NULL DEFAULT 'APLICADO';
ALTER TABLE abonos ADD COLUMN IF NOT EXISTS clave_idempotencia UUID;
ALTER TABLE abonos ADD COLUMN IF NOT EXISTS anulado_en         TIMESTAMP(3);
ALTER TABLE abonos ADD COLUMN IF NOT EXISTS anulado_por        BIGINT;
ALTER TABLE abonos ADD COLUMN IF NOT EXISTS motivo_anulacion   VARCHAR(200);
ALTER TABLE abonos ADD COLUMN IF NOT EXISTS creado_en          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE abonos ADD COLUMN IF NOT EXISTS actualizado_en     TIMESTAMP(3);

CREATE TABLE IF NOT EXISTS abono_aplicaciones (
  id                BIGINT GENERATED BY DEFAULT AS IDENTITY NOT NULL,
  abono_id          BIGINT NOT NULL,
  credito_id        BIGINT NOT NULL,
  monto_aplicado_usd DECIMAL(14,2) NOT NULL CHECK (monto_aplicado_usd > 0),
  creado_en         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id)
);
ALTER TABLE abono_aplicaciones ADD COLUMN IF NOT EXISTS id                BIGINT GENERATED BY DEFAULT AS IDENTITY NOT NULL;
ALTER TABLE abono_aplicaciones ADD COLUMN IF NOT EXISTS abono_id          BIGINT NOT NULL;
ALTER TABLE abono_aplicaciones ADD COLUMN IF NOT EXISTS credito_id        BIGINT NOT NULL;
ALTER TABLE abono_aplicaciones ADD COLUMN IF NOT EXISTS monto_aplicado_usd DECIMAL(14,2) NOT NULL CHECK (monto_aplicado_usd > 0);
ALTER TABLE abono_aplicaciones ADD COLUMN IF NOT EXISTS creado_en         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE TABLE IF NOT EXISTS devoluciones (
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
  fecha                 TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  forma_reintegro       forma_reintegro,
  motivo                VARCHAR(255) NOT NULL,
  subtotal              DECIMAL(14,2) NOT NULL DEFAULT 0 CHECK (subtotal >= 0),
  impuesto_total        DECIMAL(14,2) NOT NULL DEFAULT 0 CHECK (impuesto_total >= 0),
  total_usd             DECIMAL(14,2) NOT NULL DEFAULT 0 CHECK (total_usd >= 0),
  estado                estado_devolucion NOT NULL DEFAULT 'APLICADA',
  anulada_en            TIMESTAMP(3),
  anulada_por           BIGINT,
  motivo_anulacion      VARCHAR(200),
  creado_en             TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_en        TIMESTAMP(3),
  PRIMARY KEY (id)
);
ALTER TABLE devoluciones ADD COLUMN IF NOT EXISTS id                    BIGINT GENERATED BY DEFAULT AS IDENTITY NOT NULL;
ALTER TABLE devoluciones ADD COLUMN IF NOT EXISTS sucursal_id           BIGINT NOT NULL;
ALTER TABLE devoluciones ADD COLUMN IF NOT EXISTS turno_caja_id         BIGINT NOT NULL;
ALTER TABLE devoluciones ADD COLUMN IF NOT EXISTS usuario_id            BIGINT NOT NULL;
ALTER TABLE devoluciones ADD COLUMN IF NOT EXISTS tipo                  tipo_devolucion NOT NULL;
ALTER TABLE devoluciones ADD COLUMN IF NOT EXISTS venta_id              BIGINT;
ALTER TABLE devoluciones ADD COLUMN IF NOT EXISTS compra_id             BIGINT;
ALTER TABLE devoluciones ADD COLUMN IF NOT EXISTS cliente_id            BIGINT;
ALTER TABLE devoluciones ADD COLUMN IF NOT EXISTS proveedor_id          BIGINT;
ALTER TABLE devoluciones ADD COLUMN IF NOT EXISTS prefijo               VARCHAR(8) NOT NULL DEFAULT '';
ALTER TABLE devoluciones ADD COLUMN IF NOT EXISTS numero                BIGINT NOT NULL CHECK (numero >= 0);
ALTER TABLE devoluciones ADD COLUMN IF NOT EXISTS anio                  INTEGER NOT NULL CHECK (anio >= 2000 AND anio <= 2100);
ALTER TABLE devoluciones ADD COLUMN IF NOT EXISTS fecha                 TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE devoluciones ADD COLUMN IF NOT EXISTS forma_reintegro       forma_reintegro;
ALTER TABLE devoluciones ADD COLUMN IF NOT EXISTS motivo                VARCHAR(255) NOT NULL;
ALTER TABLE devoluciones ADD COLUMN IF NOT EXISTS subtotal              DECIMAL(14,2) NOT NULL DEFAULT 0 CHECK (subtotal >= 0);
ALTER TABLE devoluciones ADD COLUMN IF NOT EXISTS impuesto_total        DECIMAL(14,2) NOT NULL DEFAULT 0 CHECK (impuesto_total >= 0);
ALTER TABLE devoluciones ADD COLUMN IF NOT EXISTS total_usd             DECIMAL(14,2) NOT NULL DEFAULT 0 CHECK (total_usd >= 0);
ALTER TABLE devoluciones ADD COLUMN IF NOT EXISTS estado                estado_devolucion NOT NULL DEFAULT 'APLICADA';
ALTER TABLE devoluciones ADD COLUMN IF NOT EXISTS anulada_en            TIMESTAMP(3);
ALTER TABLE devoluciones ADD COLUMN IF NOT EXISTS anulada_por           BIGINT;
ALTER TABLE devoluciones ADD COLUMN IF NOT EXISTS motivo_anulacion      VARCHAR(200);
ALTER TABLE devoluciones ADD COLUMN IF NOT EXISTS creado_en             TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE devoluciones ADD COLUMN IF NOT EXISTS actualizado_en        TIMESTAMP(3);

CREATE TABLE IF NOT EXISTS devolucion_detalle (
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
  creado_en         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id)
);
ALTER TABLE devolucion_detalle ADD COLUMN IF NOT EXISTS id                BIGINT GENERATED BY DEFAULT AS IDENTITY NOT NULL;
ALTER TABLE devolucion_detalle ADD COLUMN IF NOT EXISTS devolucion_id     BIGINT NOT NULL;
ALTER TABLE devolucion_detalle ADD COLUMN IF NOT EXISTS linea             INTEGER NOT NULL CHECK (linea >= 0);
ALTER TABLE devolucion_detalle ADD COLUMN IF NOT EXISTS venta_detalle_id  BIGINT;
ALTER TABLE devolucion_detalle ADD COLUMN IF NOT EXISTS producto_id       BIGINT NOT NULL;
ALTER TABLE devolucion_detalle ADD COLUMN IF NOT EXISTS descripcion       VARCHAR(160) NOT NULL;
ALTER TABLE devolucion_detalle ADD COLUMN IF NOT EXISTS cantidad          DECIMAL(14,3) NOT NULL CHECK (cantidad > 0);
ALTER TABLE devolucion_detalle ADD COLUMN IF NOT EXISTS costo_unitario    DECIMAL(14,4) NOT NULL CHECK (costo_unitario >= 0);
ALTER TABLE devolucion_detalle ADD COLUMN IF NOT EXISTS precio_unitario   DECIMAL(14,4) NOT NULL CHECK (precio_unitario >= 0);
ALTER TABLE devolucion_detalle ADD COLUMN IF NOT EXISTS impuesto_id       BIGINT NOT NULL;
ALTER TABLE devolucion_detalle ADD COLUMN IF NOT EXISTS impuesto_tasa     DECIMAL(6,3) NOT NULL DEFAULT 0;
ALTER TABLE devolucion_detalle ADD COLUMN IF NOT EXISTS subtotal          DECIMAL(14,2) NOT NULL CHECK (subtotal >= 0);
ALTER TABLE devolucion_detalle ADD COLUMN IF NOT EXISTS total_linea       DECIMAL(14,2) NOT NULL CHECK (total_linea >= 0);
ALTER TABLE devolucion_detalle ADD COLUMN IF NOT EXISTS creado_en         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE TABLE IF NOT EXISTS ajustes_inventario (
  id                BIGINT GENERATED BY DEFAULT AS IDENTITY NOT NULL,
  sucursal_id       BIGINT NOT NULL,
  tipo              tipo_ajuste NOT NULL DEFAULT 'AJUSTE_MANUAL',
  motivo_ajuste_id  BIGINT NOT NULL,
  usuario_id        BIGINT NOT NULL,
  prefijo           VARCHAR(8) NOT NULL DEFAULT '',
  numero            BIGINT NOT NULL CHECK (numero >= 0),
  anio              INTEGER NOT NULL CHECK (anio >= 2000 AND anio <= 2100),
  fecha             TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  observaciones     VARCHAR(255),
  estado            estado_ajuste NOT NULL DEFAULT 'BORRADOR',
  aplicado_en       TIMESTAMP(3),
  anulado_en        TIMESTAMP(3),
  anulado_por       BIGINT,
  motivo_anulacion  VARCHAR(200),
  creado_en         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_en    TIMESTAMP(3),
  PRIMARY KEY (id)
);
ALTER TABLE ajustes_inventario ADD COLUMN IF NOT EXISTS id                BIGINT GENERATED BY DEFAULT AS IDENTITY NOT NULL;
ALTER TABLE ajustes_inventario ADD COLUMN IF NOT EXISTS sucursal_id       BIGINT NOT NULL;
ALTER TABLE ajustes_inventario ADD COLUMN IF NOT EXISTS tipo              tipo_ajuste NOT NULL DEFAULT 'AJUSTE_MANUAL';
ALTER TABLE ajustes_inventario ADD COLUMN IF NOT EXISTS motivo_ajuste_id  BIGINT NOT NULL;
ALTER TABLE ajustes_inventario ADD COLUMN IF NOT EXISTS usuario_id        BIGINT NOT NULL;
ALTER TABLE ajustes_inventario ADD COLUMN IF NOT EXISTS prefijo           VARCHAR(8) NOT NULL DEFAULT '';
ALTER TABLE ajustes_inventario ADD COLUMN IF NOT EXISTS numero            BIGINT NOT NULL CHECK (numero >= 0);
ALTER TABLE ajustes_inventario ADD COLUMN IF NOT EXISTS anio              INTEGER NOT NULL CHECK (anio >= 2000 AND anio <= 2100);
ALTER TABLE ajustes_inventario ADD COLUMN IF NOT EXISTS fecha             TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE ajustes_inventario ADD COLUMN IF NOT EXISTS observaciones     VARCHAR(255);
ALTER TABLE ajustes_inventario ADD COLUMN IF NOT EXISTS estado            estado_ajuste NOT NULL DEFAULT 'BORRADOR';
ALTER TABLE ajustes_inventario ADD COLUMN IF NOT EXISTS aplicado_en       TIMESTAMP(3);
ALTER TABLE ajustes_inventario ADD COLUMN IF NOT EXISTS anulado_en        TIMESTAMP(3);
ALTER TABLE ajustes_inventario ADD COLUMN IF NOT EXISTS anulado_por       BIGINT;
ALTER TABLE ajustes_inventario ADD COLUMN IF NOT EXISTS motivo_anulacion  VARCHAR(200);
ALTER TABLE ajustes_inventario ADD COLUMN IF NOT EXISTS creado_en         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE ajustes_inventario ADD COLUMN IF NOT EXISTS actualizado_en    TIMESTAMP(3);

CREATE TABLE IF NOT EXISTS ajuste_detalle (
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
  creado_en                  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id)
);
ALTER TABLE ajuste_detalle ADD COLUMN IF NOT EXISTS id                         BIGINT GENERATED BY DEFAULT AS IDENTITY NOT NULL;
ALTER TABLE ajuste_detalle ADD COLUMN IF NOT EXISTS ajuste_id                  BIGINT NOT NULL;
ALTER TABLE ajuste_detalle ADD COLUMN IF NOT EXISTS linea                      INTEGER NOT NULL CHECK (linea >= 0);
ALTER TABLE ajuste_detalle ADD COLUMN IF NOT EXISTS producto_id                BIGINT NOT NULL;
ALTER TABLE ajuste_detalle ADD COLUMN IF NOT EXISTS descripcion                VARCHAR(160) NOT NULL;
ALTER TABLE ajuste_detalle ADD COLUMN IF NOT EXISTS costo_unitario             DECIMAL(14,4) NOT NULL CHECK (costo_unitario >= 0);
ALTER TABLE ajuste_detalle ADD COLUMN IF NOT EXISTS cantidad_sistema           DECIMAL(14,3) NOT NULL CHECK (cantidad_sistema >= 0);
ALTER TABLE ajuste_detalle ADD COLUMN IF NOT EXISTS cantidad_fisica            DECIMAL(14,3) NOT NULL CHECK (cantidad_fisica >= 0);
ALTER TABLE ajuste_detalle ADD COLUMN IF NOT EXISTS cantidad_diferencia        DECIMAL(14,3) NOT NULL;
ALTER TABLE ajuste_detalle ADD COLUMN IF NOT EXISTS costo_total_diferencia     DECIMAL(14,2) NOT NULL;
ALTER TABLE ajuste_detalle ADD COLUMN IF NOT EXISTS creado_en                  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE TABLE IF NOT EXISTS inventario_movimientos (
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
  creado_en                 TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id)
);
ALTER TABLE inventario_movimientos ADD COLUMN IF NOT EXISTS id                        BIGINT GENERATED BY DEFAULT AS IDENTITY NOT NULL;
ALTER TABLE inventario_movimientos ADD COLUMN IF NOT EXISTS sucursal_id               BIGINT NOT NULL;
ALTER TABLE inventario_movimientos ADD COLUMN IF NOT EXISTS producto_id               BIGINT NOT NULL;
ALTER TABLE inventario_movimientos ADD COLUMN IF NOT EXISTS tipo                      tipo_movimiento_inventario NOT NULL;
ALTER TABLE inventario_movimientos ADD COLUMN IF NOT EXISTS signo                     INTEGER NOT NULL CHECK (signo IN (-1, 1));
ALTER TABLE inventario_movimientos ADD COLUMN IF NOT EXISTS cantidad                  DECIMAL(14,3) NOT NULL CHECK (cantidad > 0);
ALTER TABLE inventario_movimientos ADD COLUMN IF NOT EXISTS costo_unitario            DECIMAL(14,4) NOT NULL CHECK (costo_unitario >= 0);
ALTER TABLE inventario_movimientos ADD COLUMN IF NOT EXISTS costo_total               DECIMAL(14,2) NOT NULL;
ALTER TABLE inventario_movimientos ADD COLUMN IF NOT EXISTS saldo_anterior            DECIMAL(14,3) NOT NULL;
ALTER TABLE inventario_movimientos ADD COLUMN IF NOT EXISTS saldo_posterior           DECIMAL(14,3) NOT NULL;
ALTER TABLE inventario_movimientos ADD COLUMN IF NOT EXISTS costo_promedio_anterior   DECIMAL(14,4) NOT NULL DEFAULT 0 CHECK (costo_promedio_anterior >= 0);
ALTER TABLE inventario_movimientos ADD COLUMN IF NOT EXISTS costo_promedio_posterior  DECIMAL(14,4) NOT NULL DEFAULT 0 CHECK (costo_promedio_posterior >= 0);
ALTER TABLE inventario_movimientos ADD COLUMN IF NOT EXISTS documento_tipo            tipo_documento_movimiento NOT NULL;
ALTER TABLE inventario_movimientos ADD COLUMN IF NOT EXISTS venta_id                  BIGINT;
ALTER TABLE inventario_movimientos ADD COLUMN IF NOT EXISTS compra_id                 BIGINT;
ALTER TABLE inventario_movimientos ADD COLUMN IF NOT EXISTS ajuste_id                 BIGINT;
ALTER TABLE inventario_movimientos ADD COLUMN IF NOT EXISTS devolucion_id             BIGINT;
ALTER TABLE inventario_movimientos ADD COLUMN IF NOT EXISTS motivo_id                 BIGINT;
ALTER TABLE inventario_movimientos ADD COLUMN IF NOT EXISTS usuario_id                BIGINT NOT NULL;
ALTER TABLE inventario_movimientos ADD COLUMN IF NOT EXISTS nota                      VARCHAR(255);
ALTER TABLE inventario_movimientos ADD COLUMN IF NOT EXISTS creado_en                 TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE TABLE IF NOT EXISTS movimientos_caja (
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
  fecha             TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  creado_en         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id)
);
ALTER TABLE movimientos_caja ADD COLUMN IF NOT EXISTS id                BIGINT GENERATED BY DEFAULT AS IDENTITY NOT NULL;
ALTER TABLE movimientos_caja ADD COLUMN IF NOT EXISTS turno_caja_id     BIGINT NOT NULL;
ALTER TABLE movimientos_caja ADD COLUMN IF NOT EXISTS sucursal_id       BIGINT NOT NULL;
ALTER TABLE movimientos_caja ADD COLUMN IF NOT EXISTS tipo              tipo_movimiento_caja NOT NULL;
ALTER TABLE movimientos_caja ADD COLUMN IF NOT EXISTS signo             INTEGER NOT NULL CHECK (signo IN (-1, 1));
ALTER TABLE movimientos_caja ADD COLUMN IF NOT EXISTS moneda            tipo_metodo_pago_moneda NOT NULL;
ALTER TABLE movimientos_caja ADD COLUMN IF NOT EXISTS monto_moneda      DECIMAL(18,4) NOT NULL CHECK (monto_moneda > 0);
ALTER TABLE movimientos_caja ADD COLUMN IF NOT EXISTS tasa_aplicada     DECIMAL(18,6) NOT NULL CHECK (tasa_aplicada > 0);
ALTER TABLE movimientos_caja ADD COLUMN IF NOT EXISTS monto_usd         DECIMAL(14,2) NOT NULL CHECK (monto_usd >= 0);
ALTER TABLE movimientos_caja ADD COLUMN IF NOT EXISTS metodo_pago_id    BIGINT;
ALTER TABLE movimientos_caja ADD COLUMN IF NOT EXISTS concepto          VARCHAR(200) NOT NULL;
ALTER TABLE movimientos_caja ADD COLUMN IF NOT EXISTS documento_tipo    documento_tipo_caja NOT NULL DEFAULT 'MANUAL';
ALTER TABLE movimientos_caja ADD COLUMN IF NOT EXISTS documento_id      BIGINT;
ALTER TABLE movimientos_caja ADD COLUMN IF NOT EXISTS usuario_id        BIGINT NOT NULL;
ALTER TABLE movimientos_caja ADD COLUMN IF NOT EXISTS autorizado_por    BIGINT;
ALTER TABLE movimientos_caja ADD COLUMN IF NOT EXISTS fecha             TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE movimientos_caja ADD COLUMN IF NOT EXISTS creado_en         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE TABLE IF NOT EXISTS auditoria (
  id            BIGINT GENERATED BY DEFAULT AS IDENTITY NOT NULL,
  ocurrido_en   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
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
  creado_en     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id)
);
ALTER TABLE auditoria ADD COLUMN IF NOT EXISTS id            BIGINT GENERATED BY DEFAULT AS IDENTITY NOT NULL;
ALTER TABLE auditoria ADD COLUMN IF NOT EXISTS ocurrido_en   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE auditoria ADD COLUMN IF NOT EXISTS usuario_id    BIGINT;
ALTER TABLE auditoria ADD COLUMN IF NOT EXISTS sucursal_id   BIGINT;
ALTER TABLE auditoria ADD COLUMN IF NOT EXISTS accion        accion_auditoria NOT NULL;
ALTER TABLE auditoria ADD COLUMN IF NOT EXISTS entidad       VARCHAR(60) NOT NULL;
ALTER TABLE auditoria ADD COLUMN IF NOT EXISTS entidad_id    BIGINT;
ALTER TABLE auditoria ADD COLUMN IF NOT EXISTS datos_antes   JSONB;
ALTER TABLE auditoria ADD COLUMN IF NOT EXISTS datos_despues JSONB;
ALTER TABLE auditoria ADD COLUMN IF NOT EXISTS ip            INET;
ALTER TABLE auditoria ADD COLUMN IF NOT EXISTS user_agent    VARCHAR(255);
ALTER TABLE auditoria ADD COLUMN IF NOT EXISTS request_id    CHAR(26);
ALTER TABLE auditoria ADD COLUMN IF NOT EXISTS creado_en     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE TABLE IF NOT EXISTS idempotencia_solicitudes (
  clave           CHAR(36) NOT NULL,
  usuario_id      BIGINT NOT NULL,
  endpoint        VARCHAR(120) NOT NULL,
  huella_payload  CHAR(64) NOT NULL,
  estado          estado_idempotencia NOT NULL DEFAULT 'EN_PROCESO',
  http_status     INTEGER,
  respuesta_json  JSONB,
  recurso_tipo    VARCHAR(40),
  recurso_id      BIGINT,
  creado_en       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expira_en       TIMESTAMP(3) NOT NULL,
  PRIMARY KEY (clave)
);
ALTER TABLE idempotencia_solicitudes ADD COLUMN IF NOT EXISTS clave           CHAR(36) NOT NULL;
ALTER TABLE idempotencia_solicitudes ADD COLUMN IF NOT EXISTS usuario_id      BIGINT NOT NULL;
ALTER TABLE idempotencia_solicitudes ADD COLUMN IF NOT EXISTS endpoint        VARCHAR(120) NOT NULL;
ALTER TABLE idempotencia_solicitudes ADD COLUMN IF NOT EXISTS huella_payload  CHAR(64) NOT NULL;
ALTER TABLE idempotencia_solicitudes ADD COLUMN IF NOT EXISTS estado          estado_idempotencia NOT NULL DEFAULT 'EN_PROCESO';
ALTER TABLE idempotencia_solicitudes ADD COLUMN IF NOT EXISTS http_status     INTEGER;
ALTER TABLE idempotencia_solicitudes ADD COLUMN IF NOT EXISTS respuesta_json  JSONB;
ALTER TABLE idempotencia_solicitudes ADD COLUMN IF NOT EXISTS recurso_tipo    VARCHAR(40);
ALTER TABLE idempotencia_solicitudes ADD COLUMN IF NOT EXISTS recurso_id      BIGINT;
ALTER TABLE idempotencia_solicitudes ADD COLUMN IF NOT EXISTS creado_en       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE idempotencia_solicitudes ADD COLUMN IF NOT EXISTS expira_en       TIMESTAMP(3) NOT NULL;

CREATE TABLE IF NOT EXISTS resumen_ventas_diario (
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
  calculado_en            TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (fecha, sucursal_id, producto_id)
);
ALTER TABLE resumen_ventas_diario ADD COLUMN IF NOT EXISTS fecha                   DATE NOT NULL;
ALTER TABLE resumen_ventas_diario ADD COLUMN IF NOT EXISTS sucursal_id             BIGINT NOT NULL;
ALTER TABLE resumen_ventas_diario ADD COLUMN IF NOT EXISTS producto_id             BIGINT NOT NULL;
ALTER TABLE resumen_ventas_diario ADD COLUMN IF NOT EXISTS categoria_id            BIGINT NOT NULL;
ALTER TABLE resumen_ventas_diario ADD COLUMN IF NOT EXISTS cantidad_vendida        DECIMAL(14,3) NOT NULL DEFAULT 0 CHECK (cantidad_vendida >= 0);
ALTER TABLE resumen_ventas_diario ADD COLUMN IF NOT EXISTS cantidad_devuelta       DECIMAL(14,3) NOT NULL DEFAULT 0 CHECK (cantidad_devuelta >= 0);
ALTER TABLE resumen_ventas_diario ADD COLUMN IF NOT EXISTS venta_neta_usd          DECIMAL(14,2) NOT NULL DEFAULT 0 CHECK (venta_neta_usd >= 0);
ALTER TABLE resumen_ventas_diario ADD COLUMN IF NOT EXISTS venta_neta_bs           DECIMAL(18,2) NOT NULL DEFAULT 0 CHECK (venta_neta_bs >= 0);
ALTER TABLE resumen_ventas_diario ADD COLUMN IF NOT EXISTS impuesto_total_usd      DECIMAL(14,2) NOT NULL DEFAULT 0 CHECK (impuesto_total_usd >= 0);
ALTER TABLE resumen_ventas_diario ADD COLUMN IF NOT EXISTS impuesto_total_bs       DECIMAL(18,2) NOT NULL DEFAULT 0 CHECK (impuesto_total_bs >= 0);
ALTER TABLE resumen_ventas_diario ADD COLUMN IF NOT EXISTS costo_total_usd         DECIMAL(14,2) NOT NULL DEFAULT 0 CHECK (costo_total_usd >= 0);
ALTER TABLE resumen_ventas_diario ADD COLUMN IF NOT EXISTS costo_total_bs          DECIMAL(18,2) NOT NULL DEFAULT 0 CHECK (costo_total_bs >= 0);
ALTER TABLE resumen_ventas_diario ADD COLUMN IF NOT EXISTS utilidad_total_usd      DECIMAL(14,2) NOT NULL DEFAULT 0;
ALTER TABLE resumen_ventas_diario ADD COLUMN IF NOT EXISTS utilidad_total_bs       DECIMAL(18,2) NOT NULL DEFAULT 0;
ALTER TABLE resumen_ventas_diario ADD COLUMN IF NOT EXISTS numero_ventas           INTEGER NOT NULL DEFAULT 0 CHECK (numero_ventas >= 0);
ALTER TABLE resumen_ventas_diario ADD COLUMN IF NOT EXISTS tasa_promedio_ponderada DECIMAL(18,6) NOT NULL DEFAULT 0 CHECK (tasa_promedio_ponderada >= 0);
ALTER TABLE resumen_ventas_diario ADD COLUMN IF NOT EXISTS calculado_en            TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE TABLE IF NOT EXISTS trabajos_exportacion (
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
  iniciado_en     TIMESTAMP(3),
  finalizado_en   TIMESTAMP(3),
  expira_en       TIMESTAMP(3),
  creado_en       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id)
);
ALTER TABLE trabajos_exportacion ADD COLUMN IF NOT EXISTS id              BIGINT GENERATED BY DEFAULT AS IDENTITY NOT NULL;
ALTER TABLE trabajos_exportacion ADD COLUMN IF NOT EXISTS usuario_id      BIGINT NOT NULL;
ALTER TABLE trabajos_exportacion ADD COLUMN IF NOT EXISTS sucursal_id     BIGINT NOT NULL;
ALTER TABLE trabajos_exportacion ADD COLUMN IF NOT EXISTS tipo_reporte    VARCHAR(60) NOT NULL;
ALTER TABLE trabajos_exportacion ADD COLUMN IF NOT EXISTS formato         formato_exportacion NOT NULL;
ALTER TABLE trabajos_exportacion ADD COLUMN IF NOT EXISTS parametros_json JSONB NOT NULL;
ALTER TABLE trabajos_exportacion ADD COLUMN IF NOT EXISTS estado          estado_exportacion NOT NULL DEFAULT 'PENDIENTE';
ALTER TABLE trabajos_exportacion ADD COLUMN IF NOT EXISTS archivo_ruta    VARCHAR(255);
ALTER TABLE trabajos_exportacion ADD COLUMN IF NOT EXISTS archivo_bytes   BIGINT;
ALTER TABLE trabajos_exportacion ADD COLUMN IF NOT EXISTS filas_generadas INTEGER;
ALTER TABLE trabajos_exportacion ADD COLUMN IF NOT EXISTS error_mensaje   VARCHAR(500);
ALTER TABLE trabajos_exportacion ADD COLUMN IF NOT EXISTS iniciado_en     TIMESTAMP(3);
ALTER TABLE trabajos_exportacion ADD COLUMN IF NOT EXISTS finalizado_en   TIMESTAMP(3);
ALTER TABLE trabajos_exportacion ADD COLUMN IF NOT EXISTS expira_en       TIMESTAMP(3);
ALTER TABLE trabajos_exportacion ADD COLUMN IF NOT EXISTS creado_en       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE TABLE IF NOT EXISTS migraciones (
  version      VARCHAR(32) NOT NULL,
  nombre       VARCHAR(160) NOT NULL,
  checksum     CHAR(64) NOT NULL,
  aplicada_en  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  duracion_ms  INTEGER NOT NULL DEFAULT 0 CHECK (duracion_ms >= 0),
  aplicada_por VARCHAR(60),
  PRIMARY KEY (version)
);
ALTER TABLE migraciones ADD COLUMN IF NOT EXISTS version      VARCHAR(32) NOT NULL;
ALTER TABLE migraciones ADD COLUMN IF NOT EXISTS nombre       VARCHAR(160) NOT NULL;
ALTER TABLE migraciones ADD COLUMN IF NOT EXISTS checksum     CHAR(64) NOT NULL;
ALTER TABLE migraciones ADD COLUMN IF NOT EXISTS aplicada_en  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE migraciones ADD COLUMN IF NOT EXISTS duracion_ms  INTEGER NOT NULL DEFAULT 0 CHECK (duracion_ms >= 0);
ALTER TABLE migraciones ADD COLUMN IF NOT EXISTS aplicada_por VARCHAR(60);

-- Indices
CREATE UNIQUE INDEX IF NOT EXISTS uq_sucursales_codigo ON sucursales (codigo) WHERE eliminado_en IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_roles_codigo ON roles (codigo) WHERE eliminado_en IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_permisos_codigo ON permisos (codigo);
CREATE INDEX IF NOT EXISTS ix_permisos_modulo ON permisos (modulo);
CREATE INDEX IF NOT EXISTS ix_rp_permiso ON rol_permisos (permiso_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_usuarios_usuario ON usuarios (usuario) WHERE eliminado_en IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_usuarios_email ON usuarios (email) WHERE eliminado_en IS NULL AND email IS NOT NULL;
CREATE INDEX IF NOT EXISTS ix_usuarios_rol ON usuarios (rol_id);
CREATE INDEX IF NOT EXISTS ix_usuarios_sucursal ON usuarios (sucursal_predeterminada_id);
CREATE INDEX IF NOT EXISTS ix_us_sucursal ON usuario_sucursales (sucursal_id);
CREATE INDEX IF NOT EXISTS ix_us_rol ON usuario_sucursales (rol_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_sesiones_token ON sesiones (token_hash);
CREATE INDEX IF NOT EXISTS ix_sesiones_usuario ON sesiones (usuario_id);
CREATE INDEX IF NOT EXISTS ix_sesiones_familia ON sesiones (familia_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_um_codigo ON unidades_medida (codigo) WHERE eliminado_en IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_impuestos_codigo ON impuestos (codigo) WHERE eliminado_en IS NULL;
CREATE INDEX IF NOT EXISTS ix_config_impuesto ON configuracion (impuesto_predeterminado_id);
CREATE INDEX IF NOT EXISTS ix_config_usuario ON configuracion (actualizado_por);
CREATE INDEX IF NOT EXISTS ix_parametros_usuario ON parametros (actualizado_por);
CREATE UNIQUE INDEX IF NOT EXISTS uq_tasa_fecha_viva ON tasas_cambio (fecha) WHERE eliminado_en IS NULL;
CREATE INDEX IF NOT EXISTS ix_tasa_fecha ON tasas_cambio (fecha);
CREATE INDEX IF NOT EXISTS ix_tasa_usuario ON tasas_cambio (usuario_id);
CREATE INDEX IF NOT EXISTS ix_tasa_corrige ON tasas_cambio (corrige_tasa_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_categorias_nombre ON categorias (nombre, COALESCE(categoria_padre_id, 0)) WHERE eliminado_en IS NULL;
CREATE INDEX IF NOT EXISTS ix_categorias_padre ON categorias (categoria_padre_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_proveedores_nit ON proveedores (nit) WHERE eliminado_en IS NULL AND nit IS NOT NULL;
CREATE INDEX IF NOT EXISTS ix_proveedores_razon ON proveedores (razon_social);
CREATE UNIQUE INDEX IF NOT EXISTS uq_clientes_documento ON clientes (tipo_documento, COALESCE(documento, '')) WHERE eliminado_en IS NULL;
CREATE INDEX IF NOT EXISTS ix_clientes_nombre ON clientes (nombre);
CREATE UNIQUE INDEX IF NOT EXISTS uq_metodos_codigo ON metodos_pago (codigo) WHERE eliminado_en IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_motivos_codigo ON motivos_ajuste (codigo);
CREATE UNIQUE INDEX IF NOT EXISTS uq_cajas_codigo ON cajas (sucursal_id, codigo) WHERE eliminado_en IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_turno_abierto ON turnos_caja (caja_id) WHERE estado = 'ABIERTO';
CREATE INDEX IF NOT EXISTS ix_turno_sucursal ON turnos_caja (sucursal_id);
CREATE INDEX IF NOT EXISTS ix_turno_apertura ON turnos_caja (usuario_apertura_id);
CREATE INDEX IF NOT EXISTS ix_turno_cierre ON turnos_caja (usuario_cierre_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_productos_sku ON productos (sku) WHERE eliminado_en IS NULL;
CREATE INDEX IF NOT EXISTS ix_productos_categoria ON productos (categoria_id);
CREATE INDEX IF NOT EXISTS ix_productos_unidad ON productos (unidad_medida_id);
CREATE INDEX IF NOT EXISTS ix_productos_impuesto ON productos (impuesto_id);
CREATE INDEX IF NOT EXISTS ix_productos_proveedor ON productos (proveedor_preferido_id);
CREATE INDEX IF NOT EXISTS ix_productos_creado_por ON productos (creado_por);
CREATE INDEX IF NOT EXISTS ix_productos_favorito ON productos (es_favorito_pos) WHERE es_favorito_pos = TRUE;
CREATE INDEX IF NOT EXISTS ft_productos ON productos USING GIN (to_tsvector('spanish', COALESCE(nombre, '') || ' ' || COALESCE(descripcion, '')));
CREATE UNIQUE INDEX IF NOT EXISTS uq_pcodigos_codigo ON producto_codigos (codigo) WHERE eliminado_en IS NULL;
CREATE INDEX IF NOT EXISTS ix_pcodigos_producto ON producto_codigos (producto_id);
CREATE INDEX IF NOT EXISTS ix_pprecios_producto ON producto_precios (producto_id, vigente_desde);
CREATE INDEX IF NOT EXISTS ix_pprecios_usuario ON producto_precios (usuario_id);
CREATE INDEX IF NOT EXISTS ix_stock_suc_cant ON producto_stock (sucursal_id, cantidad);
CREATE UNIQUE INDEX IF NOT EXISTS uq_consecutivos ON consecutivos (sucursal_id, tipo_documento, anio);
CREATE UNIQUE INDEX IF NOT EXISTS uq_compras_numero ON compras (sucursal_id, anio, prefijo, numero);
CREATE UNIQUE INDEX IF NOT EXISTS uq_compras_idem ON compras (clave_idempotencia) WHERE clave_idempotencia IS NOT NULL;
CREATE INDEX IF NOT EXISTS ix_compras_proveedor ON compras (proveedor_id, fecha_recepcion);
CREATE INDEX IF NOT EXISTS ix_compras_usuario ON compras (usuario_id);
CREATE INDEX IF NOT EXISTS ix_compras_estado ON compras (estado, fecha_recepcion);
CREATE INDEX IF NOT EXISTS ix_compras_anulada_por ON compras (anulada_por);
CREATE UNIQUE INDEX IF NOT EXISTS uq_cdet_linea ON compra_detalle (compra_id, linea);
CREATE INDEX IF NOT EXISTS ix_cdet_producto ON compra_detalle (producto_id);
CREATE INDEX IF NOT EXISTS ix_cdet_unidad ON compra_detalle (unidad_medida_id);
CREATE INDEX IF NOT EXISTS ix_cdet_impuesto ON compra_detalle (impuesto_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_ventas_numero ON ventas (sucursal_id, anio, prefijo, numero);
CREATE UNIQUE INDEX IF NOT EXISTS uq_ventas_idem ON ventas (clave_idempotencia) WHERE clave_idempotencia IS NOT NULL;
CREATE INDEX IF NOT EXISTS ix_ventas_suc_fecha ON ventas (sucursal_id, fecha, estado);
CREATE INDEX IF NOT EXISTS ix_ventas_cliente ON ventas (cliente_id, fecha, estado);
CREATE INDEX IF NOT EXISTS ix_ventas_turno ON ventas (turno_caja_id);
CREATE INDEX IF NOT EXISTS ix_ventas_usuario ON ventas (usuario_id);
CREATE INDEX IF NOT EXISTS ix_ventas_tasa ON ventas (tasa_cambio_id);
CREATE INDEX IF NOT EXISTS ix_ventas_anulada_por ON ventas (anulada_por);
CREATE INDEX IF NOT EXISTS ix_ventas_autorizada_por ON ventas (autorizada_por);
CREATE UNIQUE INDEX IF NOT EXISTS uq_vdet_linea ON venta_detalle (venta_id, linea);
CREATE INDEX IF NOT EXISTS ix_vd_producto ON venta_detalle (producto_id, venta_id);
CREATE INDEX IF NOT EXISTS ix_vd_categoria ON venta_detalle (categoria_id);
CREATE INDEX IF NOT EXISTS ix_vd_unidad ON venta_detalle (unidad_medida_id);
CREATE INDEX IF NOT EXISTS ix_vd_impuesto ON venta_detalle (impuesto_id);
CREATE INDEX IF NOT EXISTS ix_cred_cliente ON creditos (cliente_id, estado, fecha_vencimiento);
CREATE INDEX IF NOT EXISTS ix_cred_sucursal ON creditos (sucursal_id);
CREATE INDEX IF NOT EXISTS ix_cred_venta ON creditos (venta_id);
CREATE INDEX IF NOT EXISTS ix_cred_usuario ON creditos (usuario_id);
CREATE INDEX IF NOT EXISTS ix_cred_autorizado ON creditos (autorizado_por);
CREATE INDEX IF NOT EXISTS ix_cred_anulado ON creditos (anulado_por);
CREATE INDEX IF NOT EXISTS ix_pagos_venta ON pagos (venta_id);
CREATE INDEX IF NOT EXISTS ix_pagos_sucursal ON pagos (sucursal_id);
CREATE INDEX IF NOT EXISTS ix_pagos_turno ON pagos (turno_caja_id);
CREATE INDEX IF NOT EXISTS ix_pagos_metodo ON pagos (metodo_pago_id);
CREATE INDEX IF NOT EXISTS ix_pagos_credito ON pagos (credito_id);
CREATE INDEX IF NOT EXISTS ix_pagos_usuario ON pagos (usuario_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_abonos_numero ON abonos (sucursal_id, anio, prefijo, numero);
CREATE UNIQUE INDEX IF NOT EXISTS uq_abonos_idem ON abonos (clave_idempotencia) WHERE clave_idempotencia IS NOT NULL;
CREATE INDEX IF NOT EXISTS ix_abonos_cliente ON abonos (cliente_id, fecha);
CREATE INDEX IF NOT EXISTS ix_abonos_turno ON abonos (turno_caja_id);
CREATE INDEX IF NOT EXISTS ix_abonos_metodo ON abonos (metodo_pago_id);
CREATE INDEX IF NOT EXISTS ix_abonos_usuario ON abonos (usuario_id);
CREATE INDEX IF NOT EXISTS ix_abonos_tasa ON abonos (tasa_cambio_id);
CREATE INDEX IF NOT EXISTS ix_abonos_anulado ON abonos (anulado_por);
CREATE INDEX IF NOT EXISTS ix_aa_abono ON abono_aplicaciones (abono_id);
CREATE INDEX IF NOT EXISTS ix_aa_credito ON abono_aplicaciones (credito_id);
CREATE INDEX IF NOT EXISTS ix_dev_sucursal ON devoluciones (sucursal_id);
CREATE INDEX IF NOT EXISTS ix_dev_venta ON devoluciones (venta_id);
CREATE INDEX IF NOT EXISTS ix_dev_compra ON devoluciones (compra_id);
CREATE INDEX IF NOT EXISTS ix_dev_cliente ON devoluciones (cliente_id);
CREATE INDEX IF NOT EXISTS ix_dev_proveedor ON devoluciones (proveedor_id);
CREATE INDEX IF NOT EXISTS ix_dev_usuario ON devoluciones (usuario_id);
CREATE INDEX IF NOT EXISTS ix_dev_anulada ON devoluciones (anulada_por);
CREATE UNIQUE INDEX IF NOT EXISTS uq_ddet_linea ON devolucion_detalle (devolucion_id, linea);
CREATE INDEX IF NOT EXISTS ix_ddet_producto ON devolucion_detalle (producto_id);
CREATE INDEX IF NOT EXISTS ix_ddet_vdetalle ON devolucion_detalle (venta_detalle_id);
CREATE INDEX IF NOT EXISTS ix_ddet_impuesto ON devolucion_detalle (impuesto_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_ajustes_numero ON ajustes_inventario (sucursal_id, anio, prefijo, numero);
CREATE INDEX IF NOT EXISTS ix_ajustes_sucursal ON ajustes_inventario (sucursal_id);
CREATE INDEX IF NOT EXISTS ix_ajustes_motivo ON ajustes_inventario (motivo_ajuste_id);
CREATE INDEX IF NOT EXISTS ix_ajustes_usuario ON ajustes_inventario (usuario_id);
CREATE INDEX IF NOT EXISTS ix_ajustes_anulado ON ajustes_inventario (anulado_por);
CREATE UNIQUE INDEX IF NOT EXISTS uq_ajuste_linea ON ajuste_detalle (ajuste_id, linea);
CREATE INDEX IF NOT EXISTS ix_ajuste_detalle_producto ON ajuste_detalle (producto_id);
CREATE INDEX IF NOT EXISTS ix_mov_prod_suc_fecha ON inventario_movimientos (producto_id, sucursal_id, creado_en);
CREATE INDEX IF NOT EXISTS ix_mov_suc_fecha_tipo ON inventario_movimientos (sucursal_id, creado_en, tipo);
CREATE INDEX IF NOT EXISTS ix_mov_venta ON inventario_movimientos (venta_id);
CREATE INDEX IF NOT EXISTS ix_mov_compra ON inventario_movimientos (compra_id);
CREATE INDEX IF NOT EXISTS ix_mov_ajuste ON inventario_movimientos (ajuste_id);
CREATE INDEX IF NOT EXISTS ix_mov_devolucion ON inventario_movimientos (devolucion_id);
CREATE INDEX IF NOT EXISTS ix_mov_motivo ON inventario_movimientos (motivo_id);
CREATE INDEX IF NOT EXISTS ix_mov_usuario ON inventario_movimientos (usuario_id);
CREATE INDEX IF NOT EXISTS ix_mc_turno ON movimientos_caja (turno_caja_id);
CREATE INDEX IF NOT EXISTS ix_mc_sucursal ON movimientos_caja (sucursal_id);
CREATE INDEX IF NOT EXISTS ix_mc_metodo ON movimientos_caja (metodo_pago_id);
CREATE INDEX IF NOT EXISTS ix_mc_usuario ON movimientos_caja (usuario_id);
CREATE INDEX IF NOT EXISTS ix_mc_autorizado ON movimientos_caja (autorizado_por);
CREATE INDEX IF NOT EXISTS ix_aud_entidad ON auditoria (entidad, entidad_id, ocurrido_en);
CREATE INDEX IF NOT EXISTS ix_aud_usuario ON auditoria (usuario_id, ocurrido_en);
CREATE INDEX IF NOT EXISTS ix_aud_sucursal ON auditoria (sucursal_id);
CREATE INDEX IF NOT EXISTS ix_idem_usuario ON idempotencia_solicitudes (usuario_id);
CREATE INDEX IF NOT EXISTS ix_idem_expira ON idempotencia_solicitudes (expira_en);
CREATE INDEX IF NOT EXISTS ix_rvd_suc_fecha ON resumen_ventas_diario (sucursal_id, fecha);
CREATE INDEX IF NOT EXISTS ix_rvd_producto ON resumen_ventas_diario (producto_id);
CREATE INDEX IF NOT EXISTS ix_rvd_categoria ON resumen_ventas_diario (categoria_id);
CREATE INDEX IF NOT EXISTS ix_texp_usuario ON trabajos_exportacion (usuario_id);
CREATE INDEX IF NOT EXISTS ix_texp_sucursal ON trabajos_exportacion (sucursal_id);
CREATE INDEX IF NOT EXISTS ix_texp_estado ON trabajos_exportacion (estado);

-- Triggers (idempotentes)
DROP TRIGGER IF EXISTS trg_usuarios_actualizado ON usuarios;
CREATE TRIGGER trg_usuarios_actualizado BEFORE UPDATE ON usuarios FOR EACH ROW EXECUTE FUNCTION actualizar_actualizado_en();
DROP TRIGGER IF EXISTS trg_um_actualizado ON unidades_medida;
CREATE TRIGGER trg_um_actualizado BEFORE UPDATE ON unidades_medida FOR EACH ROW EXECUTE FUNCTION actualizar_actualizado_en();
DROP TRIGGER IF EXISTS trg_impuestos_actualizado ON impuestos;
CREATE TRIGGER trg_impuestos_actualizado BEFORE UPDATE ON impuestos FOR EACH ROW EXECUTE FUNCTION actualizar_actualizado_en();
DROP TRIGGER IF EXISTS trg_parametros_actualizado ON parametros;
CREATE TRIGGER trg_parametros_actualizado BEFORE UPDATE ON parametros FOR EACH ROW EXECUTE FUNCTION actualizar_actualizado_en();
DROP TRIGGER IF EXISTS trg_tasas_actualizado ON tasas_cambio;
CREATE TRIGGER trg_tasas_actualizado BEFORE UPDATE ON tasas_cambio FOR EACH ROW EXECUTE FUNCTION actualizar_actualizado_en();
DROP TRIGGER IF EXISTS trg_categorias_actualizado ON categorias;
CREATE TRIGGER trg_categorias_actualizado BEFORE UPDATE ON categorias FOR EACH ROW EXECUTE FUNCTION actualizar_actualizado_en();
DROP TRIGGER IF EXISTS trg_proveedores_actualizado ON proveedores;
CREATE TRIGGER trg_proveedores_actualizado BEFORE UPDATE ON proveedores FOR EACH ROW EXECUTE FUNCTION actualizar_actualizado_en();
DROP TRIGGER IF EXISTS trg_clientes_actualizado ON clientes;
CREATE TRIGGER trg_clientes_actualizado BEFORE UPDATE ON clientes FOR EACH ROW EXECUTE FUNCTION actualizar_actualizado_en();
DROP TRIGGER IF EXISTS trg_metodos_pago_actualizado ON metodos_pago;
CREATE TRIGGER trg_metodos_pago_actualizado BEFORE UPDATE ON metodos_pago FOR EACH ROW EXECUTE FUNCTION actualizar_actualizado_en();
DROP TRIGGER IF EXISTS trg_cajas_actualizado ON cajas;
CREATE TRIGGER trg_cajas_actualizado BEFORE UPDATE ON cajas FOR EACH ROW EXECUTE FUNCTION actualizar_actualizado_en();
DROP TRIGGER IF EXISTS trg_turnos_actualizado ON turnos_caja;
CREATE TRIGGER trg_turnos_actualizado BEFORE UPDATE ON turnos_caja FOR EACH ROW EXECUTE FUNCTION actualizar_actualizado_en();
DROP TRIGGER IF EXISTS trg_productos_actualizado ON productos;
CREATE TRIGGER trg_productos_actualizado BEFORE UPDATE ON productos FOR EACH ROW EXECUTE FUNCTION actualizar_actualizado_en();
DROP TRIGGER IF EXISTS trg_pcodigos_actualizado ON producto_codigos;
CREATE TRIGGER trg_pcodigos_actualizado BEFORE UPDATE ON producto_codigos FOR EACH ROW EXECUTE FUNCTION actualizar_actualizado_en();
DROP TRIGGER IF EXISTS trg_stock_actualizado ON producto_stock;
CREATE TRIGGER trg_stock_actualizado BEFORE UPDATE ON producto_stock FOR EACH ROW EXECUTE FUNCTION actualizar_stock_timestamp();
DROP TRIGGER IF EXISTS trg_consecutivos_actualizado ON consecutivos;
CREATE TRIGGER trg_consecutivos_actualizado BEFORE UPDATE ON consecutivos FOR EACH ROW EXECUTE FUNCTION actualizar_actualizado_en();
DROP TRIGGER IF EXISTS trg_compras_actualizado ON compras;
CREATE TRIGGER trg_compras_actualizado BEFORE UPDATE ON compras FOR EACH ROW EXECUTE FUNCTION actualizar_actualizado_en();
DROP TRIGGER IF EXISTS trg_ventas_actualizado ON ventas;
CREATE TRIGGER trg_ventas_actualizado BEFORE UPDATE ON ventas FOR EACH ROW EXECUTE FUNCTION actualizar_actualizado_en();
DROP TRIGGER IF EXISTS trg_creditos_actualizado ON creditos;
CREATE TRIGGER trg_creditos_actualizado BEFORE UPDATE ON creditos FOR EACH ROW EXECUTE FUNCTION actualizar_actualizado_en();
DROP TRIGGER IF EXISTS trg_abonos_actualizado ON abonos;
CREATE TRIGGER trg_abonos_actualizado BEFORE UPDATE ON abonos FOR EACH ROW EXECUTE FUNCTION actualizar_actualizado_en();
DROP TRIGGER IF EXISTS trg_devoluciones_actualizado ON devoluciones;
CREATE TRIGGER trg_devoluciones_actualizado BEFORE UPDATE ON devoluciones FOR EACH ROW EXECUTE FUNCTION actualizar_actualizado_en();
DROP TRIGGER IF EXISTS trg_ajustes_actualizado ON ajustes_inventario;
CREATE TRIGGER trg_ajustes_actualizado BEFORE UPDATE ON ajustes_inventario FOR EACH ROW EXECUTE FUNCTION actualizar_actualizado_en();
