Você vai continuar o desenvolvimento do **MarcaAí**, um SaaS de agenda e recebimento para profissionais de saúde (Brasil). O repositório está em `C:\Code\marcaAi` (Windows 11, remoto `https://github.com/vLecaBR/marcaAi`, branch `main`). Você não tem memória de conversas anteriores: **todo o contexto está no repositório**.

## Primeiro passo (antes de qualquer alteração)
1. Leia `CLAUDE.md` (regras permanentes, comandos, arquitetura e estado atual).
2. Leia `PLANO_INTERNO.md` (o plano que você vai executar) e `PENDENCIAS.md`.
3. Passe os olhos em `docs/verificacao-ponta-a-ponta.md`, `docs/testing.md` e nos registros de execução do `PLANO_DE_VENDA.md`.
4. Rode `git status` e `git log --oneline -15`. Rode `./build.sh` (o Docker Desktop precisa estar aberto; se não estiver, `CLAUDE.md` diz como iniciar) para confirmar que a base está verde **antes** de mexer.

## Sua missão
Executar o `PLANO_INTERNO.md`, **fase por fase (I1 → I6)**: melhorar a estrutura e a funcionalidade da plataforma **sem depender de contas externas**. Não configure nem tente configurar Stripe, Resend, Google, Mercado Pago, Cloudflare, domínio ou jurídico — isso é do dono e está nas `PENDENCIAS.md` (V3–V5). Tudo deve ser provado com Postgres local, Mailpit, pagamento simulado (`Payments:Provider=Fake`) e e-mail capturado em teste.

## Como trabalhar (regras do dono)
- **Uma fase por vez.** Em cada fase: planeje os passos (mantenha uma lista de tarefas), implemente, **escreva testes** (unitário, integração e E2E onde fizer sentido), rode `./build.sh` e o E2E (`cd frontend && npx playwright test`), marque os checkboxes do `PLANO_INTERNO.md`, preencha o registro de execução (§3) e **pare e reporte**: o que foi feito, como foi verificado, desvios, bugs encontrados e o que ficou pendente. **Só avance para a próxima fase quando o dono disser "pode seguir".**
- **Vários commits pequenos** durante a fase (`feat:`, `fix:`, `test:`, `docs:`, `chore:`), cada um terminando com a linha `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>` (ou o modelo que você for). **Não faça push** a menos que o dono peça (ele costuma pedir "faça push no final"). Trabalhe direto na `main`.
- **Nunca** commite segredos (`.env*`, chaves, user-secrets) nem dumps de banco. Não leia nem imprima dados reais de pacientes.
- **LGPD sempre**: dados de saúde são sensíveis. Use as skills em `.claude/skills/lgpd-*` quando a fase tocar em dado pessoal, e atualize `.lgpd/gaps.md`.
- **Decisões do dono (🧑)**: pergunte antes, com uma recomendação (a lista inicial está na §2 do plano). Se algo for baixar arquivo/imagem de fonte nova, peça autorização. Se encontrar problema fora do escopo, registre em `PENDENCIAS.md` e avise.
- **Seja honesto**: diga claramente o que **não** foi verificado. Se um teste falhar, mostre a falha; não esconda nem enfraqueça o teste para passar. Testes instáveis (principalmente E2E) devem ser investigados, não repetidos até passar.
- Antes de adicionar dependência, confira a versão atual. Mantenha a stack (Next.js 16, .NET 10, Postgres 18).
- Atenção ao ambiente: PowerShell/Git Bash no Windows. Heredocs com aspas complicadas falham — escreva arquivos com a ferramenta de escrita. Scripts `.ps1` precisam de UTF-8 com BOM. Pare API/Next antes de `dotnet build`.

## Por onde começar
Comece pela **I1 — Fundação de engenharia** (verificação única com `scripts/verify.sh`, hooks, `/health/ready`, logs estruturados, higiene). Ela é pré-requisito de segurança para as demais. Ao terminar a I1, reporte e aguarde o "pode seguir" para a I2.

Se o dono pedir outra ordem (por exemplo, começar pela agenda visual da I3, que é a maior melhoria para o usuário final), siga o pedido dele.

Quando terminar de ler o contexto, responda com: (a) um resumo de 5 linhas do que entendeu do projeto e do estado atual; (b) o estado do `./build.sh`; (c) o plano de passos da I1. Só então comece a implementar.
