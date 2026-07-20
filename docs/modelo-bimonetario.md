# Modelo bimonetario USD / Bolivares — GochitoSystem

> Documento normativo. Es la fuente de verdad del manejo de dinero del sistema.
> Complementa a `docs/contrato-canonico.json` (modelo de datos) y a
> `docs/00-fundacion-y-decisiones.md`.
> Todo codigo que toque precios, pagos, caja, cartera o reportes debe leer este
> documento ANTES de escribirse.

---

## 0. Resumen ejecutivo

El negocio opera en Venezuela. **Los precios se piensan y se guardan en dolares.
El cobro ocurre mayoritariamente en bolivares, a la tasa del dia.**

Esto no es un problema de formato ni de presentacion: atraviesa el esquema de la
base de datos, el flujo del POS, el arqueo de caja, la cartera de creditos y
todos los reportes.

Las dos reglas que sostienen el modelo entero:

| Regla | Enunciado | Consecuencia si se rompe |
|---|---|---|
| **A. Snapshot de costo** | `venta_detalle` congela el costo del producto (en USD) en el instante de la venta. Los reportes de utilidad leen SOLO esas columnas. | La utilidad de marzo se recalcula con el costo de julio. Meses rentables se vuelven meses con perdida de forma retroactiva. |
| **B. Snapshot de tasa** | `ventas.tasa_cambio` guarda la tasa usada. Los montos en Bs de ventas pasadas SIEMPRE salen de ahi. | El reporte de marzo cambia de numero cada vez que sube el dolar. Bug critico, no "un detalle de presentacion". |

Ambas son la misma idea: **un documento cerrado no se recalcula jamas, se lee.**

---

## 1. Moneda base = USD

### Regla

- `productos.precio_venta`, `productos.precio_venta_mayorista`,
  `productos.costo_promedio`, `productos.ultimo_costo` y
  `producto_stock.costo_promedio` se almacenan **en USD**.
- Todo precio, costo, utilidad y saldo de cartera vive en USD.
- Precios y costos unitarios: `DECIMAL(14,4)`.
- Totales de documento en USD: `DECIMAL(14,2)`.
- Totales de documento en Bs: `DECIMAL(18,2)` (los montos en Bs son numericamente
  grandes; 14 digitos se quedan cortos ante una devaluacion sostenida).
- Tasas: `DECIMAL(18,6)`.

### Por que

El bolivar se devalua. Un precio guardado en Bs envejece: el producto que ayer
valia Bs 91,25 hoy tiene que valer Bs 130,00 para seguir valiendo lo mismo.
Si el precio vive en Bs, cada devaluacion obliga a un `UPDATE` masivo del
catalogo y el historico de margenes deja de ser comparable.

Con el precio en USD, **el catalogo no se toca**: sube la tasa, sube el precio en
Bs automaticamente, y el margen en USD sigue siendo el mismo numero de siempre.

### Interfaz

El usuario define "este producto vale **$2,50**". **Nunca edita el precio en Bs.**
El equivalente en Bs se muestra como ayuda visual de solo lectura, recalculado con
la tasa vigente:

```
Precio de venta:  [ 2,50 ]  USD
                  ≈ Bs 91,25   (tasa de hoy: 36,50)   ← solo lectura
```

### Prohibido

- `FLOAT` / `DOUBLE` para cualquier monto. En binario `0,1 + 0,2 != 0,3` y el
  arqueo de caja no cuadra.
- Guardar un precio de catalogo en bolivares.
- Derivar el precio en USD dividiendo un precio en Bs por la tasa de hoy.

---

## 2. La tasa del dia — la registra el usuario a mano

### Tabla `tasas_cambio`

| Columna | Tipo | Nota |
|---|---|---|
| `id` | BIGINT UNSIGNED PK | |
| `fecha` | DATE NOT NULL **UNIQUE** | una tasa vigente por dia |
| `tasa` | DECIMAL(18,6) NOT NULL | cuantos **Bs equivale 1 USD** |
| `fuente` | ENUM('MANUAL','BCV','PARALELO','OTRO') | informativo |
| `usuario_id` | BIGINT UNSIGNED NOT NULL | quien la registro |
| `es_correccion` | TINYINT(1) | 1 si corrige una tasa previa |
| `corrige_tasa_id` | BIGINT UNSIGNED NULL | apunta a la fila corregida |
| `notas` | VARCHAR(255) NULL | |
| `creado_en` | DATETIME(3) | |

### Reglas

1. **Historico completo.** Una tasa pasada **nunca se sobrescribe con `UPDATE`**.
   Corregir una tasa es insertar una fila nueva con `es_correccion = 1` y
   `corrige_tasa_id` apuntando a la anterior, y queda registrada en `auditoria`.
   La fila corregida se marca `eliminado_en` para que el `UNIQUE (fecha, activo_uk)`
   siga permitiendo una sola tasa activa por dia.
2. **Sin tasa no se vende.** Si no hay tasa registrada para hoy, el sistema
   **bloquea la creacion de ventas y de abonos** y devuelve el error de negocio
   dedicado:

