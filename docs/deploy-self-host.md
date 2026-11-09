# Deploy self-hosted (PC 24/7 + Cloudflare Tunnel)

Resultado: `https://app.SEUDOMINIO` e `https://api.SEUDOMINIO` servidos pelo seu PC, sem abrir portas no roteador. Só o `cloudflared` fala com a internet.

```
Internet ──HTTPS──> Cloudflare ──túnel──> cloudflared ─┬─> web:3000 (Next.js, BFF)
                                                        └─> api:8080 (.NET) ──> postgres:5432 (rede interna)
                                           backup (cron 03:30) ──> pg_dump + age ──> R2/B2
```

## 0. Pré-requisitos (🧑 você)
| Item | Observação |
|---|---|
| Domínio na Cloudflare | Registrar na própria Cloudflare ou apontar os NS para ela |
| Docker Desktop (WSL2) | Já instalado; veja a seção "Windows 24/7" |
| Conta Resend + domínio verificado | A API **não sobe em produção** sem `RESEND_API_KEY` e `RESEND_FROM_EMAIL` de domínio verificado |
| Destino de backup externo | Recomendado: Cloudflare R2 (bucket privado + token de API S3) |
| Chave `age` do backup | Veja a seção "Backup" |

## 1. Configurar o `.env.prod`
```powershell
Copy-Item .env.prod.example .env.prod
```
Preencha, no mínimo: `APP_PUBLIC_URL`, `API_PUBLIC_URL`, `POSTGRES_PASSWORD`, `JWT_SIGNING_KEY` (veja `docs/security-secrets.md`), `RESEND_*`, `CLOUDFLARE_TUNNEL_TOKEN`, `BACKUP_*`.

- As URLs `https://` são obrigatórias (a API valida no boot e **recusa subir** com configuração incompleta; leia a mensagem em `docker compose logs api`).
- `NEXT_PUBLIC_*` e `DPO_EMAIL` são **embutidos no build** do front: mudou o domínio ou o DPO → `scripts\deploy.ps1` (rebuild).
- O `.env.prod` fica fora do git (`.gitignore`). Faça uma cópia no cofre de senhas.

## 2. Cloudflare Tunnel
1. Cloudflare → **Zero Trust** → **Networks → Tunnels → Create a tunnel** → tipo *Cloudflared* → nome `marcaai`.
2. Copie o **token** (`eyJ...`) para `CLOUDFLARE_TUNNEL_TOKEN` no `.env.prod`. (Não precisa instalar nada: o container `cloudflared` do compose usa o token.)
3. Aba **Public Hostnames**:
   - `app.SEUDOMINIO` → Service `HTTP` → `web:3000`
   - `api.SEUDOMINIO` → Service `HTTP` → `api:8080`
4. Opcional (recomendado): proteger `api.SEUDOMINIO/hangfire` com **Cloudflare Access** (Zero Trust → Access → Applications → Self-hosted, política "seu e-mail"). O dashboard também exige que seu usuário esteja em `ADMIN_HANGFIRE_USER_IDS`.
5. SSL/TLS da zona: modo **Full**. O tráfego túnel → container é HTTP interno; a API confia no `CF-Connecting-IP` só de redes privadas.

## 3. Primeira subida
```powershell
powershell -ExecutionPolicy Bypass -File scripts\deploy.ps1 -NoPull
```
(Se quiser rodar `.\scripts\deploy.ps1` direto: `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`.)

O script constrói as imagens com tag = commit, sobe tudo, espera `/health/ready` da API e `/login` do web e, se falhar, volta para a versão anterior. Depois, confira:
```powershell
docker compose --env-file .env.prod -f docker-compose.prod.yml ps
curl https://api.SEUDOMINIO/health/ready   # Healthy (503 se banco/jobs fora)
```
Abra `https://app.SEUDOMINIO` no celular com 4G (fora da sua rede).

## 4. Serviços externos que apontam para a API
- **Stripe** (webhooks): `https://api.SEUDOMINIO/api/v1/webhooks/stripe` e `https://api.SEUDOMINIO/api/v1/webhooks/stripe/connect` → `STRIPE_WEBHOOK_SECRET` / `STRIPE_CONNECT_WEBHOOK_SECRET`. Use as **mesmas** versões de API do Stripe.net.
- **Google OAuth**: origem `https://app.SEUDOMINIO`, redirect `https://api.SEUDOMINIO/api/v1/auth/google/callback` e `https://api.SEUDOMINIO/api/v1/integrations/google-calendar/callback` (Google Agenda).
- **Mercado Pago** (se usar): `MP_REDIRECT_URI` e `MP_NOTIFICATION_URL` na API.

