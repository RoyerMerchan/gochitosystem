# 00 — Fundación y Decisiones de Arquitectura

**Proyecto:** GochitoSystem — Punto de Venta, Inventario y Créditos
**Fase:** 1 (documentación y esquema de base de datos)
**Estado:** Contrato canónico aprobado. Este documento es la fuente de verdad de la que dependen todos los demás documentos del proyecto.
**Última actualización:** 2026-07-19

---

## 1. Visión del producto

GochitoSystem es un sistema de gestión comercial para un negocio de retail pequeño o mediano —tienda de barrio, minimercado, abarrotes— que hoy opera con cuaderno, calculadora y memoria, y que necesita saber tres cosas que ningún cuaderno responde con exactitud: **cuánto tengo**, **cuánto gané** y **quién me debe**.

El producto se construye alrededor de una tesis muy concreta: *el valor de un POS no está en registrar la venta, está en poder explicarla seis meses después*. Registrar una venta es fácil; que el reporte de utilidad de marzo siga diciendo lo mismo en diciembre es lo difícil, y es exactamente donde fracasan los sistemas improvisados. Por eso la arquitectura completa gira alrededor del **snapshot de costo**: cada renglón vendido congela su costo, su precio y su utilidad en el instante de la venta, y ningún reporte vuelve a consultar el costo actual del producto.

La visión operativa es igual de concreta:

- **Rapidez en el mostrador.** El POS debe permitir cerrar una venta en efectivo con teclado y lector de código de barras, sin mouse, en menos de diez segundos. Toda decisión de diseño que estorbe ese flujo se rechaza.
- **Verdad reconstruible.** El stock, los saldos de crédito y los totales son cachés. La verdad es el libro de movimientos de inventario y el detalle de los documentos. Todo caché tiene una consulta de reconciliación y un job que la ejecuta.
- **Crecimiento sin reescritura.** El negocio quiere abrir una segunda sucursal. `sucursal_id` existe desde la primera migración aunque la interfaz de la Fase 1 nunca lo muestre.
- **Evidencia contra el fraude interno.** Turnos de caja, arqueo, bitácora de acciones con consecuencia económica. En un negocio con empleados, este es el único control real.

### Qué NO es GochitoSystem

No es un ERP. No es un sistema de facturación electrónica certificado ante la DIAN (el esquema deja el espacio para resolución y rangos de numeración, pero la integración no está en alcance). No es un e-commerce. No es un sistema contable de partida doble: produce los insumos que un contador necesita, no el balance.

---

## 2. Alcance: Fase 1 vs. futuro

### Fase 1 — Documentación y esquema (esta entrega)

Esta fase produce **exclusivamente** documentación y SQL. No hay código de aplicación. Los entregables son:

1. Este documento de fundación y decisiones.
2. El contrato canónico de datos: todas las tablas, todas las columnas, todos los tipos, todas las llaves foráneas.
3. Las migraciones versionadas en `/database/migrations/`.
4. Las semillas en `/database/seeds/`.
5. Los documentos derivados: flujos de negocio, contrato de API, guía de reportes.

### Fase 2 — Backend y POS (siguiente)

Autenticación y RBAC, catálogos, compras, kardex y costo promedio ponderado, POS con pago mixto y snapshot de costo, créditos y abonos, turnos de caja, reportes con exportación a PDF y Excel, dashboard.

### Fase 3 y posteriores — Preparado, no implementado

Estas capacidades **no se construyen ahora**, pero el esquema ya las admite sin migración destructiva:

| Capacidad futura | Qué ya está previsto en el esquema |
|---|---|
| Multi-sucursal real | `sucursal_id NOT NULL` en todas las tablas de hechos; consecutivos por sucursal; `usuario_sucursales` |
| Costeo FIFO por lotes | `inventario_movimientos` es append-only y guarda `costo_unitario` por movimiento: el kardex es reconstruible y el cambio de método no toca `venta_detalle` |
| Facturación electrónica | `consecutivos` con `prefijo`, `resolucion`, `rango_desde`, `rango_hasta`, `vigente_hasta` |
| POS offline-tolerante | `ventas.clave_idempotencia` + tabla `idempotencia_solicitudes` + PWA en el frontend |
| Réplica de lectura para reportes | Segundo pool de `mysql2` desde el día 1, aunque apunte al mismo servidor |
| Combos y presentaciones | Se documentan como extensión; la unidad base del inventario ya está fijada |

