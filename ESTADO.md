# GochitoSystem — Estado del proyecto

**Negocio:** Mini Market Los Gochitos (Charcutería · Panadería · Víveres) — Venezuela
**Última actualización:** 20 de julio de 2026
**Estado general:** base de datos lista + núcleo del backend FUNCIONANDO y verificado.

---

## ✅ Funcionando y verificado de verdad

### Base de datos (MariaDB 10.6, puerto 3307, visible en DBeaver)
- **43 tablas**, 113 llaves foráneas, esquema bimonetario USD/Bs aplicado.
- Seed real de Los Gochitos: admin, 4 roles, 67 permisos, 8 métodos de pago,
  impuestos de Venezuela, 6 categorías, 25 productos con stock, tasa del día.
- `database/schema.sql` y `database/seed.sql` corren sin errores y son reejecutables.

### Backend (Node + Express 5 + mysql2, TypeScript strict — COMPILA LIMPIO)
Cimientos completos: pool con transacciones y reintiento por deadlock, aritmética
monetaria en bigint (cero float), conversión USD↔Bs, JWT + refresh rotativo,
RBAC por permisos, validación Zod, idempotencia, manejo de errores con traducción
de códigos de MariaDB, logs estructurados.

**Módulos terminados:** auth, tasas-cambio, productos, caja/turnos, POS/ventas.

**Flujo de venta probado end-to-end contra la base real:**
1. Login del admin → token JWT.
2. Tasa del día (36.50) con equivalente en Bs calculado.
3. Abrir turno de caja (base USD y Bs por separado).
4. Venta de 2 productos con **pago mixto**: $5 efectivo USD + 150 Bs pago móvil.
   - Total $8.90 / Bs 324.85, vuelto $0.21, utilidad $1.20 — todo cuadra.
5. **Snapshot de costo** verificado: se subió el costo del queso de $5 a $6 y la
   utilidad de la venta ya registrada NO cambió.
6. **Snapshot de tasa** verificado: la venta guardó tasa 36.50 y total_bs congelados.
7. Stock descontado y ledger de inventario con saldo corrido.

---

## ✅ Módulos completados después (20-jul)

### Backend (todo compila limpio, verificado contra la base)
- **clientes** (CRUD) · **entrada de mercancía** (recalcula costo promedio ponderado,
  verificado: 60×0.90 + 40×1.20 = 1.02) · **créditos y abonos** (aplicación FIFO,
  verificado: abono en Bs → USD aplicado a factura más antigua)
- **inventario** (existencias valorizadas, kardex, reconciliación stock vs ledger, ajustes)
- **reportes** (más/menos vendidos, sin movimiento, stock bajo, clientes:
  compradores/gasto/deuda, movimientos) + **dashboard** agregado
- **configuración** del negocio · **catálogos** (categorías CRUD, métodos de pago,
  impuestos, unidades)

### Frontend (todo compila y hace build)
Pantallas nuevas conectadas al backend real: Clientes, Créditos (cartera + abono),
Entrada de mercancía, Existencias, Reportes (con export a Excel), Caja
(abrir/cerrar con arqueo por moneda), Configuración.

### Decisión del negocio (20-jul)
Los Gochitos ingresa el stock MANUALMENTE, no maneja compras formales a proveedores.
Por eso: se quitó el módulo Proveedores de la UI y "Compras" pasó a ser
"Entrada de mercancía" (producto + cantidad + costo, sin proveedor).

## ✅ Rematado (20-jul, tercera tanda)
- **Anular venta** desde la UI (backend + botón en Ventas): reingresa stock y
  revierte crédito. Verificado: stock 60→55 (venta) →60 (anulada).
- **Ticket imprimible** 80mm: se imprime automáticamente al cobrar; sirve para
  impresora térmica o "Guardar como PDF".
- **Exportar reportes a PDF** (además del Excel que ya estaba).
- Se quitó **Usuarios** de la UI: el dueño administra los usuarios (todos admin).

