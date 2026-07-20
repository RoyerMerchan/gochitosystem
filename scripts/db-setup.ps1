<#
.SYNOPSIS
    Prepara la base de datos de GochitoSystem en MariaDB.

.DESCRIPTION
    Trabaja contra el contenedor Docker `mariadb-10-6` (MariaDB 10.6, publicado en el
    puerto 3307 del host), que es el mismo servidor que ya esta registrado en DBeaver.

    Pasos que ejecuta:
      1. Arranca el contenedor si esta detenido.
      2. Crea la base `gochitosystem` con utf8mb4 / utf8mb4_unicode_ci.
      3. Crea el usuario de aplicacion `gochito` con permisos minimos
         (principio de menor privilegio: la API nunca se conecta como root).
      4. Aplica database/schema.sql, database/views.sql y database/seed.sql si existen.
      5. Muestra el resumen de tablas y los datos de conexion para DBeaver.

    Es idempotente: se puede volver a ejecutar sin romper nada, salvo que se use -Recreate.

.PARAMETER SkipSeed
    No aplica los datos de ejemplo (database/seed.sql).

.PARAMETER Recreate
    ATENCION: elimina la base `gochitosystem` y la vuelve a crear desde cero.
    Solo afecta a esta base; el resto de bases del contenedor no se tocan.

.EXAMPLE
    .\scripts\db-setup.ps1
    .\scripts\db-setup.ps1 -Recreate
    .\scripts\db-setup.ps1 -SkipSeed
#>
[CmdletBinding()]
param(
    [switch]$SkipSeed,
    [switch]$Recreate
)

$ErrorActionPreference = 'Stop'
$RepoRoot = Split-Path -Parent $PSScriptRoot
$DbDir    = Join-Path $RepoRoot 'database'

# --- Leer configuracion desde .env ---------------------------------------------
$EnvFile = Join-Path $RepoRoot '.env'
if (-not (Test-Path $EnvFile)) {
    throw "No existe $EnvFile. Copia .env.example a .env y completa los valores."
}
$cfg = @{}
Get-Content $EnvFile | ForEach-Object {
    if ($_ -match '^\s*([A-Z0-9_]+)\s*=\s*(.*)$') { $cfg[$Matches[1]] = $Matches[2].Trim() }
}

$DbName      = if ($cfg['DB_NAME'])      { $cfg['DB_NAME'] }      else { 'gochitosystem' }
$DbUser      = if ($cfg['DB_USER'])      { $cfg['DB_USER'] }      else { 'gochito' }
$DbPass      = $cfg['DB_PASSWORD']
$DbPort      = if ($cfg['DB_PORT'])      { $cfg['DB_PORT'] }      else { '3307' }
$RootPass    = $cfg['DB_ROOT_PASSWORD']
$Container   = if ($cfg['DB_CONTAINER']) { $cfg['DB_CONTAINER'] } else { 'mariadb-10-6' }

if ([string]::IsNullOrWhiteSpace($DbPass))   { throw "DB_PASSWORD esta vacio en .env." }
if ([string]::IsNullOrWhiteSpace($RootPass)) { throw "DB_ROOT_PASSWORD esta vacio en .env." }

# --- Helpers --------------------------------------------------------------------
# La contrasena se pasa por variable de entorno del contenedor (MYSQL_PWD) para que
# no aparezca en la lista de procesos ni provoque el aviso de "password on command line".
function Invoke-Sql {
    param([string]$Sql, [string]$Database = '')
    $args = @('exec', '-i', '-e', "MYSQL_PWD=$RootPass", $Container, 'mariadb', '-uroot')
    if ($Database) { $args += $Database }
    $args += @('-e', $Sql)
    $out = & docker @args 2>&1
    if ($LASTEXITCODE -ne 0) { throw "Fallo SQL:`n$out" }
    return $out
}

function Invoke-SqlFile {
    param([string]$Path, [string]$Database)
    if (-not (Test-Path $Path)) {
        Write-Host "      - omitido (no existe): $(Split-Path -Leaf $Path)" -ForegroundColor DarkYellow
        return $false
    }
    Write-Host "      - aplicando $(Split-Path -Leaf $Path) ..." -ForegroundColor Cyan
    # El archivo se envia por stdin: no hace falta montarlo dentro del contenedor.
    $out = Get-Content $Path -Raw -Encoding UTF8 |
           & docker exec -i -e "MYSQL_PWD=$RootPass" $Container mariadb -uroot $Database 2>&1
    if ($LASTEXITCODE -ne 0) { throw "Fallo aplicando $(Split-Path -Leaf $Path):`n$out" }
    return $true
}