---

## 3. Glosario del dominio

Este vocabulario es obligatorio en código, documentación, nombres de tablas y mensajes de interfaz. La mitad de los bugs de un POS nacen de que dos personas llaman distinto a lo mismo.

- **Snapshot de costo.** Copia congelada del costo unitario del producto en el instante de la venta, almacenada en `venta_detalle.precio_compra_unitario`. Es la regla innegociable del sistema.
- **CPP / Costo Promedio Ponderado móvil.** Método de costeo. Cada entrada de inventario recalcula el costo promedio: `nuevo = (stock * costo_promedio + cantidad_entrada * costo_entrada) / (stock + cantidad_entrada)`.
- **Kardex.** El libro mayor de inventario: la tabla `inventario_movimientos`. Append-only. Es la verdad del stock.
- **Existencia / stock.** Saldo materializado en `producto_stock`. Es una caché del kardex, nunca la verdad.
- **Documento.** Registro contable inmutable: venta, compra, devolución, ajuste, abono. Nunca se edita ni se borra; se anula.
- **Anulación.** Cambio de `estado` a `ANULADA` más movimientos compensatorios de inventario, caja y cartera. El documento original permanece visible y numerado.
- **Consecutivo.** Número correlativo sin huecos por sucursal, tipo de documento y año, entregado por la tabla `consecutivos` bajo `SELECT ... FOR UPDATE`.
- **Turno de caja.** Periodo entre la apertura y el cierre de una caja física por un usuario. Toda venta pertenece a un turno.
- **Arqueo.** Conteo físico del efectivo al cerrar un turno; produce `diferencia = contado - esperado`.
- **Crédito / fiado.** Documento de cuenta por cobrar generado cuando una venta se paga total o parcialmente con el método de tipo `CREDITO`.
- **Abono.** Pago que hace un cliente contra su deuda. Se aplica a uno o varios créditos mediante `abono_aplicaciones`, en orden FIFO por fecha de vencimiento.
- **Cupo de crédito.** Monto máximo que un cliente puede deber. Se valida con bloqueo de fila antes de cerrar una venta a crédito.
- **Base gravable.** Valor de la línea sin impuesto, después de descuentos. **La utilidad se calcula sobre la base gravable, nunca sobre el total con impuesto.**
- **Precio con impuesto incluido.** Modo típico de tienda de barrio: el precio de la etiqueta ya incluye el IVA. El sistema desagrega: `base = precio / (1 + tasa/100)`.
- **Redondeo.** Ajuste del total del documento al múltiplo configurado (típicamente 50 COP). Se aplica al total, no a los renglones, y se guarda en `ventas.redondeo`.
- **Merma.** Pérdida de inventario por vencimiento, daño o robo. Se registra como ajuste negativo con motivo tipificado.
- **Reconciliación.** Consulta que recalcula un valor cacheado desde su fuente de verdad. Una discrepancia es un bug, no un dato a corregir a mano.
- **Idempotencia.** Garantía de que reenviar la misma petición de venta no crea dos ventas.

---

## 4. Roles de usuario

Los roles se modelan en tablas (`roles`, `permisos`, `rol_permisos`), nunca como un `ENUM` en `usuarios`. Los cuatro roles semilla son:

**ADMIN / Dueño.** Acceso total. Ve costos y utilidades, edita configuración, gestiona usuarios y permisos, anula documentos, ajusta inventario, exporta cualquier reporte. Es el único rol que puede modificar precios de venta y costos.

**SUPERVISOR.** Todo lo operativo más autorizaciones: anular ventas, aprobar descuentos por encima del umbral, abrir o cerrar turnos ajenos, autorizar ventas a crédito por encima del cupo. Ve utilidades. No gestiona usuarios ni configuración.

