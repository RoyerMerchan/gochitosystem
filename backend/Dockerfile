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
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force
# Reconstruye bcrypt para la plataforma del contenedor.
RUN npm rebuild bcrypt --build-from-source || true
COPY --from=build /app/dist ./dist
# Carpeta para subidas (logo, imagenes).
RUN mkdir -p uploads logs
EXPOSE 4000
CMD ["node", "dist/server.js"]
