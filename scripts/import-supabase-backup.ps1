<# Importa o dump do Supabase no banco de DEV (Postgres do docker-compose.dev.yml).
   O dump contém DADOS PESSOAIS: fica FORA do repositório e é montado somente leitura.
   Uso:  .\scripts\import-supabase-backup.ps1 [-BackupPath C:\Code\marcaAi-backup\marcaai-supabase.dump]
   Pare a API antes. DESTRUTIVO: recria o banco 'marcaai' de dev. #>
param(
  [string]$BackupPath = $(if ($env:BACKUP_PATH) { $env:BACKUP_PATH } else { 'C:\Code\marcaAi-backup\marcaai-supabase.dump' }),
  [string]$Db = 'marcaai', [string]$DbUser = 'marcaai'
)
$ErrorActionPreference = 'Continue'   # docker escreve progresso no stderr; erros são checados via $LASTEXITCODE
$root = Split-Path -Parent $PSScriptRoot
$compose = @('compose', '-f', (Join-Path $root 'docker-compose.dev.yml'))

if (-not (Test-Path $BackupPath)) { throw "Backup não encontrado: $BackupPath" }
$full = (Resolve-Path $BackupPath).Path
if ($full.StartsWith($root.TrimEnd([char]92) + [char]92, [StringComparison]::OrdinalIgnoreCase)) { throw 'O dump não pode ficar dentro do repositório.' }
try { Invoke-WebRequest http://localhost:5080/health -UseBasicParsing -TimeoutSec 2 | Out-Null; throw 'Pare a API antes de importar.' } catch [System.Net.WebException] {}

docker @compose up -d postgres --wait
Write-Host "▶ Recriando banco '$Db' (vazio)"
docker @compose exec -T postgres psql -U $DbUser -d postgres -v ON_ERROR_STOP=1 -c "DROP DATABASE IF EXISTS $Db WITH (FORCE)" -c "CREATE DATABASE $Db OWNER $DbUser"
if ($LASTEXITCODE) { throw 'Falha ao recriar o banco.' }

Write-Host '▶ pg_restore (schema + dados)'
$dir = Split-Path $full -Parent; $file = Split-Path $full -Leaf
$log = New-TemporaryFile
$ErrorActionPreference = 'Continue'
docker @compose run --rm --no-deps -e "PGPASSWORD=$(if ($env:POSTGRES_PASSWORD) { $env:POSTGRES_PASSWORD } else { 'marcaai' })" -v "${dir}:/backup:ro" --entrypoint pg_restore postgres -h postgres -U $DbUser -d $Db --no-owner --no-privileges "/backup/$file" 2> $log
$ErrorActionPreference = 'Continue'
$bad = Get-Content $log | Where-Object { $_ -match 'pg_restore: error' -and $_ -notmatch 'already exists' }
$ntab = [int](docker @compose exec -T postgres psql -U $DbUser -d $Db -tAc "select count(*) from information_schema.tables where table_schema='public'")
if ($bad -or $ntab -eq 0) { Write-Host 'ERROS INESPERADOS no pg_restore:'; $bad; Write-Host "(log: $log)"; exit 1 }
Remove-Item $log

Write-Host '▶ Normalizando códigos de plano'
Get-Content (Join-Path $root 'backend\scripts\normalize_plan_codes.sql') -Raw | docker @compose exec -T postgres psql -U $DbUser -d $Db -v ON_ERROR_STOP=1
Write-Host '▶ Contagem de linhas por tabela'
docker @compose exec -T postgres psql -U $DbUser -d $Db -c "SELECT relname AS tabela, (xpath('/row/c/text()', query_to_xml(format('select count(*) as c from %I.%I', schemaname, relname), false, true, '')))[1]::text::int AS linhas FROM pg_stat_user_tables WHERE schemaname='public' ORDER BY 1;"
Write-Host '✔ Importação concluída. Suba a API: o Migrate() aplica o que faltar e cria o schema do Hangfire.'
