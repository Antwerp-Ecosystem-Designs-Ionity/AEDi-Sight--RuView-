# AEDi-Sight RuView · Windows PowerShell installer
#   Set-ExecutionPolicy -Scope CurrentUser RemoteSigned   # if blocked
#   ./install.ps1
$ErrorActionPreference = 'Stop'

$RepoUrl    = if ($env:AEDI_REPO_URL)    { $env:AEDI_REPO_URL }    else { 'https://github.com/Antwerp-Ecosystem-Designs-Ionity/AEDi-Sight--RuView-.git' }
$RepoBranch = if ($env:AEDI_REPO_BRANCH) { $env:AEDI_REPO_BRANCH } else { 'main' }
$Dir        = if ($env:AEDI_DIR)         { $env:AEDI_DIR }         else { Join-Path $HOME 'AEDi-Sight-RuView' }

Write-Host "AEDi-Sight RuView · installer" -ForegroundColor Cyan
Write-Host "  repo   $RepoUrl"
Write-Host "  branch $RepoBranch"
Write-Host "  dest   $Dir"

foreach ($tool in @('git','python')) {
  if (-not (Get-Command $tool -ErrorAction SilentlyContinue)) {
    Write-Host "→ $tool not found. Install it (https://git-scm.com / https://www.python.org/) then re-run." -ForegroundColor Yellow
    exit 2
  }
}

if (-not (Test-Path $Dir)) {
  New-Item -ItemType Directory -Path $Dir | Out-Null
  git clone --branch $RepoBranch --depth 1 $RepoUrl $Dir
} else {
  Push-Location $Dir
  git fetch --all --prune
  git checkout $RepoBranch
  git pull --rebase --autostash
  Pop-Location
}

$GuiDir = Join-Path $Dir 'aedi-sight-gui'
if (-not (Test-Path $GuiDir)) { throw "$GuiDir not found in repo." }

Write-Host "→ installing Python deps" -ForegroundColor Cyan
python -m pip install --user --break-system-packages aiohttp websockets pyserial esptool esp_idf_nvs_partition_gen scipy numpy | Out-Null

# Start-menu shortcut
$start = [Environment]::GetFolderPath('Programs')
$shortcut = Join-Path $start 'AEDi-Sight RuView.lnk'
$ws = New-Object -ComObject WScript.Shell
$lnk = $ws.CreateShortcut($shortcut)
$lnk.TargetPath = Join-Path $GuiDir 'launch.bat'
$lnk.WorkingDirectory = $GuiDir
$lnk.IconLocation = (Join-Path $GuiDir 'static\img\favicon.svg')
$lnk.Description = 'WiFi-CSI sensing console (IONITY)'
$lnk.Save()

Write-Host ""
Write-Host "done." -ForegroundColor Green
Write-Host "  launch  · $GuiDir\launch.bat   (or use the new Start-menu entry)"
Write-Host "  ui      · http://localhost:8088"
Write-Host "  udp     · 0.0.0.0:5005 (ADR-018 CSI ingest)"