# --- 1. Contenedor --------------------------------------------------------------
Write-Host "`n[1/5] Verificando el contenedor '$Container' ..." -ForegroundColor Green
$estado = (& docker inspect -f '{{.State.Status}}' $Container 2>&1)
if ($LASTEXITCODE -ne 0) {
    throw "No existe el contenedor '$Container'. Revisa que Docker Desktop este abierto y que el contenedor exista (docker ps -a)."
}
if ($estado -ne 'running') {
    Write-Host "      Estaba '$estado'. Arrancandolo ..." -ForegroundColor Yellow
    & docker start $Container | Out-Null
    Start-Sleep -Seconds 8
}
$ver = Invoke-Sql -Sql 'SELECT VERSION();'
Write-Host "      Conectado a MariaDB en 127.0.0.1:$DbPort -> $($ver[-1])" -ForegroundColor DarkGray

# --- 2. Base de datos -----------------------------------------------------------
Write-Host "[2/5] Creando la base '$DbName' ..." -ForegroundColor Green
if ($Recreate) {
    Write-Warning "Se va a ELIMINAR la base '$DbName' con todos sus datos. Las demas bases del contenedor no se tocan."
    if ((Read-Host "Escribe SI para confirmar") -ne 'SI') { throw 'Cancelado por el usuario.' }
    Invoke-Sql -Sql "DROP DATABASE IF EXISTS ``$DbName``;" | Out-Null
}
Invoke-Sql -Sql "CREATE DATABASE IF NOT EXISTS ``$DbName`` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;" | Out-Null

# --- 3. Usuario de aplicacion ---------------------------------------------------
Write-Host "[3/5] Configurando el usuario de aplicacion '$DbUser' ..." -ForegroundColor Green
$escPass = $DbPass -replace "'", "''"
Invoke-Sql -Sql @"
CREATE USER IF NOT EXISTS '$DbUser'@'%' IDENTIFIED BY '$escPass';
ALTER USER '$DbUser'@'%' IDENTIFIED BY '$escPass';
GRANT SELECT, INSERT, UPDATE, DELETE, EXECUTE, SHOW VIEW ON ``$DbName``.* TO '$DbUser'@'%';
FLUSH PRIVILEGES;
"@ | Out-Null
Write-Host "      Permisos: SELECT, INSERT, UPDATE, DELETE, EXECUTE, SHOW VIEW (sin DROP ni ALTER)" -ForegroundColor DarkGray

# --- 4. Scripts SQL -------------------------------------------------------------
Write-Host "[4/5] Aplicando scripts SQL ..." -ForegroundColor Green
$aplicado = $false
if (Invoke-SqlFile -Path (Join-Path $DbDir 'schema.sql') -Database $DbName) { $aplicado = $true }
if (Invoke-SqlFile -Path (Join-Path $DbDir 'views.sql')  -Database $DbName) { $aplicado = $true }
if (-not $SkipSeed) {
    if (Invoke-SqlFile -Path (Join-Path $DbDir 'seed.sql') -Database $DbName) { $aplicado = $true }
}
if (-not $aplicado) {
    Write-Warning "No se encontro ningun script en $DbDir. La base quedo creada pero VACIA."
}

# --- 5. Resumen -----------------------------------------------------------------
Write-Host "[5/5] Tablas en '$DbName':" -ForegroundColor Green
$tablas = Invoke-Sql -Sql "SELECT TABLE_NAME AS tabla, TABLE_ROWS AS filas FROM information_schema.TABLES WHERE TABLE_SCHEMA='$DbName' ORDER BY TABLE_NAME;"
if ($tablas.Count -le 1) {
    Write-Host "      (ninguna)" -ForegroundColor DarkYellow
} else {
    $tablas | Select-Object -Skip 1 | ForEach-Object { Write-Host "      $_" -ForegroundColor DarkGray }
    Write-Host "      Total: $($tablas.Count - 1) tablas" -ForegroundColor DarkGray
}

Write-Host "`n=========================================================" -ForegroundColor Green
Write-Host " Conexion para DBeaver" -ForegroundColor Green
Write-Host "   Driver   : MariaDB"
Write-Host "   Host     : localhost"
Write-Host "   Puerto   : $DbPort"
Write-Host "   Base     : $DbName"
Write-Host "   Usuario  : $DbUser"
Write-Host "   Password : (valor de DB_PASSWORD en .env)"
Write-Host "=========================================================`n" -ForegroundColor Green
