# Onboarding de Prisma en GochitoSystem

La BD de **producción tiene datos**, así que Prisma se adopta por **introspección**
(la BD es la fuente de verdad), no escribiendo el schema a mano. Esto evita que
`prisma migrate` genere `ALTER`/`DROP` destructivos para "cuadrar" la base.

Todos estos pasos se corren **en el VPS** (donde vive el Postgres), en la carpeta
`backend/`.

## 0. Variable de conexión

Prisma usa `DATABASE_URL`. Agrégala al `.env` (raíz del repo):

```dotenv
DATABASE_URL=postgresql://gochito:gochito_2026_s3cur3@localhost:5432/gochitosystem
```

> En el contenedor del backend el host es `host.docker.internal`; para correr los
> comandos de Prisma desde el **host del VPS**, usa `localhost`.

## 1. Instalar dependencias

```bash
cd backend
npm install            # instala prisma y @prisma/client (ya están en package.json)
```

## 2. Introspección: llenar el schema desde la BD real

```bash
npx prisma db pull
```

Esto reescribe `backend/prisma/schema.prisma` con **todos** los modelos, enums,
índices y relaciones exactamente como están en la BD. Revísalo y **haz commit**.

## 3. Baseline: registrar el estado actual como migración inicial

Así Prisma no intenta recrear lo que ya existe:

```bash
mkdir -p prisma/migrations/0_init
npx prisma migrate diff \
  --from-empty \
  --to-schema-datamodel prisma/schema.prisma \
  --script > prisma/migrations/0_init/migration.sql

npx prisma migrate resolve --applied 0_init
```

## 4. Generar el cliente tipado

```bash
npx prisma generate
```

## 5. Commit y avísame

Haz `git commit` y `git push` del `schema.prisma` y la carpeta `prisma/migrations`.
Con el schema real ya introspectado, **convierto el código endpoint por endpoint a
Prisma Client** con tipos correctos y verificables.

---

## ⚠️ Onboarding en el VPS — ORDEN EXACTO (hazlo UNA vez, antes del próximo deploy)

El contenedor ya está configurado para correr `prisma migrate deploy` al arrancar
(ver `backend/Dockerfile`) y el migrador SQL propio quedó apagado
(`EJECUTAR_MIGRACIONES=false`). Pero la BD de prod **ya tiene el esquema**, así que
primero hay que registrar un *baseline*, o `migrate deploy` intentaría recrear todo.

Corre esto en el VPS, en `backend/`, con `DATABASE_URL` apuntando a la BD real:

```bash
cd backend
npm install                       # instala prisma + @prisma/client

# 1. Introspección: llena prisma/schema.prisma desde la BD real (estado ACTUAL:
#    columnas todavía en `timestamp`, contadores como estén).
npx prisma db pull

# 2. Baseline: genera la migración inicial con el estado actual...
mkdir -p prisma/migrations/0_init
npx prisma migrate diff \
  --from-empty \
  --to-schema-datamodel prisma/schema.prisma \
  --script > prisma/migrations/0_init/migration.sql

# 3. ...y márcala como YA aplicada (no la ejecuta: el esquema ya existe).
npx prisma migrate resolve --applied 0_init

# 4. Aplica las migraciones pendientes. La primera es `20260723090000_timestamptz`
#    (ya está en el repo): convierte todo a timestamptz y arregla la hora.
npx prisma migrate deploy

# 5. Refresca el schema introspectado (ahora ya en timestamptz) y haz commit.
npx prisma db pull
git add prisma/ && git commit -m "prisma: baseline + timestamptz" && git push
```

> Importante: el `0_init/migration.sql` se genera **en el VPS** (refleja tus ~100
> tablas reales). No lo escribo yo a mano para no arriesgar un desajuste con la BD.

Después de esto, cada deploy del contenedor aplica solo lo pendiente con Prisma.

## Flujo de cambios futuros (una vez adoptado)

- Editas `prisma/schema.prisma`.
- `npx prisma migrate dev --name descripcion` (local) → crea la migración.
- En prod: el arranque del contenedor corre `prisma migrate deploy` automáticamente.

## Qué queda en SQL crudo (a propósito)

Prisma no expresa todo; estos casos van con `prisma.$queryRaw` / SQL de migración:

- **`FOR UPDATE` / `FOR UPDATE OF`** (bloqueo de fila del POS: consecutivos, stock).
- **Índices únicos parciales** (`WHERE eliminado_en IS NULL`).
- **Full-text GIN**, **CHECK constraints**, **triggers** (`actualizado_en`).
