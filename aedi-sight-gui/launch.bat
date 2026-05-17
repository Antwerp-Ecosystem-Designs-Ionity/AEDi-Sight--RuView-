@echo off
REM AEDi-Sight RuView - Windows launcher (no PowerShell required)
setlocal ENABLEEXTENSIONS
cd /d "%~dp0"

where py >nul 2>nul
if errorlevel 1 (
  set "PY=python"
) else (
  set "PY=py -3"
)

%PY% -c "import sys; sys.exit(0 if sys.version_info >= (3,10) else 1)" 1>nul 2>nul
if errorlevel 1 (
  echo Python 3.10+ required. Install from https://www.python.org/downloads/
  exit /b 1
)

echo Installing/refreshing dependencies...
%PY% -m pip install --user --break-system-packages aiohttp websockets pyserial esptool esp_idf_nvs_partition_gen scipy numpy 1>nul 2>nul

set "PYTHONPATH=%CD%;%PYTHONPATH%"
%PY% -m aedi_sight.ansi 2>nul

set "HOST=%AEDI_HOST%"
if "%HOST%"=="" set "HOST=0.0.0.0"
set "PORT=%AEDI_PORT%"
if "%PORT%"=="" set "PORT=8088"

%PY% -m aedi_sight --host %HOST% --port %PORT% --no-banner --open-browser --watchdog %*
endlocal
