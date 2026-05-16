# AEDi-Sight RuView - Windows PowerShell launcher.
$ErrorActionPreference = 'Stop'
Set-Location -Path $PSScriptRoot

function Resolve-Python {
  foreach ($cand in @('py -3', 'python3', 'python')) {
    try {
      $v = & cmd /c "$cand -c ""import sys;print(sys.version_info[:2])"" 2>nul"
      if ($LASTEXITCODE -eq 0 -and $v) { return $cand }
    } catch {}
  }
  throw "Python 3.10+ not found. Install from https://www.python.org/downloads/"
}

$PY = Resolve-Python
$env:PYTHONPATH = "$PSScriptRoot;$env:PYTHONPATH"

Write-Host "Installing missing dependencies..." -ForegroundColor Cyan
cmd /c "$PY -m pip install --user --break-system-packages aiohttp websockets pyserial esptool esp_idf_nvs_partition_gen scipy numpy" | Out-Null

cmd /c "$PY -m aedi_sight.ansi"

$Host_ = if ($env:AEDI_HOST) { $env:AEDI_HOST } else { '0.0.0.0' }
$Port_ = if ($env:AEDI_PORT) { $env:AEDI_PORT } else { '8088' }

& cmd /c "$PY -m aedi_sight --host $Host_ --port $Port_ --no-banner --open-browser --watchdog $($args -join ' ')"