**CAJERO.** Vende, cobra, registra abonos, consulta stock y precios, abre y cierra su propio turno. **No ve costos ni utilidades** — este es el permiso más solicitado y el más olvidado en los diseños ingenuos. No anula ni ajusta inventario.

**BODEGA.** Registra compras, recibe mercancía, hace ajustes y conteos físicos, consulta existencias y costos. No vende ni accede a la caja.

Los permisos siguen la convención `modulo.accion`: `ventas.crear`, `ventas.anular`, `productos.editar_costo`, `reportes.utilidad.ver`, `inventario.ajustar`, `creditos.autorizar`, `config.editar`, `usuarios.gestionar`. La asignación es por usuario **y por sucursal** (`usuario_sucursales`), de modo que alguien pueda ser cajero en una sede y supervisor en otra.

---

## 5. Stack tecnológico y justificación

### Base de datos: MariaDB 10.11+ / InnoDB / utf8mb4

Elegida por continuidad con los proyectos existentes del usuario y por costo operativo cero. InnoDB aporta lo que un POS necesita de forma irrenunciable: transacciones ACID, bloqueo de fila (`SELECT ... FOR UPDATE`) y llaves foráneas reales. `utf8mb4` porque los nombres de producto llevan tildes, ñ y en ocasiones emojis pegados desde una lista de proveedor. MariaDB 10.11 es LTS y soporta `CHECK` constraints (desde 10.2.1) y columnas generadas, ambas usadas intensivamente en el esquema. El `docker-compose.yml` ya fija `binlog-format=ROW` y `log-bin`, habilitando recuperación a un punto en el tiempo.

### Sin ORM: SQL crudo con `mysql2/promise`

Decisión consciente. Un POS vive de consultas de reporte con agregaciones, ventanas y anti-joins que ningún ORM expresa bien, y de transacciones con bloqueo explícito que los ORM esconden. Escribir SQL a mano da control total sobre el plan de ejecución y hace que las migraciones sean archivos que un DBA puede leer. El costo —repetir mapeo de filas a objetos— se paga una vez en la capa de repositorios.

### Backend: Node.js 20+, TypeScript 5, Express 5

TypeScript aporta el contrato de tipos entre capas; es la diferencia entre descubrir un campo mal escrito en compilación o en producción. Express 5 por madurez y por manejo nativo de promesas rechazadas en middlewares. Arquitectura estricta por capas: `routes → controllers → services → repositories → db`. Los controladores no llevan lógica; los servicios abren y cierran las transacciones; los repositorios contienen el SQL y **reciben `sucursal_id` como parámetro obligatorio en su firma**.

- **Zod**: validación en la frontera HTTP y esquemas compartidos conceptualmente con el frontend. Toda entrada se valida antes de tocar un servicio.
- **jsonwebtoken + bcrypt**: access token de 15 minutos sin permisos embebidos (un permiso revocado debe surtir efecto ya, no en 15 minutos) y refresh token opaco rotativo con hash en base de datos.
- **helmet, cors, express-rate-limit**: cabeceras seguras, origen controlado y freno al login por fuerza bruta.
- **morgan** con formato JSON: logs estructurados a stdout, con `request_id` correlacionable.
- **pdfkit y exceljs**: exportación en servidor. Los exports grandes se encolan en `trabajos_exportacion` y responden `202`, porque generar un Excel de 50.000 filas dentro del handler bloquea el event loop y tumba el POS.
- **vitest**: pruebas rápidas con soporte nativo de TypeScript y ESM.
- **Docker + docker-compose**: entorno reproducible; ya existe el servicio de MariaDB.

### Frontend: React 19 + Vite 7 + TypeScript

