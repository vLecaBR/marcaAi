# Teste de carga

Script sem dependências (`scripts/loadtest.mjs`, só Node 18+) que mede a API real em dois cenários:

| Cenário | O que faz | Passa se |
|---|---|---|
| **A — leitura pública** | N conexões durante X segundos em `GET /public/{usuário}`, `GET /slots` e `/health` | sem 5xx, sem 429, p95 ≤ 500 ms |
| **B — tempestade de agendamentos** | 30 pacientes em horários **diferentes** ao mesmo tempo, e 30 pacientes disputando **o mesmo** horário | todos os distintos criados; exatamente **1** vence a disputa; nenhum 5xx |

## Como repetir (contra as imagens de produção)
O limitador de requisições responde 429 de propósito; para o teste ele é ampliado, e a API roda em modo Development só para o seed (login por magic link lido do banco, pagamento simulado):

```bash
# override local (não versionado): API em Development + Fake + RateLimit__Multiplier=1000, sobre o compose de produção
docker compose --env-file .env.prod -f docker-compose.prod.yml -f compose.load.yml up -d --build postgres api web
node scripts/loadtest.mjs --api http://127.0.0.1:8080 --pg marcaai-postgres-1 --duration 20 --concurrency 50 --json docs/load/ultimo-resultado.json
docker compose ... down -v   # apaga o banco de teste
```
Exemplo do override (`compose.load.yml`): `services.api.environment` com `ASPNETCORE_ENVIRONMENT: Development`, `Payments__Provider: Fake`, `RateLimit__Multiplier: "1000"`, `Resend__ApiKey: ""`, `Smtp__Host: ""`.

## I2 — antes × depois do cache e do calendário em carga única (09/11/2026)
Mesma máquina, mesmo `loadtest.mjs` (cenário A agora inclui `GET /slots/month`), API em Release/Development contra um Postgres descartável, 50 conexões, 20 s. "Antes" = commit `eee83da` (fim da I1); "depois" = I2.

| Cenário A — leitura pública (perfil + horários do dia + calendário do mês + health) | Antes | Depois |
|---|---|---|
| Requisições/s | 166 | **2.723** |
| p50 / p95 / p99 | 39 / **1.096** / 2.367 ms | 10 / **53** / 76 ms |
| Erros | 0 | 0 |

| Cenário B — tempestade | Antes | Depois |
|---|---|---|
| 18 horários distintos | 18/18, p95 358 ms | 18/18, p95 393 ms |
| 30 no **mesmo** horário | 1 vencedor, 29 recusados, 0 5xx | 1 vencedor, 29 recusados, 0 5xx |

**Ressalva honesta:** parte do ganho vem de a mistura incluir o calendário do mês, que antes recalculava ~31 dias a cada chamada (consultas ao banco e ao Google por dia) e agora é uma carga só com cache de 30 s; o perfil público também passou a vir do cache (60 s). A escrita (cenário B) não mudou, como esperado (a diferença de p95 é ruído de uma máquina compartilhada com o Docker). Reproduzir: Postgres descartável em outra porta, API com `RateLimit__Multiplier=1000`, `Payments__Provider=Fake`, e `node scripts/loadtest.mjs --api ... --pg <container>`.

## Resultado de referência (08/11/2026, PC de desenvolvimento, Docker Desktop/WSL2)
Imagens de produção (`marcaai-api`, `marcaai-web`, Postgres 18), 50 conexões, 20 s:

| Medida | Resultado |
|---|---|
| API — leitura pública | **2.308 req/s**, p50 18 ms, **p95 46 ms**, p99 57 ms, 0 erros |
| 18 agendamentos simultâneos em horários distintos | 18/18 criados, p95 323 ms, 0 erros 5xx |
| 30 pacientes no **mesmo** horário | **1** criado, 29 recusados (409/422), 0 erros 5xx → sem double-booking sob carga |
| Página pública servida pelo Next (SSR), 30 conexões, 10 s | 131 req/s, p50 200 ms, **p95 302 ms**, p99 691 ms, 0 erros |
| Memória em repouso após a carga | web ~380 MB, api ~175 MB, postgres ~113 MB |

**Leitura do resultado:** a API sobra; o gargalo é a renderização da página no Next (~130 req/s), ainda muito acima do volume esperado de um consultório ou de dezenas de clínicas (centenas de visitas por dia, com picos de poucos por segundo). O Cloudflare pode cachear o que for estático. Limites: teste numa máquina só (cliente e servidor competem por CPU), sem latência de rede real e sem o túnel — repita no PC de produção após o deploy e antes do beta. O pool do Postgres/Hangfire não precisou de ajuste.
