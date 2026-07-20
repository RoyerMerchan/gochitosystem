# === Frontend GochitoSystem — build Vite + servir con nginx ===
# Etapa 1: compilar la app React
FROM node:20-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
# Sin VITE_API_URL: la app llama a /api/v1 (mismo dominio), y nginx lo proxea
# al backend. Asi no hay CORS ni URL del backend quemada en el bundle.
RUN npm run build

# Etapa 2: nginx sirve el build y hace de reverse proxy al backend
FROM nginx:1.27-alpine AS runtime
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