```json
{
  "ok": false,
  "error": {
    "codigo": "SIN_TASA_DEL_DIA",
    "mensaje": "No hay tasa de cambio registrada para hoy (19/07/2026). Registrela antes de vender.",
    "detalles": { "fecha": "2026-07-19", "ultimaTasaConocida": { "fecha": "2026-07-18", "tasa": "36.200000" } }
  }
}
```

   HTTP **409 Conflict**. No es un 400: el payload del cliente es valido, es el
   estado del negocio el que impide la operacion.

3. **La tasa vigente se muestra SIEMPRE** en la barra superior de la aplicacion y
   en el encabezado del POS. Nunca hay que adivinarla ni ir a buscarla a un menu.
4. **La tasa se lee una sola vez por transaccion** y se congela en el documento.
   Dos ventas del mismo dia comparten tasa; una venta abierta a las 23:58 que se
   cierra a las 00:02 usa la tasa del momento del **cierre**, que es cuando se
   inserta la cabecera.
5. La correccion de una tasa **no reescribe** las ventas ya emitidas con la tasa
   vieja. Corregir el historico de un documento cerrado exige anular y reemitir.

### Modulo

`/api/v1/tasas-cambio`

| Verbo | Ruta | Que hace |
|---|---|---|
| GET | `/api/v1/tasas-cambio/vigente` | tasa de hoy o 404 con `SIN_TASA_DEL_DIA` |
| GET | `/api/v1/tasas-cambio?desde=&hasta=` | historico paginado |
| POST | `/api/v1/tasas-cambio` | registra la tasa del dia |
| POST | `/api/v1/tasas-cambio/:id/corregir` | inserta correccion auditada |

---

## 3. Snapshot de tasa — REGLA INNEGOCIABLE B

### Regla

- `ventas.tasa_cambio DECIMAL(18,6) NOT NULL` guarda la tasa usada en esa venta.
- `ventas.total_bs` guarda el monto en Bs **ya calculado y redondeado** al cerrar
  la venta.
- Los montos en Bs de una venta pasada se calculan **SIEMPRE** con
  `ventas.tasa_cambio`. **JAMAS** con la tasa de hoy.
- Lo mismo aplica a `abonos.tasa_aplicada`, `pagos.tasa_aplicada`,
  `movimientos_caja.tasa_aplicada` y `compras.tasa_cambio`.

### Como se escribe una consulta correcta

```sql
-- CORRECTO: cada venta con su propia tasa congelada
SELECT
  DATE(v.fecha)          AS fecha,
  SUM(v.total_usd)       AS total_usd,
  SUM(v.total_bs)        AS total_bs
FROM ventas v
WHERE v.sucursal_id = ?
  AND v.estado = 'CERRADA'
  AND v.fecha >= ? AND v.fecha < ?
GROUP BY DATE(v.fecha);
```

```sql
-- INCORRECTO: JOIN a la tasa de hoy. BUG CRITICO.
SELECT SUM(v.total_usd * t.tasa) AS total_bs
FROM ventas v
CROSS JOIN (SELECT tasa FROM tasas_cambio WHERE fecha = CURDATE()) t
WHERE ...;
```

Si un reporte de un periodo cerrado **cambia de numero entre dos ejecuciones**
sin que se haya emitido ni anulado ningun documento, hay un bug de snapshot.
Se trata como incidente, no como diferencia de redondeo.

---

## 4. Precios y totales

### Que guarda cada tabla

**`venta_detalle` — todo en USD:**

| Columna | Moneda | Significado |
|---|---|---|
| `precio_compra_unitario` DECIMAL(14,4) | USD | snapshot de costo (Regla A) |
| `precio_venta_unitario` DECIMAL(14,4) | USD | |
| `descuento_unitario` DECIMAL(14,4) | USD | incluye prorrateo del descuento de documento |
| `base_gravable` DECIMAL(14,2) | USD | `(precio_venta - descuento) * cantidad` |
| `costo_total` DECIMAL(14,2) | USD | `precio_compra_unitario * cantidad` |
| `utilidad_unitaria` DECIMAL(14,4) | USD | `(precio_venta - descuento) - precio_compra` |
| `utilidad_total` DECIMAL(14,2) | USD | `utilidad_unitaria * cantidad` |
| `total_linea` DECIMAL(14,2) | USD | `base_gravable + impuesto_monto` |

**El renglon NO guarda montos en Bs.** El Bs del renglon, si un ticket lo
necesita, se deriva de `total_linea * ventas.tasa_cambio`. Guardar Bs por renglon
solo introduce descuadres de redondeo entre la suma de renglones y el total.

**`ventas` — cabecera:**

| Columna | Moneda |
|---|---|
| `subtotal_bruto`, `descuento_lineas`, `descuento_documento`, `base_gravable`, `impuesto_total`, `redondeo`, `costo_total`, `utilidad_total`, `total_pagado`, `total_credito` | USD |
| `total_usd` DECIMAL(14,2) | USD — total definitivo del documento |
| `tasa_cambio` DECIMAL(18,6) | tasa congelada |
| `total_bs` DECIMAL(18,2) | `ROUND(total_usd * tasa_cambio, 2)` congelado |
| `redondeo_bs` DECIMAL(18,2) | diferencia por redondeo del monto en Bs |