## 5. Backup (diário, criptografado, externo)
1. Gere o par de chaves **uma vez**, fora do PC de produção se possível:
   ```powershell
   docker run --rm --entrypoint age-keygen marcaai-backup:latest
   ```
   - A linha `# public key: age1...` vai em `BACKUP_AGE_RECIPIENT`.
   - A linha `AGE-SECRET-KEY-...` (privada) vai **só** no cofre de senhas e em uma cópia offline. **Sem ela os backups são inúteis.**
2. R2: crie o bucket (privado), um token de API S3 com permissão no bucket e preencha `R2_*` e `BACKUP_RCLONE_REMOTE=r2:NOME_DO_BUCKET`.
3. Teste agora, sem esperar a madrugada:
   ```powershell
   docker compose --env-file .env.prod -f docker-compose.prod.yml exec backup backup.sh
   ```
4. **Teste de restauração** (faça no primeiro dia e depois a cada trimestre):
   ```powershell
   # baixe o .dump.age do R2 (ou: docker compose cp backup:/backups/daily/ARQUIVO .\ ) e tenha a chave privada em um arquivo temporário
   powershell -ExecutionPolicy Bypass -File scripts\restore-backup.ps1 -Dump .\marcaai-AAAAMMDD-HHMMSS.dump.age -Identity .\age-key.txt
   ```
   Restaura em `marcaai_restore_test` (nunca em produção, salvo `-Force`) e imprime contagens de tabelas. Apague o arquivo da chave depois.

Retenção: 7 diários + 4 semanais (domingo) + 6 mensais (dia 01), tanto no volume local quanto no destino externo. O backup inclui as **chaves do Data Protection** (`*.keys.tar.age`): sem elas, tokens cifrados de vendedores e do Google ficam ilegíveis após restaurar.

> LGPD: o backup contém dados de saúde e é criptografado em repouso (age) antes de sair do container. Exclusões/anonimizações pedidas por titulares persistem nos backups até a rotação (≤ 6 meses); registre isso na política de retenção.

## 6. Windows 24/7 (🧑 uma vez, alguns passos pedem administrador)
- [ ] **Docker Desktop** → Settings → General: *Start Docker Desktop when you sign in*; *Use the WSL 2 based engine*.
- [ ] **Login automático** do Windows (sem ele o Docker Desktop só sobe após alguém entrar): `netplwiz` → desmarque "Os usuários devem digitar nome e senha" (ou use o Sysinternals *Autologon*, que guarda a senha criptografada). Alternativa mais robusta: Docker Engine direto no WSL2 iniciado pelo Agendador de Tarefas.
- [ ] **Energia**: Configurações → Sistema → Energia → "Nunca" suspender/hibernar quando na tomada. `powercfg /change standby-timeout-ac 0`
- [ ] **Windows Update**: defina *Horário ativo* amplo e evite reinício automático em horário de agendamentos (a stack volta sozinha: `restart: unless-stopped`).
- [ ] **BitLocker** ligado no disco (a base tem dados de saúde); guarde a chave de recuperação fora do PC.
- [ ] **Nobreak** (queda de energia derruba o atendimento) e, se possível, cabo de rede em vez de Wi-Fi.
- [ ] `.wslconfig` (opcional): `[wsl2] memory=4GB` para o WSL não consumir toda a RAM.
- [ ] Disco: monitore o espaço livre (volumes + imagens). `docker system df` e `docker image prune` periodicamente.

## 7. Monitoramento externo (🧑, gratuito)
Crie num serviço como UptimeRobot / Better Stack / Healthchecks.io:
- HTTP `https://api.SEUDOMINIO/health/ready` (a cada 5 min) e `https://app.SEUDOMINIO/login`.
- Alerta por e-mail e/ou Telegram. Assim você descobre quando o PC/internet cai.
- Backup: use um *heartbeat* (Healthchecks.io) chamado ao fim do backup, se quiser alerta de "backup não rodou".

## 8. Atualizar a versão
```powershell
powershell -ExecutionPolicy Bypass -File scripts\deploy.ps1      # git pull + build + up + health (volta sozinho se falhar)
powershell -ExecutionPolicy Bypass -File scripts\deploy.ps1 -Rollback   # volta para a última versão boa
```
