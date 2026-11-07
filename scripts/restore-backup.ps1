<#
.SYNOPSIS
  Restaura um backup criptografado (.dump.age) num banco de TESTE e mostra contagens de tabelas para conferir.
  Por padrão NUNCA toca no banco de produção: restaura em "marcaai_restore_test".
.EXAMPLE
  # backup baixado do R2 (ou copiado do volume) + a chave PRIVADA do age (do cofre de senhas)
  .\scripts\restore-backup.ps1 -Dump C:\tmp\marcaai-20261107-033000.dump.age -Identity C:\tmp\age-key.txt
.EXAMPLE
  # restaurar DE VERDADE em produção (desastre): pare web/api antes! Exige -Force.
  .\scripts\restore-backup.ps1 -Dump ... -Identity ... -TargetDb marcaai -Force
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory)][string]$Dump,
  [Parameter(Mandatory)][string]$Identity,
  [string]$TargetDb = "marcaai_restore_test",
  [string]$EnvFile = ".env.prod",
  [switch]$Force
)
$ErrorActionPreference = "Stop"
Set-Location (Split-Path -Parent $PSScriptRoot)

if (-not (Test-Path $Dump)) { throw "Dump não encontrado: $Dump" }
if (-not (Test-Path $Identity)) { throw "Chave privada do age não encontrada: $Identity" }
if (-not (Test-Path $EnvFile)) { throw "$EnvFile não encontrado." }

function Read-EnvValue([string]$name, [string]$default) {
  $line = Get-Content $EnvFile | Where-Object { $_ -match "^\s*$name=" } | Select-Object -Last 1
  if ($line) { $v = ($line -split "=", 2)[1].Trim().Trim('"'); if ($v) { return $v } }
  return $default
}
$pgUser = Read-EnvValue "POSTGRES_USER" "marcaai"
$pgPass = Read-EnvValue "POSTGRES_PASSWORD" ""
$prodDb = Read-EnvValue "POSTGRES_DB" "marcaai"
if ($TargetDb -eq $prodDb -and -not $Force) {
  throw "O destino '$TargetDb' é o banco de PRODUÇÃO. Use um banco de teste ou passe -Force (e pare web/api antes)."
}

$dumpFull = (Resolve-Path $Dump).Path
$idFull = (Resolve-Path $Identity).Path
$network = "marcaai_default"
$image = "marcaai-backup:" + $(if ($env:TAG) { $env:TAG } else { "latest" })


Write-Host "Restaurando $dumpFull em '$TargetDb' (rede $network)..." -ForegroundColor Cyan
docker run --rm --network $network `
  -e PGHOST=postgres -e PGUSER=$pgUser -e PGPASSWORD=$pgPass -e PGDATABASE=postgres -e TARGET=$TargetDb `
  -v "${dumpFull}:/in/backup.dump.age:ro" -v "${idFull}:/in/key.txt:ro" `
  --entrypoint restore.sh $image
if ($LASTEXITCODE -ne 0) { throw "Restauração falhou." }
Write-Host "OK. Para apagar o banco de teste: docker compose --env-file $EnvFile -f docker-compose.prod.yml exec postgres dropdb -U $pgUser $TargetDb" -ForegroundColor Green