### Regla de redondeo

El redondeo del monto en Bs **se hace UNA VEZ, al confirmar la venta, y se guarda**.
No se recalcula al vuelo en cada consulta.

```
total_bs = ROUND(total_usd * tasa_cambio, 2)   // half-up, 2 decimales
```

Se redondea **el total del documento**, nunca los renglones. Redondear renglon a
renglon distorsiona la base gravable y hace que la suma de renglones no coincida
con el total.

**Ejemplo de redondeo:**

```
total_usd    =    7,33
tasa_cambio  =   36,456700
producto     = 7,33 * 36,4567 = 267,2275... (crudo)
total_bs     =  267,23   ← guardado
redondeo_bs  =   +0,0024 -> se guarda 0,00 tras cuantizar; el delta vive en total_bs
```

Si en el futuro el negocio decide redondear el efectivo en Bs a multiplos
(por ejemplo Bs 5), el multiplo vive en `configuracion.redondeo_bs_multiplo` y la
diferencia se registra en `redondeo_bs`, exactamente como `ventas.redondeo` hace
con el total en USD.

---

## 5. Metodos de pago — cada uno tiene su moneda

### Columnas nuevas en `metodos_pago`

| Columna | Tipo | Significado |
|---|---|---|
| `moneda` | ENUM('USD','VES') NOT NULL | en que moneda entra el dinero |
| `requiere_referencia` | TINYINT(1) NOT NULL DEFAULT 0 | si es 1, `pagos.referencia` es obligatoria |
| `afecta_caja_efectivo` | TINYINT(1) NOT NULL DEFAULT 0 | si es 1, entra al arqueo fisico de caja |

`afecta_caja_efectivo` reemplaza al antiguo `es_afecta_caja` y es mas preciso:
un Pago Movil **si es dinero cobrado**, pero **no es efectivo en el cajon**, asi
que no participa del conteo de billetes.

### Catalogo a sembrar

| codigo | nombre | tipo | moneda | requiere_referencia | afecta_caja_efectivo |
|---|---|---|---|---|---|
| `EFECTIVO_BS` | Efectivo Bs | EFECTIVO | VES | 0 | **1** |
| `EFECTIVO_USD` | Efectivo USD | EFECTIVO | USD | 0 | **1** |
| `PAGO_MOVIL` | Pago Movil | PAGO_MOVIL | VES | **1** | 0 |
| `TRANSFERENCIA` | Transferencia | TRANSFERENCIA | VES | **1** | 0 |
| `PUNTO_VENTA` | Punto de venta | TARJETA_DEBITO | VES | **1** | 0 |
| `ZELLE` | Zelle | TRANSFERENCIA | USD | **1** | 0 |
| `BINANCE` | Binance / USDT | CRIPTO | USD | **1** | 0 |
| `CREDITO` | Credito | CREDITO | USD | 0 | 0 |

Notas:

- **Credito no es un cobro.** Genera una cuenta por cobrar en `creditos`; no entra
  a caja ni a recaudo del turno.
- Agregar un metodo nuevo (otra billetera, otro banco) es un `INSERT`, no una
  migracion.
- La validacion de `requiere_referencia` se hace en el **service**, dentro de la
  transaccion de la venta, con error `REFERENCIA_REQUERIDA`.

---

## 6. Pago mixto entre monedas

### Que guarda `pagos`

| Columna | Tipo | Significado |
|---|---|---|
| `metodo_pago_id` | FK | |
| `moneda` | ENUM('USD','VES') | snapshot de la moneda del metodo |
| `monto_moneda` | DECIMAL(18,4) | lo que el cliente entrego **en ESA moneda** |
| `tasa_aplicada` | DECIMAL(18,6) | igual a `ventas.tasa_cambio` |
| `monto_usd` | DECIMAL(14,2) | equivalente en USD, es lo que suma contra el total |
| `monto_recibido_moneda` | DECIMAL(18,4) NULL | billete entregado (solo efectivo) |
| `cambio_moneda` | DECIMAL(18,4) NULL | vueltas entregadas |
| `cambio_moneda_codigo` | ENUM('USD','VES') NULL | en que moneda se dieron las vueltas |
| `referencia` | VARCHAR(60) NULL | obligatoria si el metodo la exige |

**Invariante validado dentro de la transaccion:**

```
SUM(pagos.monto_usd) + ventas.total_credito = ventas.total_usd
```

Tolerancia: `0,01 USD`. Cualquier desviacion mayor aborta la transaccion con
`PAGO_NO_CUADRA`.

Conversion, siempre en la misma direccion:

```
monto_usd = ROUND(monto_moneda / tasa_aplicada, 2)   si moneda = 'VES'
monto_usd = monto_moneda                             si moneda = 'USD'
```

### EJEMPLO COMPLETO — venta de $10,00 con tasa 36,50

**Contexto**

```
Fecha:            19/07/2026
tasas_cambio:     fecha=2026-07-19, tasa=36,500000
Venta:            2 unidades de un producto a $5,00 c/u
```

**Renglon (`venta_detalle`), todo en USD**