- **TailwindCSS 3**: velocidad de construcción de interfaz sin arrastrar un design system pesado.
- **react-router-dom 7** para navegación; **@tanstack/react-query 5** para todo el estado de servidor (caché, revalidación, reintentos), y **zustand** solo para estado global de interfaz (carrito del POS, turno activo, preferencias). Separar estado de servidor de estado de UI evita el clásico Redux inflado de datos obsoletos.
- **react-hook-form + zod**: la misma validación en cliente y servidor, sin duplicar reglas.
- **axios** con interceptores para el refresh token y el header `Idempotency-Key`.
- **recharts** para el dashboard, **lucide-react** para iconos, **dayjs** para fechas, **xlsx** para exportaciones ligeras del lado del cliente, **framer-motion** para transiciones.
- **vite-plugin-pwa**: el POS debe tolerar una caída de red de treinta segundos sin perder la venta en curso.

---

## 6. Decisiones de arquitectura (ADR)

### ADR-001 — Snapshot de costo en `venta_detalle`

**Contexto.** El requerimiento del cliente lo declara innegociable: las ganancias nunca se calculan con el precio de compra actual.

**Decisión.** Cada renglón de `venta_detalle` almacena `precio_compra_unitario`, `precio_venta_unitario`, `descuento_unitario`, `impuesto_tasa`, `impuesto_monto`, `utilidad_unitaria` y `utilidad_total`, congelados en el `INSERT`. Ninguna consulta de reporte hace `JOIN` a `productos` o a `producto_stock` para obtener costo.

**Alternativas descartadas.** (a) Calcular la utilidad al vuelo con `productos.costo_actual`: hace que el reporte de marzo cambie cada vez que llega una compra nueva. (b) Guardar solo el costo y calcular la utilidad en la consulta: obliga a replicar la fórmula de descuentos e impuestos en cada reporte, y una discrepancia entre dos reportes es indetectable.

**Consecuencias.** Los reportes históricos son inmutables y auditables. `producto_stock.costo_promedio` sirve únicamente para valorizar existencias hoy. Cualquier agregado (`resumen_ventas_diario`) deriva del snapshot, jamás del costo vigente. Una devolución copia el costo del renglón original, no el costo actual.

### ADR-002 — Costo Promedio Ponderado móvil, no FIFO

**Contexto.** Hay que fijar un método de costeo antes de escribir la primera compra.

**Decisión.** CPP móvil, mantenido en `producto_stock.costo_promedio` por producto y sucursal, recalculado dentro de la transacción de cada entrada con bloqueo de fila.

**Alternativas descartadas.** FIFO por capas: exige una tabla de lotes, consumo ordenado y resolución de existencias negativas; multiplica por tres la complejidad del POS y le pide al cajero decidir de qué lote sale el arroz.

**Consecuencias.** Margen estable y aceptado fiscalmente en Colombia. La migración futura a FIFO no toca `venta_detalle` (ya guarda el costo resuelto): solo cambia quién lo calcula. `inventario_movimientos` guarda `costo_unitario` por movimiento, así que el kardex es reconstruible.

### ADR-003 — Inventario como libro mayor append-only

**Contexto.** Una columna `stock` en `productos` es un agregado sin historia: si queda mal no hay forma de saber por qué, imposibilita stock por sucursal y serializa dos cajas sobre la misma fila del catálogo.

**Decisión.** `inventario_movimientos` es append-only y es la fuente de verdad. `producto_stock` es una caché por (producto, sucursal) con `PRIMARY KEY` compuesta. Un job nocturno compara `SUM(signo * cantidad)` contra la caché y registra divergencias.

**Alternativas descartadas.** Stock en `productos`; calcular stock siempre con `SUM()` en vivo (inviable a 60 ms por escaneo cuando hay cientos de miles de movimientos).

**Consecuencias.** Un error se corrige con un movimiento compensatorio, nunca con un `UPDATE`. `saldo_posterior` permite responder "¿cuánto había el 12 de marzo a las 14:30?" con una sola fila.

### ADR-004 — Documentos inmutables; `ON DELETE RESTRICT` universal

**Contexto.** Un `DELETE` mal filtrado desde una consola destruye simultáneamente la utilidad histórica y el libro de inventario.

