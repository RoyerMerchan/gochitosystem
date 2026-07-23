# === Backend GochitoSystem — build + runtime ===
# Etapa 1: compilar TypeScript a dist/
FROM node:20-slim AS build
WORKDIR /app
# Herramientas para compilar dependencias nativas (bcrypt).
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*
COPY package*.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# Etapa 2: imagen final, solo dependencias de produccion
FROM node:20-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
# openssl: requerido por el motor de Prisma (migrate deploy).
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ openssl \
    && rm -rf /var/lib/apt/lists/*
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force
# Reconstruye bcrypt para la plataforma del contenedor.
RUN npm rebuild bcrypt --build-from-source || true
COPY --from=build /app/dist ./dist
# Schema y migraciones de Prisma (necesarios para `prisma migrate deploy`).
COPY prisma ./prisma
# Carpeta para subidas (logo, imagenes).
RUN mkdir -p uploads logs
EXPOSE 4000
# Aplica migraciones pendientes con Prisma y arranca. El `|| true` evita que un
# fallo del migrador tumbe el arranque (misma filosofia que el migrador anterior:
# "arranca igual y se reintenta en el proximo deploy"). Requiere haber hecho el
# baseline (0_init) una vez; ver database/PRISMA.md.
CMD ["sh", "-c", "npx prisma migrate deploy || true; node dist/server.js"]