| campo | valor |
|---|---|
| cantidad | 2,000 |
| precio_compra_unitario | 3,2000 USD ← snapshot de costo |
| precio_venta_unitario | 5,0000 USD |
| descuento_unitario | 0,0000 USD |
| base_gravable | 10,00 USD |
| costo_total | 6,40 USD |
| utilidad_unitaria | 1,8000 USD |
| utilidad_total | 3,60 USD |
| total_linea | 10,00 USD |

**Cabecera (`ventas`)**

| campo | valor |
|---|---|
| `total_usd` | **10,00** |
| `tasa_cambio` | **36,500000** |
| `total_bs` | `ROUND(10,00 * 36,50 ; 2)` = **365,00** |
| `costo_total` | 6,40 USD |
| `utilidad_total` | 3,60 USD |

**Lo que ve el cajero en el POS**

```
┌─────────────────────────────────────────────┐
│  TOTAL      $ 10,00      /     Bs 365,00    │
│  Tasa del dia: 36,50                        │
├─────────────────────────────────────────────┤
│  Pago Movil (Bs)      Bs 182,50   ref 004417│
│  Efectivo USD         $  10,00              │
├─────────────────────────────────────────────┤
│  Cubierto             $ 10,00  / Bs 365,00  │
│  Faltante             $  0,00  / Bs   0,00  │
│  VUELTAS              $  5,00  / Bs 182,50  │
└─────────────────────────────────────────────┘
```

**Filas de `pagos` que se insertan**

| # | metodo | moneda | monto_moneda | tasa_aplicada | monto_usd | recibido | cambio | cambio_moneda | referencia |
|---|---|---|---|---|---|---|---|---|---|
| 1 | PAGO_MOVIL | VES | 182,5000 | 36,500000 | **5,00** | — | — | — | `004417` |
| 2 | EFECTIVO_USD | USD | 5,0000 | 36,500000 | **5,00** | 10,0000 | 5,0000 | VES | — |

**Cifra por cifra**

```
Total de la venta                     $ 10,00        Bs 365,00

Linea 1 — Pago Movil en bolivares
  El cliente transfiere               Bs 182,50
  monto_usd = 182,50 / 36,50        =  $  5,00
  Faltante tras la linea 1          =  $  5,00       Bs 182,50

Linea 2 — Efectivo en dolares
  El cliente entrega un billete de     $ 10,00
  Aplicado a la venta                =  $  5,00      (monto_moneda = 5,0000)
  monto_usd                          =  $  5,00
  Faltante tras la linea 2           =  $  0,00      Bs   0,00

Vueltas
  Sobrante                           =  $  5,00
  Se entregan en bolivares           =  5,00 * 36,50 = Bs 182,50
  (o, a eleccion del cliente, un billete de $5)

Validacion en la transaccion
  SUM(pagos.monto_usd) = 5,00 + 5,00 = 10,00  ==  ventas.total_usd = 10,00   OK
```

**Impacto en caja (`movimientos_caja`)**

| tipo | moneda | monto_moneda | tasa_aplicada | monto_usd | signo |
|---|---|---|---|---|---|
| VENTA | USD | 10,0000 | 36,500000 | 10,00 | +1 |
| VENTA (vuelto) | VES | 182,5000 | 36,500000 | 5,00 | -1 |

El Pago Movil **no genera movimiento de caja de efectivo** porque
`afecta_caja_efectivo = 0`. Aparece en el recaudo del turno por metodo, pero no en
el conteo de billetes.

Notese el efecto real: **entraron $10 en efectivo y salieron Bs 182,50**. Esto es
exactamente lo que pasa en el mostrador venezolano y es la razon por la que las
dos monedas se cuentan por separado (seccion 8).

### Variante: vueltas en la misma moneda

Si el cliente prefiere las vueltas en dolares, la linea 2 queda
`cambio_moneda = 5,0000`, `cambio_moneda_codigo = 'USD'`, y el movimiento de caja
negativo es en USD por 5,00. El total de la venta no cambia en absoluto.

### Regla de conversion de vueltas

Las vueltas se calculan **siempre con `ventas.tasa_cambio`**, nunca con la tasa
de otro dia ni con una tasa "de vuelto" distinta. Si el negocio quisiera un
diferencial para las vueltas, seria un descuento explicito en el documento, no
una tasa oculta.

---

## 7. Creditos en USD

### Regla

- La deuda del cliente se guarda en **USD**: `creditos.saldo_usd`,
  `creditos.monto_original_usd`, `clientes.saldo_actual` (USD),
  `clientes.cupo_credito` (USD).
- El abono se registra **en la moneda que el cliente pago**, con la **tasa del dia
  del abono**, y se convierte a USD para descontar del saldo.
- `abonos` guarda: `moneda`, `monto_moneda`, `tasa_aplicada`, `monto_usd`.
- `abono_aplicaciones` reparte en USD (`monto_usd`, `saldo_anterior_usd`,
  `saldo_posterior_usd`), en orden FIFO por `fecha_vencimiento` y luego `id`.
- El estado de cuenta muestra el saldo en USD **y** su equivalente en Bs a la
  tasa de **hoy** — porque un saldo pendiente es una obligacion viva, no un
  documento cerrado.

