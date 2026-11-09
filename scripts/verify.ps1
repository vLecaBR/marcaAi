#Requires -Version 5.1
<#
  MarcaAí — verificação única no Windows. Encaminha para scripts/verify.sh (Git Bash), para ter uma só implementação.
  Uso:  powershell -ExecutionPolicy Bypass -File scripts\verify.ps1 [-Fast] [-NoDocker]
#>
param([switch]$Fast, [switch]$NoDocker)
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot

# Prefere o bash do Git for Windows (o "bash" do PATH pode ser o shim do WSL, que não enxerga dotnet/npm do Windows).
# Procura ao lado do git.exe do PATH (instalação em qualquer unidade) e nos locais padrão.
$gitExe = (Get-Command git -ErrorAction SilentlyContinue).Source
$candidates = @()
if ($gitExe) { $candidates += (Join-Path (Split-Path -Parent (Split-Path -Parent $gitExe)) "bin\bash.exe") }
$candidates += "$env:ProgramFiles\Git\bin\bash.exe", "${env:ProgramFiles(x86)}\Git\bin\bash.exe", "$env:LOCALAPPDATA\Programs\Git\bin\bash.exe"
$bash = $candidates | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $bash) { Write-Error "Git Bash não encontrado. Instale o Git for Windows (https://git-scm.com)."; exit 2 }

$shArgs = @("scripts/verify.sh")
if ($Fast) { $shArgs += "--fast" }
if ($NoDocker) { $shArgs += "--no-docker" }
Push-Location $root
try { & $bash @shArgs; exit $LASTEXITCODE } finally { Pop-Location }
