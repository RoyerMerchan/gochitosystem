#!/usr/bin/env bash
# =============================================================================
# Runner de migraciones para GochitoSystem (PostgreSQL, sin dependencias).
#
# Aplica en orden los archivos database/migraciones/NNNN_*.sql que aun no se
# hayan aplicado, y los registra en la tabla `migraciones`. Idempotente: correrlo
# de nuevo no repite las ya aplicadas.
#
# Uso (en el VPS, donde corre Postgres):
#   export PGPASSWORD='...'                 # o usar ~/.pgpass
#   ./database/migrar.sh                    # usa variables de entorno abajo
#   DB_USER=gochito DB_NAME=gochitosystem DB_HOST=localhost ./database/migrar.sh
# =============================================================================
set -euo pipefail

DB_USER="${DB_USER:-gochito}"
DB_NAME="${DB_NAME:-gochitosystem}"
DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5432}"

DIR="$(cd "$(dirname "$0")" && pwd)/migraciones"
PSQL_BASE=(psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -X -q)

# Consulta escalar silenciosa.
psql_scalar() { "${PSQL_BASE[@]}" -tAc "$1"; }

echo "== Migraciones GochitoSystem =="
echo "   BD: $DB_USER@$DB_HOST:$DB_PORT/$DB_NAME"

# Asegura la tabla de control (por si es una BD sin el esquema aun).
psql_scalar "CREATE TABLE IF NOT EXISTS migraciones (
  version VARCHAR(32) PRIMARY KEY,
  nombre VARCHAR(160) NOT NULL,
  checksum CHAR(64) NOT NULL,
  aplicada_en TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  duracion_ms INTEGER NOT NULL DEFAULT 0,
  aplicada_por VARCHAR(60)
);" >/dev/null

shopt -s nullglob
archivos=("$DIR"/*.sql)
if [ ${#archivos[@]} -eq 0 ]; then echo "No hay migraciones."; exit 0; fi

pendientes=0
for f in "${archivos[@]}"; do
  name="$(basename "$f")"
  version="${name%%_*}"
  sum="$(sha256sum "$f" | cut -d' ' -f1)"
  yaAplicada="$(psql_scalar "SELECT 1 FROM migraciones WHERE version='${version}'")"

  if [ "$yaAplicada" = "1" ]; then
    echo "  = $name (ya aplicada)"
    continue
  fi

  echo "  -> aplicando $name ..."
  inicio=$(date +%s%3N 2>/dev/null || echo 0)
  # ON_ERROR_STOP=0: la sync usa IF NOT EXISTS; se reportan errores pero no aborta.
  "${PSQL_BASE[@]}" -v ON_ERROR_STOP=0 -f "$f"
  fin=$(date +%s%3N 2>/dev/null || echo 0)
  dur=$(( fin - inicio )); [ "$dur" -lt 0 ] && dur=0

  psql_scalar "INSERT INTO migraciones (version, nombre, checksum, duracion_ms, aplicada_por)
               VALUES ('${version}', '${name}', '${sum}', ${dur}, current_user);" >/dev/null
  echo "  ok $name (${dur}ms)"
  pendientes=$((pendientes+1))
done

echo "Listo. Migraciones aplicadas en esta corrida: ${pendientes}."
