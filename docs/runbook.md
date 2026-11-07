# Runbook de operação (produção no PC)

Atalho: `$dc = "docker compose --env-file .env.prod -f docker-compose.prod.yml"` e use `& $dc ...` (ou escreva por extenso).

| Preciso... | Comando |
|---|---|
| Ver o estado | `docker compose --env-file .env.prod -f docker-compose.prod.yml ps` |
| Subir tudo | `docker compose --env-file .env.prod -f docker-compose.prod.yml up -d` |
| Derrubar (dados ficam nos volumes) | `docker compose ... down` — **nunca** `down -v` em produção (apaga o banco) |
| Logs (api/web/backup/cloudflared) | `docker compose ... logs -f --tail 100 api` |
| Atualizar a versão | `scripts\deploy.ps1` (rollback automático se `/health` falhar) |
| Voltar a versão anterior | `scripts\deploy.ps1 -Rollback` |
| Reiniciar um serviço | `docker compose ... restart api` |
| Shell no banco | `docker compose ... exec postgres psql -U marcaai -d marcaai` |
| Backup agora | `docker compose ... exec backup backup.sh` |
| Restaurar (teste) | `scripts\restore-backup.ps1 -Dump ARQ.dump.age -Identity chave.txt` |

## O site caiu — triagem (5 minutos)
1. `https://api.SEUDOMINIO/health` responde? Se **não**: o PC/internet/Docker está fora (próximo item). Se **sim** mas o app não: veja `logs web`.
2. No PC: Docker Desktop está rodando? `docker ps`. Se não, abra-o; os containers voltam (`restart: unless-stopped`).
3. `ps` mostra `cloudflared` reiniciando? Token inválido/expirado → recrie o token no painel e atualize `CLOUDFLARE_TUNNEL_TOKEN`, depois `up -d cloudflared`.
4. `api` não sobe: `logs api` mostra a validação de configuração (ex.: falta `RESEND_API_KEY`). Corrija o `.env.prod` e `up -d api`.
5. `api` sobe mas `unhealthy`: o Postgres está `healthy`? `logs postgres`. Disco cheio (`docker system df`, `Get-PSDrive C`)?
6. Erro logo após um deploy: `scripts\deploy.ps1 -Rollback`.

## O PC caiu / queimou / foi roubado
1. Em outra máquina com Docker: clone o repositório; recrie o `.env.prod` (cofre de senhas).
2. Suba só o banco: `docker compose ... up -d postgres`.
3. Baixe o último `*.dump.age` e `*.keys.tar.age` do destino externo; tenha a chave privada do age.
4. Restaure o banco: `scripts\restore-backup.ps1 -Dump ... -Identity ... -TargetDb marcaai -Force` (web/api desligados).
5. Restaure as chaves do Data Protection no volume `marcaai_dpkeys` (decifre com `age -d -i chave.txt arquivo.keys.tar.age | tar -x -C /keys` num container com o volume montado).
6. `scripts\deploy.ps1 -NoPull`. Gere um token novo do túnel se mudou de máquina (o mesmo túnel pode rodar em outra máquina).
7. Avise os clientes se houve perda de dados (RPO = até 24 h) e, se houve vazamento, siga `.lgpd/incidents/` (**prazo de 3 dias úteis para a ANPD**).

## Rotacionar segredos
- `JWT_SIGNING_KEY`: gere nova (`openssl rand -base64 64`), atualize o `.env.prod`, `up -d api`. Todos são deslogados.
- Senha do Postgres: altere no banco (`ALTER USER marcaai PASSWORD '...'`) **e** no `.env.prod`, depois `up -d api backup`.
- Stripe/Resend/Google/MP: gere nova no painel do provedor, atualize o `.env.prod`, `up -d api` (para webhooks, atualize também o endpoint).
- Token do túnel: recrie no painel Cloudflare e atualize `CLOUDFLARE_TUNNEL_TOKEN`.
- Chave do backup (age): gere novo par, troque `BACKUP_AGE_RECIPIENT`; mantenha a privada antiga enquanto existirem backups cifrados com ela.

## Rotina
- **Diário**: nada (alertas do monitor externo).
- **Semanal**: `docker compose ... logs --since 168h api | Select-String "fail|crit"`; espaço em disco; confirmar que o backup do dia está no R2.
- **Mensal**: aplicar atualizações (`deploy.ps1`), `docker image prune`, revisar acessos.
- **Trimestral**: teste de restauração completo; revisar `.lgpd/gaps.md`.

## Pontos de atenção
- Postgres 18 usa o volume em `/var/lib/postgresql` (não `.../data`).
- Migrations rodam sozinhas no boot da API (instância única). Não escale a API para mais de uma réplica sem mover as migrations para um passo de release.
- O dashboard do Hangfire (`api.../hangfire`) só abre para IDs em `ADMIN_HANGFIRE_USER_IDS`.
