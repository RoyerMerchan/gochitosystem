<#
  Arranca GochitoSystem en local: base de datos + backend + frontend.
  Uso:  boton derecho > "Ejecutar con PowerShell"   o   .\iniciar.ps1
#>
$ErrorActionPreference = 'Stop'
$raiz = $PSScriptRoot

Write-Host "`n=== Mini Market Los Gochitos - arranque local ===`n" -ForegroundColor Cyan

# 1. Base de datos (contenedor Docker MariaDB en el puerto 3307)
Write-Host "[1/3] Base de datos..." -ForegroundColor Yellow
$estado = (docker inspect -f '{{.State.Status}}' mariadb-10-6 2>$null)
if ($LASTEXITCODE -ne 0) {
    Write-Host "  Docker no responde. Abre Docker Desktop y vuelve a ejecutar." -ForegroundColor Red
    Read-Host "Enter para salir"; exit 1
}
if ($estado -ne 'running') {
    Write-Host "  Arrancando MariaDB..." -ForegroundColor DarkGray
    docker start mariadb-10-6 | Out-Null
    Start-Sleep -Seconds 6
}
Write-Host "  MariaDB lista en localhost:3307" -ForegroundColor Green

# 2. Backend (puerto 4000) en su propia ventana
Write-Host "[2/3] Backend (API)..." -ForegroundColor Yellow
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$raiz\backend'; npm run dev"
Write-Host "  API arrancando en http://localhost:4000" -ForegroundColor Green

# 3. Frontend (puerto 5173) en su propia ventana
Write-Host "[3/3] Frontend (web)..." -ForegroundColor Yellow
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$raiz\frontend'; npm run dev"
Write-Host "  Web arrancando en http://localhost:5173" -ForegroundColor Green

# Espera a que el frontend responda y abre el navegador.
Write-Host "`nEsperando a que la web este lista..." -ForegroundColor DarkGray
for ($i = 0; $i -lt 30; $i++) {
    Start-Sleep -Seconds 2
    try {
        if ((Invoke-WebRequest -Uri "http://localhost:5173/" -UseBasicParsing -TimeoutSec 2).StatusCode -eq 200) { break }
    } catch {}
}
Start-Process "http://localhost:5173"

Write-Host "`n=====================================================" -ForegroundColor Green
Write-Host " Listo. Abre:  http://localhost:5173" -ForegroundColor Green
Write-Host " Usuario: admin    Clave: Admin123!" -ForegroundColor Green
Write-Host ""
Write-Host " Se abrieron 2 ventanas (backend y frontend)." -ForegroundColor DarkGray
Write-Host " Para apagar el sistema, cierra esas 2 ventanas." -ForegroundColor DarkGray
Write-Host "=====================================================`n" -ForegroundColor Green
Read-Host "Enter para cerrar esta ventana"