## Estado: sistema COMPLETO para operar
El sistema cubre el ciclo completo del negocio: vender (POS bimonetario con ticket),
ingresar mercancía (costo promedio), fiar y cobrar (créditos FIFO), caja con arqueo
por moneda, inventario con reconciliación, y reportes exportables a Excel y PDF.

Extras opcionales a futuro (no bloquean la operación): devoluciones parciales,
impresión térmica nativa (hoy usa el diálogo del navegador), multi-sucursal.

### Frontend — núcleo USABLE construido y funcionando ✅
Alineado a USD/Bs y conectado al backend real. Compila y hace build limpio.
Pantallas terminadas y funcionando en el navegador:
- **Login** (admin / Admin123!)
- **Dashboard** con KPIs y últimas ventas
- **POS** completo: scanner, carrito, atajos (F2/F9/Esc), modal de cobro con
  pago mixto USD/Bs, vueltas, bloqueo si no hay tasa
- **Tasa del día**: registrar y ver historial
- **Productos**: listado con precio USD/Bs y stock bajo
- **Ventas**: historial con utilidad
- Layout con sidebar por permisos, tasa visible arriba, toasts, modo oscuro

Pantallas con placeholder "En construcción" (falta su backend): clientes,
proveedores, compras, inventario, créditos, caja, reportes, usuarios, configuración.

### Cómo abrir el sistema
```powershell
# Terminal 1 - backend
cd backend; npm run dev
# Terminal 2 - frontend
cd frontend; npm run dev
# Abrir el navegador en: http://localhost:5173
# Entrar con: admin / Admin123!
```

---

## Cómo arrancar lo que ya funciona

```powershell
# 1. Docker y base (si están apagados)
docker start mariadb-10-6

# 2. Backend
cd c:\Users\Alkosto\Desktop\proye\RoyerProyects\gochitosystem\backend
npm install       # solo la primera vez
npm run dev       # arranca en http://localhost:4000

# 3. Probar (en otra terminal)
#    GET  http://localhost:4000/api/v1/salud
#    POST http://localhost:4000/api/v1/auth/login
#         body: {"identificador":"admin","password":"Admin123!"}
```

Reaplicar la base desde cero:
```powershell
Get-Content database\schema.sql -Raw | docker exec -i mariadb-10-6 mariadb -uroot -p1234 gochitosystem
Get-Content database\seed.sql   -Raw | docker exec -i mariadb-10-6 mariadb -uroot -p1234 gochitosystem
```

---

## Credenciales y conexión

| | |
|---|---|
| Base MariaDB | localhost:3307 / gochitosystem |
| Usuario app | gochito / qzemcSN3VDXA4auzthXQ4KfUAuQb |
| Root | root / 1234 |
| Admin del sistema | admin / Admin123! |

---

## Decisiones cerradas (no re-discutir)

1. Precios en USD; el sistema calcula Bs con la tasa del día registrada a mano.
2. Sin tasa del día → no se puede vender (SIN_TASA_DEL_DIA).
3. Doble snapshot: costo (venta_detalle) y tasa (ventas). Nunca se recalculan.
4. Pagos: efectivo Bs/USD, pago móvil/transferencia Bs, Zelle/Binance USD, crédito.
5. Deuda de clientes en USD. Caja: USD y Bs se arquean por separado.
6. Reportes con columna USD y columna Bs.
7. IVA 16%, cédula/RIF, zona horaria America/Caracas.
8. Stack: Node + TS + Express 5 + mysql2 (sin ORM) / React 19 + Vite + Tailwind.

## Por qué NO se usaron subagentes al final
Los dos workflows masivos fallaron (límite de uso y agentes congelados esperando
permisos). El núcleo actual se construyó a mano, archivo por archivo, con cada
pieza verificada contra la base real. Es lento pero es lo que quedó funcionando.