**Decisión.** `ON DELETE RESTRICT` y `ON UPDATE RESTRICT` en el 100% de las llaves foráneas, incluido `venta_detalle → ventas`. `ON DELETE SET NULL` solo en referencias informativas no contables. La eliminación de un documento es físicamente imposible; se modela con `estado = 'ANULADA'`, `anulada_en`, `anulado_por`, `motivo_anulacion`. Un trigger `BEFORE UPDATE ON ventas` con `SIGNAL SQLSTATE '45000'` bloquea la modificación de importes cuando `estado = 'CERRADA'`.

**Alternativas descartadas.** `ON DELETE CASCADE` en los detalles por "dependencia existencial": convierte el borrado de un documento contable en una operación que funciona.

**Consecuencias.** Los catálogos usan borrado lógico (`eliminado_en`) con columna virtual `activo_uk` para que los índices únicos solo apliquen a las filas activas.

### ADR-005 — `sucursal_id` desde la primera migración

**Contexto.** Añadirlo con doscientos mil movimientos escritos exige `ALTER TABLE` sobre tablas grandes, backfill con un valor inventado, reconstruir todos los índices únicos compuestos, renumerar comprobantes y auditar cada `WHERE` buscando fugas entre sucursales. Es una reescritura, no una migración.

**Decisión.** Toda tabla de hechos lleva `sucursal_id BIGINT UNSIGNED NOT NULL`. Los catálogos compartidos (productos, categorías, clientes) no lo llevan. La migración `001` inserta la sucursal `PRINCIPAL`. El `sucursal_id` viaja en el JWT y en el contexto de request.

**Consecuencias.** Costo hoy: una columna por tabla y cero interfaz. Los repositorios reciben `sucursal_id` obligatorio en su firma.

### ADR-006 — Consecutivos en tabla dedicada, no `AUTO_INCREMENT`

**Contexto.** `AUTO_INCREMENT` deja huecos ante cualquier rollback o reinicio del servidor, y un consecutivo con saltos no lo acepta un revisor fiscal.

**Decisión.** Tabla `consecutivos` por (sucursal, tipo de documento, año). Dentro de la misma transacción del documento y como última operación antes del `INSERT`: `SELECT ... FOR UPDATE`, incrementar, insertar. Refuerzo con `UNIQUE (sucursal_id, tipo_documento, anio, numero)`.

**Alternativas descartadas.** `MAX(numero) + 1` (condición de carrera pura); `AUTO_INCREMENT` con tolerancia a huecos.

**Consecuencias.** Un punto de serialización de milisegundos por sucursal y tipo, irrelevante a esta escala. Nunca se pide el consecutivo antes de validar stock y pagos, para no mantener el bloqueo durante trabajo evitable.

### ADR-007 — Pago mixto en tabla `pagos` (1:N)

**Contexto.** Una columna `ventas.metodo_pago_id` es el error más caro del diseño ingenuo: una fracción grande de las ventas reales son "veinte mil en efectivo y el resto lo fío".

**Decisión.** Tabla `pagos` con N filas por venta. Regla validada en la transacción: `SUM(pagos.monto) = ventas.total`. Un pago de tipo `CREDITO` genera automáticamente el registro en `creditos`.

**Consecuencias.** El arqueo de caja solo suma pagos de métodos con `es_afecta_caja = 1`.

### ADR-008 — Turno de caja obligatorio en toda venta

**Contexto.** Sin turno no existe la pregunta "¿quién tenía la caja cuando faltaron ochenta mil pesos?".

**Decisión.** `ventas.turno_caja_id` es `NOT NULL` desde la primera migración, aunque la interfaz de turnos llegue después. `esperado_efectivo = base_inicial + ventas_efectivo + abonos_efectivo + ingresos − egresos − retiros`.

**Consecuencias.** Es imposible de retrofitear: una columna `NOT NULL` sobre ventas ya escritas obliga a inventar turnos falsos.

### ADR-009 — Idempotencia del POS

**Contexto.** Doble clic, reintento de axios, red inestable en el mostrador. Sin protección: dos ventas, dos descuentos de stock.

**Decisión.** El cliente genera un UUID v4 por intento de venta y lo envía en el header `Idempotency-Key`. Middleware con tabla `idempotencia_solicitudes` y refuerzo en `ventas.clave_idempotencia UNIQUE`.

