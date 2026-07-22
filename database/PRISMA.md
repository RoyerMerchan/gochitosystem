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

## Flujo de cambios futuros (una vez adoptado)

- Editas `prisma/schema.prisma`.
- `npx prisma migrate dev --name descripcion` (local) → crea la migración.
- En prod: `npx prisma migrate deploy` (o el arranque del backend lo hace).

## Qué queda en SQL crudo (a propósito)

Prisma no expresa todo; estos casos van con `prisma.$queryRaw` / SQL de migración:

- **`FOR UPDATE` / `FOR UPDATE OF`** (bloqueo de fila del POS: consecutivos, stock).
- **Índices únicos parciales** (`WHERE eliminado_en IS NULL`).
- **Full-text GIN**, **CHECK constraints**, **triggers** (`actualizado_en`).