> Matiz importante: el saldo pendiente **si** se muestra convertido a la tasa de
> hoy (es lo que el cliente debe pagar hoy). Lo que jamas se recalcula con la
> tasa de hoy es el **historico de documentos cerrados** (ventas, abonos ya
> aplicados, reportes de periodos pasados).

### POR QUE la deuda se guarda en USD — ejemplo con devaluacion a 3 meses

**Escenario**

```
01/04/2026   Maria compra a credito por $ 100,00
             Tasa de ese dia: 36,50  ->  Bs 3.650,00
01/07/2026   Maria viene a pagar. Tasa de ese dia: 52,00
```

**Caso A — la deuda se guarda en USD (CORRECTO)**

```
creditos.monto_original_usd = 100,00
creditos.saldo_usd          = 100,00

01/07/2026, Maria paga:
  Debe                    $ 100,00
  Equivalente hoy         100,00 * 52,00 = Bs 5.200,00
  Paga Bs 5.200,00 en Pago Movil
  abonos.moneda           = 'VES'
  abonos.monto_moneda     = 5.200,0000
  abonos.tasa_aplicada    = 52,000000
  abonos.monto_usd        = 5.200,00 / 52,00 = 100,00
  saldo_usd               = 100,00 - 100,00 = 0,00   ->  estado PAGADO

El negocio recupera exactamente el valor que presto: $ 100,00.
```

**Caso B — la deuda se guarda en Bs (INCORRECTO)**

```
credito.saldo_bs = 3.650,00   (congelado el 01/04)

01/07/2026, Maria paga:
  Debe Bs 3.650,00 (el numero no cambio)
  Paga Bs 3.650,00
  Valor real de lo cobrado: 3.650,00 / 52,00 = $ 70,19

PERDIDA DEL NEGOCIO:  $ 100,00 - $ 70,19 = $ 29,81   (29,81 %)
```

**Comparativa lado a lado**

| | Deuda en USD (correcto) | Deuda en Bs (incorrecto) |
|---|---|---|
| Deuda registrada 01/04 | $ 100,00 | Bs 3.650,00 |
| Tasa 01/04 | 36,50 | 36,50 |
| Tasa 01/07 | 52,00 | 52,00 |
| Bs a cobrar el 01/07 | **Bs 5.200,00** | Bs 3.650,00 |
| Valor real cobrado | **$ 100,00** | **$ 70,19** |
| Perdida por devaluacion | **$ 0,00** | **$ 29,81 (-29,81 %)** |

**La deuda en bolivares se licua sola.** El cliente no hace nada malo, el cajero
no se equivoca, el sistema no falla: simplemente el negocio regala el 29,81 % de
su cartera cada tres meses. Con una cartera de $ 5.000 eso son **$ 1.490
perdidos por trimestre**, sin que ningun reporte lo muestre como perdida, porque
en bolivares todo "cuadra".

Guardar la deuda en USD es lo unico que hace que fiar no sea una donacion
progresiva.

### Ejemplo de abono parcial con dos tasas distintas

```
01/04/2026  Credito emitido            saldo_usd = 100,00   (tasa emision 36,50)

10/05/2026  Abono en efectivo Bs, tasa del dia 42,00
            monto_moneda   = Bs 1.680,0000
            tasa_aplicada  = 42,000000
            monto_usd      = 1.680,00 / 42,00 = 40,00
            saldo_usd      = 100,00 - 40,00 = 60,00     -> estado PARCIAL

01/07/2026  Abono en efectivo USD, tasa del dia 52,00
            monto_moneda   = $ 60,0000
            tasa_aplicada  = 52,000000
            monto_usd      = 60,00
            saldo_usd      = 60,00 - 60,00 = 0,00       -> estado PAGADO

Total recuperado en USD: 40,00 + 60,00 = 100,00   ✔ exacto
Total en Bs efectivamente recibido: 1.680,00 + (60,00 * 52,00 = 3.120,00)
                                  = Bs 4.800,00
```

El estado de cuenta muestra cada abono con **la tasa con la que se recibio**,
nunca reexpresado a la tasa de hoy.

---

## 8. Caja y arqueo separado por moneda

### Regla

**El efectivo en USD y el efectivo en Bs se cuentan y se cuadran POR SEPARADO.
Nunca se mezclan en un solo total.**

`turnos_caja` lleva las columnas duplicadas por moneda:

| Concepto | USD | Bs |
|---|---|---|
| Base inicial | `base_inicial_usd` | `base_inicial_bs` |
| Ventas en efectivo | `total_ventas_efectivo_usd` | `total_ventas_efectivo_bs` |
| Abonos en efectivo | `total_abonos_efectivo_usd` | `total_abonos_efectivo_bs` |
| Ingresos | `total_ingresos_usd` | `total_ingresos_bs` |
| Egresos | `total_egresos_usd` | `total_egresos_bs` |
| Retiros | `total_retiros_usd` | `total_retiros_bs` |
| Vueltas entregadas | `total_vueltas_usd` | `total_vueltas_bs` |
| **Esperado** | `esperado_usd` | `esperado_bs` |
| **Contado** | `contado_usd` | `contado_bs` |
| **Diferencia** | `diferencia_usd` | `diferencia_bs` |
| Denominaciones | `detalle_denominaciones_usd` JSON | `detalle_denominaciones_bs` JSON |