**Consecuencias.** Reenviar la misma venta devuelve la respuesta original con `200/201`, no un error. Misma clave con cuerpo distinto devuelve `422`.

### ADR-010 — RBAC en tablas y sesiones persistidas

**Contexto.** El primer requerimiento real será "el cajero Pedro sí puede anular ventas pero Ana no". Con un `ENUM` eso es un `ALTER TABLE` en producción por cada matiz.

**Decisión.** `roles`, `permisos`, `rol_permisos`, `usuario_sucursales`. Refresh tokens hasheados en `sesiones`, rotativos, con `familia_id` y detección de reúso.

**Consecuencias.** Despedir a un empleado lo desconecta de inmediato. Los permisos se resuelven en servidor por request y se cachean en memoria con invalidación.

### ADR-011 — Configuración con columnas tipadas más EAV acotado

**Contexto.** El cliente exige un módulo de configuración editable (nombre, logo, dirección, teléfono, moneda, impuestos, datos del ticket).

**Decisión.** `configuracion` con columnas tipadas y `CHECK (id = 1)` para fila única, más `parametros` clave-valor tipado para banderas futuras.

**Alternativas descartadas.** EAV puro: pierde validación y tipos justo en los campos que sí importan.

### ADR-012 — Reportes fuera de la ruta caliente del POS

**Contexto.** "El POS se pone lento cuando el dueño abre el dashboard" es el síntoma clásico de reportes que saturan el buffer pool.

**Decisión.** Escalones progresivos: índices de cobertura, pool de lectura separado (`poolReportes`, `connectionLimit` bajo, `READ COMMITTED`), agregados diarios en `resumen_ventas_diario` recalculados a las 03:00 sobre los últimos tres días, y exports encolados. El día en curso se sirve en vivo; los históricos, desde el agregado.

**Consecuencias.** Mover reportes a una réplica es cambiar una variable de entorno.

---

## 7. Mejoras propuestas sobre el requerimiento original

El cliente pidió catorce tablas. El sistema necesita más. Estas son las adiciones y por qué cada una es obligatoria y no un lujo.

