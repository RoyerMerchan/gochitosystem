#!/usr/bin/env bash
# =============================================================================
# Despliegue de GochitoSystem en el VPS — un solo comando.
#
#   bash desplegar.sh
#
# Hace: trae el código, reconstruye backend y web, y los levanta. Las migraciones
# se aplican SOLAS al arrancar el backend (migrador integrado). Al final muestra
# los logs para que veas la migración y el arranque.
# =============================================================================
set -euo pipefail
cd "$(dirname "$0")"

echo "== 1/3  Trayendo cambios (git pull) =="
git pull --ff-only

echo "== 2/3  Reconstruyendo y levantando (backend + web) =="
docker compose -f docker-compose.prod.yml up -d --build backend web

echo "== 3/3  Logs del backend (migraciones + arranque) =="
sleep 4
docker compose -f docker-compose.prod.yml logs --tail=50 backend

echo ""
echo "== Listo. Prueba: facturar, ajustar inventario y un abono. =="