`total_ventas_otros_usd` acumula el recaudo no-efectivo (Pago Movil, punto,
Zelle, Binance) expresado en USD, para el reporte de recaudo por metodo. **No
participa del arqueo fisico.**

`movimientos_caja` lleva `moneda`, `monto_moneda`, `tasa_aplicada` y `monto_usd`.
El arqueo se hace sumando `monto_moneda` filtrando por `moneda`; `monto_usd`
existe solo para reportes consolidados, **jamas para el cuadre**.

### Formula del arqueo

```
esperado_usd = base_inicial_usd
             + total_ventas_efectivo_usd
             + total_abonos_efectivo_usd
             + total_ingresos_usd
             - total_egresos_usd
             - total_retiros_usd
             - total_vueltas_usd

esperado_bs  = base_inicial_bs
             + total_ventas_efectivo_bs
             + total_abonos_efectivo_bs
             + total_ingresos_bs
             - total_egresos_bs
             - total_retiros_bs
             - total_vueltas_bs

diferencia_usd = contado_usd - esperado_usd
diferencia_bs  = contado_bs  - esperado_bs
```

**No existe** una formula que combine ambas. No hay `diferencia_total`.

### EJEMPLO COMPLETO DE ARQUEO

**Turno del 19/07/2026, Caja 1, tasa del dia 36,50**

Apertura:

```
base_inicial_usd  =   20,00
base_inicial_bs   =  500,00
```

Movimientos del turno (`movimientos_caja`):

| tipo | moneda | monto_moneda | signo | concepto |
|---|---|---|---|---|
| BASE | USD | 20,0000 | +1 | Base inicial |
| BASE | VES | 500,0000 | +1 | Base inicial |
| VENTA | USD | 85,0000 | +1 | Ventas cobradas en efectivo USD |
| VENTA | VES | 3.650,0000 | +1 | Ventas cobradas en efectivo Bs |
| VENTA | VES | 182,5000 | **-1** | Vueltas entregadas en Bs |
| ABONO | VES | 400,0000 | +1 | Abono de cliente en efectivo Bs |
| EGRESO | VES | 200,0000 | -1 | Compra de bolsas |
| RETIRO | USD | 50,0000 | -1 | Retiro a caja fuerte |

Ademas, recaudo NO efectivo del turno (no entra al arqueo):

```
Pago Movil        Bs 2.190,00   -> monto_usd  60,00
Zelle             $   45,00     -> monto_usd  45,00
total_ventas_otros_usd = 105,00
```

**Calculo del esperado**

```
esperado_usd = 20,00 + 85,00 + 0,00 + 0,00 - 0,00 - 50,00 - 0,00
             = 55,00

esperado_bs  = 500,00 + 3.650,00 + 400,00 + 0,00 - 200,00 - 0,00 - 182,50
             = 4.167,50
```

**Conteo por denominacion al cierre**

`detalle_denominaciones_usd`:

| Denominacion | Cantidad | Subtotal |
|---|---|---|
| $ 20 | 1 | 20,00 |
| $ 10 | 2 | 20,00 |
| $ 5 | 2 | 10,00 |
| $ 1 | 5 | 5,00 |
| **contado_usd** | | **55,00** |

`detalle_denominaciones_bs`:

| Denominacion | Cantidad | Subtotal |
|---|---|---|
| Bs 200 | 15 | 3.000,00 |
| Bs 100 | 8 | 800,00 |
| Bs 50 | 5 | 250,00 |
| Bs 20 | 4 | 80,00 |
| Bs 10 | 3 | 30,00 |
| **contado_bs** | | **4.160,00** |

**Resultado del arqueo**

| | USD | Bs |
|---|---|---|
| Esperado | 55,00 | 4.167,50 |
| Contado | 55,00 | 4.160,00 |
| **Diferencia** | **0,00** ✔ | **-7,50** ✘ |

**Lectura correcta:** el dolar cuadra perfecto; **faltan Bs 7,50** en el cajon.
Se investiga esa caja, ese cajero, ese turno.

**Lectura INCORRECTA que el sistema debe hacer imposible:**

```
"Convierto todo a USD:
   esperado = 55,00 + 4.167,50/36,50 = 55,00 + 114,18 = 169,18
   contado  = 55,00 + 4.160,00/36,50 = 55,00 + 113,97 = 168,97
   diferencia = -0,21 USD -> 'es redondeo, esta bien'"
```

Ese razonamiento **destruye la señal**. Un faltante real de Bs 7,50 se disfraza de
ruido de conversion, y peor: un faltante de $20 se podria compensar con un
sobrante de Bs 730 y el total daria cero. El sistema no ofrece ese numero en
ninguna pantalla ni en ningun reporte.

**Estado del turno**

```
diferencia_usd = 0,00  y  diferencia_bs = 0,00  -> estado 'CUADRADO'
cualquier otra combinacion                      -> estado 'CERRADO' con diferencia
```

---

## 9. Reportes en las dos monedas, lado a lado