| # | Mejora | Por qué es mejor |
|---|---|---|
| 1 | **`proveedores` + `proveedor_producto`** | El cliente pidió "compras" sin proveedor. Sin proveedor no hay cuentas por pagar, ni análisis de costo por origen, ni devolución de compra, ni respuesta a "¿quién me vende más barato?". |
| 2 | **`roles`, `permisos`, `rol_permisos`, `usuario_sucursales`** | Evita un `ALTER TABLE` en producción por cada matiz de permiso y permite responder "¿quién puede anular ventas?" con una consulta. |
| 3 | **`sucursales`** | Añadirlo después es una reescritura del backend y una renumeración de comprobantes. |
| 4 | **`producto_stock` separado** | Una columna `stock` en `productos` es un agregado sin historia, imposibilita stock por sucursal y serializa dos cajas sobre la misma fila del catálogo. |
| 5 | **`cajas`, `turnos_caja`, `movimientos_caja`** | Es el único control real contra el fraude interno y la única forma de auditar el efectivo. `turno_caja_id NOT NULL` es imposible de retrofitear. |
| 6 | **`devoluciones` + `devolucion_detalle`** | El cliente devuelve mercancía el día 3. Sin devolución modelada, el usuario "arregla" el inventario con un ajuste manual y la utilidad del periodo queda falsa para siempre. |
| 7 | **`auditoria`** | Un descuadre de caja sin forma de saber quién anuló qué es dinero perdido y no recuperable. |
| 8 | **`impuestos` + snapshot de tasa** | Las tasas cambian por ley. Sin versionar la tasa y sin congelarla en el renglón, un cambio del IVA altera facturas ya emitidas. Además, exento (0% gravado) y excluido (fuera del impuesto) no son lo mismo. |
| 9 | **`unidades_medida`** | Vender por peso exige cantidades decimales y una regla de "este producto no admite fracciones". Sin catálogo de unidades, el POS no sabe si `0.485` es válido. |
| 10 | **`sesiones`** (refresh tokens hasheados) | Sin ella no hay botón de "cerrar todas las sesiones" y despedir a un empleado no lo desconecta. |
| 11 | **`consecutivos`** | `AUTO_INCREMENT` deja huecos y un consecutivo con saltos no lo acepta un revisor fiscal. |
| 12 | **`producto_codigos` (1:N)** | Un producto tiene varios códigos de barras: el proveedor cambia el empaque y llegan dos EAN del mismo artículo. Modelarlo 1:1 obliga a duplicar el producto y parte el histórico de ventas. |
| 13 | **`pagos` como tabla 1:N** | El pago mixto es la norma, no la excepción, en una tienda de barrio. |
| 14 | **`abono_aplicaciones`** | Sin la tabla intermedia es imposible responder "¿esta factura ya la pagó?" cuando el cliente abona cincuenta mil sin decir a qué factura. |
| 15 | **`ajustes_inventario`, `ajuste_detalle`, `motivos_ajuste`** | Sin motivo tipificado (merma, vencido, robo, error de digitación) no hay reporte de pérdida y todo ajuste es indistinguible de un robo. |
| 16 | **`idempotencia_solicitudes` + `ventas.clave_idempotencia`** | Ventas duplicadas que descuadran caja e inventario y que se descubren al cierre, cuando ya no se sabe cuál era la real. |
| 17 | **`resumen_ventas_diario`** | Evita que el dashboard del dueño ponga lento el mostrador. Es un agregado derivado, siempre reconstruible desde `venta_detalle`. |
| 18 | **`trabajos_exportacion`** | Generar un Excel de cincuenta mil filas dentro del handler bloquea el event loop de Node y tumba el POS entero. |
| 19 | **`producto_precios` (historial)** | Permite auditar quién cambió un precio y cuándo, y explicar por qué el margen de un producto cayó. |
| 20 | **`migraciones` + checksum** | Detecta que alguien editó una migración ya aplicada, la causa clásica de "en mi máquina sí funciona". |
| 21 | **`parametros`** | Agregar una bandera de comportamiento no debería requerir una migración. |
| 22 | **Redondeo al múltiplo configurado** | El peso colombiano no maneja monedas de a peso. Se redondea el total, no los renglones, y la diferencia se guarda: así los impuestos no se distorsionan y el arqueo cuadra. |
| 23 | **Prorrateo del descuento de documento** | Si el descuento global no se reparte a los renglones, `SUM(utilidad_total)` deja de coincidir con la utilidad real y el reporte por producto miente. |
| 24 | **Reconciliación nocturna de cachés** | Stock, saldos de crédito y totales se verifican contra su fuente de verdad cada noche. Una discrepancia se ve al día siguiente, no a los seis meses. |

---

## 8. Reglas operativas no negociables

1. Ningún reporte de rentabilidad hace `JOIN` a `productos` o `producto_stock` para obtener costo.
2. Todo `UPDATE` de un valor cacheado (stock, saldo de crédito, totales) ocurre dentro de la misma transacción que lo origina.
3. Toda validación de cupo o de stock se hace tras un `SELECT ... FOR UPDATE` sobre la fila correspondiente.
4. Los productos del carrito se bloquean ordenados por `producto_id ASC` para evitar deadlocks.
5. La transacción de venta no contiene llamadas HTTP, generación de PDF ni impresión. Solo SQL. Objetivo: menos de 50 ms.
6. Todo cambio de esquema nace como archivo versionado en `/database/migrations/`. Prohibido tocar la base con un cliente gráfico.
7. Las fechas se almacenan como `DATETIME(3)`; la aplicación fija la zona horaria.
8. `FLOAT` y `DOUBLE` están prohibidos para cualquier valor monetario.
9. Backup diario con `mysqldump --single-transaction --routines --triggers`, retención de 30 días, binlog activo y restauración probada mensualmente en un contenedor limpio.
10. La utilidad se calcula siempre sobre la base gravable, nunca sobre el total con impuesto.
