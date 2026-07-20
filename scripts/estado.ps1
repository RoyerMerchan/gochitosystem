<#
.SYNOPSIS
    Muestra el avance de la construccion de GochitoSystem.

.EXAMPLE
    .\scripts\estado.ps1           # una foto del estado actual
    .\scripts\estado.ps1 -Vivo     # se refresca solo cada 15 segundos (Ctrl+C para salir)
#>
param([switch]$Vivo, [int]$Segundos = 15)

$Repo = Split-Path -Parent $PSScriptRoot
$Base = "C:\Users\Alkosto\.claude\projects\c--Users-Alkosto-Desktop-proye-RoyerProyects-gochitosystem\1d681079-f9b4-4b3f-8b47-56b1fd29379e\subagents\workflows"

$Flujos = @(
    @{ Nombre = 'SISTEMA (USD/Bs)'; Dir = 'wf_2da7d87d-3ce'; Total = 56 }
)

function Mostrar {
    Clear-Host
    Write-Host "  GOCHITOSYSTEM - AVANCE" -ForegroundColor Cyan
    Write-Host "  $(Get-Date -Format 'HH:mm:ss')`n" -ForegroundColor DarkGray

    # --- Workflows ---
    foreach ($f in $Flujos) {
        $j = Join-Path $Base "$($f.Dir)\journal.jsonl"
        if (Test-Path $j) {
            $e = Get-Content $j -ErrorAction SilentlyContinue | ForEach-Object { try { $_ | ConvertFrom-Json } catch {} }
            $ini = ($e | Where-Object { $_.type -eq 'started' }).Count
            $fin = ($e | Where-Object { $_.type -eq 'result'  }).Count
            $act = $ini - $fin
            $pct = [math]::Min(100, [math]::Round($fin / $f.Total * 100))
            $barra = ('#' * [math]::Round($pct / 4)).PadRight(25, '.')
            $color = if ($act -gt 0) { 'Yellow' } else { 'Green' }
            Write-Host ("  {0,-22} [{1}] {2,3}%  terminados:{3,-4} activos:{4}" -f $f.Nombre, $barra, $pct, $fin, $act) -ForegroundColor $color
        } else {
            Write-Host ("  {0,-22} sin iniciar" -f $f.Nombre) -ForegroundColor DarkGray
        }
    }

    # --- Archivos del proyecto ---
    Write-Host "`n  ARCHIVOS" -ForegroundColor Cyan
    foreach ($d in @('backend', 'frontend', 'database', 'docs')) {
        $ruta = Join-Path $Repo $d
        $n = 0
        if (Test-Path $ruta) {
            $n = (Get-ChildItem $ruta -Recurse -File -ErrorAction SilentlyContinue |
                  Where-Object { $_.FullName -notmatch 'node_modules' }).Count
        }
        Write-Host ("    {0,-10} {1,4} archivos" -f $d, $n) -ForegroundColor DarkGray
    }

    # --- Base de datos ---
    Write-Host "`n  BASE DE DATOS (MariaDB 3307)" -ForegroundColor Cyan
    $t = docker exec mariadb-10-6 mariadb -uroot -p1234 -N -e "SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA='gochitosystem';" 2>$null
    if ($LASTEXITCODE -eq 0) {
        $col = if ([int]$t -ge 42) { 'Green' } elseif ([int]$t -gt 0) { 'Yellow' } else { 'DarkGray' }
        Write-Host "    $t de 42 tablas creadas" -ForegroundColor $col
        if ([int]$t -gt 0) {
            $filas = docker exec mariadb-10-6 mariadb -uroot -p1234 gochitosystem -N -e "SELECT CONCAT(TABLE_NAME,'=',IFNULL(TABLE_ROWS,0)) FROM information_schema.TABLES WHERE TABLE_SCHEMA='gochitosystem' AND TABLE_ROWS>0 ORDER BY TABLE_ROWS DESC LIMIT 8;" 2>$null
            if ($filas) { Write-Host "    con datos: $($filas -join ', ')" -ForegroundColor DarkGray }
        }
    } else {
        Write-Host "    contenedor mariadb-10-6 apagado (docker start mariadb-10-6)" -ForegroundColor Red
    }

    # --- Ultimos archivos escritos ---
    Write-Host "`n  ULTIMO QUE SE ESCRIBIO" -ForegroundColor Cyan
    Get-ChildItem $Repo -Recurse -File -ErrorAction SilentlyContinue |
        Where-Object { $_.FullName -notmatch 'node_modules|\.git\\' } |
        Sort-Object LastWriteTime -Descending | Select-Object -First 8 |
        ForEach-Object {
            Write-Host ("    {0}  {1,-52} {2,6} KB" -f $_.LastWriteTime.ToString('HH:mm:ss'),
                        $_.FullName.Replace("$Repo\", ''), [math]::Round($_.Length / 1KB, 1)) -ForegroundColor DarkGray
        }

    if ($Vivo) { Write-Host "`n  refrescando cada ${Segundos}s - Ctrl+C para salir" -ForegroundColor DarkGray }
}

if ($Vivo) { while ($true) { Mostrar; Start-Sleep -Seconds $Segundos } } else { Mostrar }