### Regla

- Todo reporte de dinero muestra **columna USD y columna Bs**.
- El USD sale directo de las columnas en USD (`total_usd`, `utilidad_total`,
  `costo_total`).
- El Bs sale de la tasa **congelada de cada venta**, no de la de hoy.
- El total en Bs de un periodo es la **SUMA de los Bs de cada venta**
  (cada una con su tasa), **no** el total en USD multiplicado por la tasa de hoy.

### POR QUE el reporte de marzo NO puede recalcularse con la tasa de hoy

**Datos reales de marzo de 2026**

| Fecha | Venta | `total_usd` | `tasa_cambio` (congelada) | `total_bs` (congelado) |
|---|---|---|---|---|
| 05/03/2026 | V-0141 | 120,00 | 36,200000 | 4.344,00 |
| 15/03/2026 | V-0163 | 80,00 | 38,900000 | 3.112,00 |
| 27/03/2026 | V-0189 | 200,00 | 41,500000 | 8.300,00 |
| | **TOTAL** | **400,00** | | **15.756,00** |

Tasa de hoy (19/07/2026): **52,00**

**Lado a lado**

| | Metodo CORRECTO (snapshot) | Metodo INCORRECTO (tasa de hoy) |
|---|---|---|
| Formula | `SUM(ventas.total_bs)` | `SUM(ventas.total_usd) * tasa_hoy` |
| Calculo | `4.344,00 + 3.112,00 + 8.300,00` | `400,00 * 52,00` |
| **Ventas de marzo en Bs** | **Bs 15.756,00** | **Bs 20.800,00** |
| Diferencia absoluta | — | **+ Bs 5.044,00** |
| Diferencia relativa | — | **+ 32,01 %** |
| Tasa implicita del periodo | 39,39 (real, ponderada) | 52,00 (inventada) |

**Por que el segundo numero es falso**

1. **Nunca entraron Bs 20.800,00 a la caja.** Entraron Bs 15.756,00. El reporte
   afirma un ingreso que no existio.
2. **El numero es inestable.** Manana, con tasa 54,00, el mismo reporte de marzo
   diria Bs 21.600,00. Un periodo cerrado que cambia de valor cada dia no es un
   reporte, es una alucinacion.
3. **Rompe la conciliacion bancaria.** Los Bs que el banco muestra recibidos en
   marzo son 15.756,00. Nunca cuadrara con un sistema que dice 20.800,00.
4. **Rompe el arqueo historico.** El cierre del turno del 05/03 registro
   Bs 4.344,00. Un reporte que reexpresa esa venta a 52,00 diria Bs 6.240,00 y
   contradice un documento firmado.
5. **Falsea el crecimiento.** Comparar marzo (reexpresado) contra abril
   (reexpresado) mide la devaluacion, no las ventas. Un mes con 30 % menos
   unidades vendidas puede aparecer como un mes de crecimiento del 15 %.

**Regla operativa**

```sql
-- ASI, siempre
SELECT SUM(total_usd) AS usd, SUM(total_bs) AS bs
FROM ventas
WHERE estado='CERRADA' AND fecha >= '2026-03-01' AND fecha < '2026-04-01';
```

Cualquier expresion de la forma `total_usd * (SELECT tasa FROM tasas_cambio WHERE
fecha = CURDATE())` dentro de un reporte historico es un bug y debe fallar en
revision de codigo.

### Reporte de utilidad — recordatorio de la Regla A

La utilidad tambien es historica y tambien es en USD:

```sql
SELECT
  vd.categoria_id,
  SUM(vd.base_gravable)  AS venta_usd,
  SUM(vd.costo_total)    AS costo_usd,
  SUM(vd.utilidad_total) AS utilidad_usd
FROM venta_detalle vd
JOIN ventas v ON v.id = vd.venta_id
WHERE v.estado='CERRADA' AND v.fecha >= ? AND v.fecha < ?
GROUP BY vd.categoria_id;
```

**Sin `JOIN productos`.** El costo ya esta congelado en el renglon.
Para la columna en Bs se usa `v.tasa_cambio` renglon a renglon:

```sql
SUM(vd.utilidad_total * v.tasa_cambio) AS utilidad_bs
```

`resumen_ventas_diario` replica el patron: guarda `venta_neta_usd`,
`costo_total_usd`, `utilidad_total_usd` **y** `venta_neta_bs`, `costo_total_bs`,
`utilidad_total_bs`, todos derivados del snapshot, mas `tasa_promedio_ponderada`
del dia (informativa).

---

## 10. Configuracion

Columnas en la tabla `configuracion` (fila unica):

| Columna | Tipo | Valor por defecto |
|---|---|---|
| `moneda_base` | CHAR(3) | `'USD'` |
| `moneda_secundaria` | CHAR(3) | `'VES'` |
| `moneda_base_simbolo` | VARCHAR(5) | `'$'` |
| `moneda_secundaria_simbolo` | VARCHAR(5) | `'Bs'` |
| `decimales_usd` | TINYINT UNSIGNED | `2` |
| `decimales_bs` | TINYINT UNSIGNED | `2` |
| `es_ticket_muestra_ambas_monedas` | TINYINT(1) | `1` |
| `es_ticket_muestra_tasa` | TINYINT(1) | `1` |
| `es_bloquea_venta_sin_tasa` | TINYINT(1) | `1` |
| `redondeo_bs_multiplo` | DECIMAL(10,2) | `0.00` (sin redondeo) |
| `zona_horaria` | VARCHAR(40) | `'America/Caracas'` |

