<#
.SYNOPSIS
  Deploy simples do MarcaAí em produção (PC): git pull -> build (tag = commit) -> up -d -> health -> rollback se falhar.
.EXAMPLE
  .\scripts\deploy.ps1            # atualiza do git e sobe
  .\scripts\deploy.ps1 -NoPull    # só reconstrói/sobe o que está na pasta
  .\scripts\deploy.ps1 -Rollback  # volta para a última versão boa (tag guardada em .deploy-state)
#>
[CmdletBinding()]
param(
  [switch]$NoPull,
  [switch]$Rollback,
  [string]$EnvFile = ".env.prod",
  [int]$TimeoutSec = 180
)
$ErrorActionPreference = "Stop"
Set-Location (Split-Path -Parent $PSScriptRoot)

if (-not (Test-Path $EnvFile)) { throw "Arquivo $EnvFile não encontrado. Copie .env.prod.example e preencha." }

function Read-EnvValue([string]$name, [string]$default) {
  $line = Get-Content $EnvFile | Where-Object { $_ -match "^\s*$name=" } | Select-Object -Last 1
  if ($line) { $v = ($line -split "=", 2)[1].Trim().Trim('"'); if ($v) { return $v } }
  return $default
}
$apiPort = Read-EnvValue "API_PORT" "8080"
$webPort = Read-EnvValue "WEB_PORT" "3000"
$compose = @("compose", "--env-file", $EnvFile, "-f", "docker-compose.prod.yml")
$stateFile = ".deploy-state"
$previous = if (Test-Path $stateFile) { (Get-Content $stateFile -Raw).Trim() } else { "" }

function Wait-Healthy {
  $deadline = (Get-Date).AddSeconds($TimeoutSec)
  while ((Get-Date) -lt $deadline) {
    try {
      $api = Invoke-WebRequest "http://127.0.0.1:$apiPort/health/ready" -UseBasicParsing -TimeoutSec 5
      $web = Invoke-WebRequest "http://127.0.0.1:$webPort/login" -UseBasicParsing -TimeoutSec 5
      if ($api.StatusCode -eq 200 -and $web.StatusCode -eq 200) { return $true }
    } catch { }
    Start-Sleep -Seconds 3
  }
  return $false
}

if ($Rollback) {
  if (-not $previous) { throw "Sem versão anterior registrada em $stateFile." }
  Write-Host "Rollback para a tag $previous" -ForegroundColor Yellow
  $env:TAG = $previous
  & docker @compose up -d --no-build
  if (-not (Wait-Healthy)) { throw "Rollback não ficou saudável. Veja: docker compose -f docker-compose.prod.yml logs --tail 100" }
  Write-Host "Rollback OK ($previous)." -ForegroundColor Green
  exit 0
}

if (-not $NoPull) {
  git pull --ff-only
  if ($LASTEXITCODE -ne 0) { throw "git pull falhou (resolva à mão; nada foi alterado em produção)." }
}

$tag = (git rev-parse --short HEAD).Trim()
if ((git status --porcelain --untracked-files=no).Trim()) { $tag = "$tag-dirty" }
Write-Host "Deploy da tag $tag (anterior: $(if ($previous) { $previous } else { 'nenhuma' }))" -ForegroundColor Cyan

$env:TAG = $tag
& docker @compose build
if ($LASTEXITCODE -ne 0) { throw "Build falhou; produção continua na versão anterior." }

& docker @compose up -d
if ($LASTEXITCODE -ne 0) { throw "docker compose up falhou." }

if (Wait-Healthy) {
  if ($previous -ne $tag) { Set-Content $stateFile $tag -NoNewline }
  Write-Host "Deploy OK ($tag). Saudável: /health da API e /login do web." -ForegroundColor Green
  docker image prune -f | Out-Null
  exit 0
}

Write-Host "Falhou o health-check em ${TimeoutSec}s." -ForegroundColor Red
& docker @compose logs --tail 60 api web
if ($previous) {
  Write-Host "Voltando para a tag $previous..." -ForegroundColor Yellow
  $env:TAG = $previous
  & docker @compose up -d --no-build
  if (Wait-Healthy) { Write-Host "Rollback OK ($previous). Corrija o problema e rode o deploy de novo." -ForegroundColor Yellow }
  else { Write-Host "Rollback também falhou — veja docs/runbook.md." -ForegroundColor Red }
} else {
  Write-Host "Não há versão anterior para voltar." -ForegroundColor Red
}
exit 1