`moneda_base` y `moneda_secundaria` **no son editables desde la interfaz** en la
Fase 1: cambiar la moneda base implicaria reexpresar todo el historico. Existen
como columnas para que el codigo no lleve `'USD'` embebido en cincuenta lugares.

---

## 11. Interfaz

### Reglas de presentacion

1. **La tasa vigente esta SIEMPRE visible**: barra superior de la aplicacion y
   encabezado del POS. Si no hay tasa del dia, la barra se pinta en rojo con un
   boton directo para registrarla y el boton de cobrar queda deshabilitado.
2. **El POS muestra SIEMPRE el total en $ y en Bs simultaneamente**, mas la tasa
   aplicada. En cada linea de pago se recalcula en vivo el faltante y las vueltas,
   en ambas monedas.
3. **Los precios de producto se capturan en USD**, con el equivalente en Bs como
   ayuda visual de solo lectura.
4. **El ticket imprime el total en ambas monedas y la tasa aplicada** (la de la
   venta, no la de hoy — un ticket reimpreso en agosto muestra la tasa de marzo).
5. **Componente `MoneyDual`**: muestra el par de forma consistente en todo el
   sistema.

### Componente `MoneyDual`

```tsx
// src/components/moneda/MoneyDual.tsx
type Props = {
  usd: string;              // string, jamas number: el dinero no pasa por float
  tasa: string;             // tasa CONGELADA del documento, o la vigente si es en vivo
  orientacion?: 'horizontal' | 'vertical';
  tamano?: 'sm' | 'md' | 'lg';
  destacar?: 'usd' | 'bs' | 'ambas';
};
```

Salida canonica:

```
$ 2,50  /  Bs 91,25
```

Reglas del formato:

- Separador decimal **coma**, separador de miles **punto** (locale `es-VE`).
- USD siempre con el simbolo `$` delante; Bs siempre con `Bs` delante.
- `MoneyDual` **nunca** consulta la tasa por su cuenta: la recibe por props. Esto
  hace estructuralmente imposible que un componente de historico se pinte con la
  tasa de hoy.
- Para documentos historicos el padre pasa `venta.tasa_cambio`.
  Para pantallas en vivo (POS, catalogo, saldo pendiente) pasa la tasa vigente.

### Ticket

```
        GOCHITO SYSTEM
     Venta N° 0000189
   27/03/2026  14:32
─────────────────────────
2 x Producto A
        $ 5,00   $ 10,00
─────────────────────────
TOTAL            $  10,00
TOTAL            Bs 365,00
Tasa aplicada:      36,50
─────────────────────────
Pago Movil       Bs 182,50
  Ref: 004417
Efectivo USD     $   5,00
Vuelto           Bs 182,50
─────────────────────────
```

---

## Apendice A — Errores de negocio del modulo bimonetario

| Codigo | HTTP | Cuando |
|---|---|---|
| `SIN_TASA_DEL_DIA` | 409 | No hay tasa registrada para la fecha de la operacion |
| `TASA_YA_REGISTRADA` | 409 | Ya existe tasa activa para esa fecha (usar corregir) |
| `TASA_INVALIDA` | 400 | Tasa <= 0, o fuera del rango de variacion permitido |
| `REFERENCIA_REQUERIDA` | 400 | El metodo de pago exige referencia y no vino |
| `PAGO_NO_CUADRA` | 409 | `SUM(pagos.monto_usd) + total_credito != total_usd` |
| `MONEDA_NO_COINCIDE` | 400 | `pagos.moneda` distinta de `metodos_pago.moneda` |
| `ARQUEO_INCOMPLETO` | 400 | Se intento cerrar el turno sin contar una de las dos monedas |

---

## Apendice B — Checklist de revision de codigo

Antes de aprobar cualquier PR que toque dinero:

- [ ] ¿Algun `SELECT` de reporte historico multiplica por la tasa de hoy? → **rechazar**
- [ ] ¿Algun reporte de utilidad hace `JOIN productos` para tomar el costo? → **rechazar**
- [ ] ¿Algun total en Bs se recalcula al vuelo en vez de leer `total_bs`? → **rechazar**
- [ ] ¿Algun arqueo suma USD y Bs en un solo numero? → **rechazar**
- [ ] ¿Algun saldo de credito se guarda o se compara en Bs? → **rechazar**
- [ ] ¿Se uso `number` de JavaScript para un monto en vez de string/DECIMAL? → **rechazar**
- [ ] ¿La creacion de venta valida que exista tasa del dia antes de abrir la transaccion? → debe ser **si**
- [ ] ¿`pagos.tasa_aplicada` se copia de `ventas.tasa_cambio` y no se relee? → debe ser **si**
- [ ] ¿`MoneyDual` recibe la tasa por props en vez de consultarla? → debe ser **si**
