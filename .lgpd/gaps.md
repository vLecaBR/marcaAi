# Gaps LGPD e Plano de Remediação — MarcaAí

**Data:** 06/11/2026 · **Linha de base** (Pipeline C — híbrido) · Evidências do código; sem dados reais.
**Aviso:** análise técnica, não é aconselhamento jurídico. Itens jurídicos → advogado + encarregado (D13).
Severidade: 🔴 crítica · 🟠 alta · 🟡 média. Fase = fase do `PLANO_DE_LANCAMENTO.md`.

| ID | Sev. | Gap | Evidência | Norma | Fase |
|---|---|---|---|---|---|
| G01 | 🔴 | **Alegação "Conforme a LGPD" sem lastro** na landing e no checkout, e links para `/termos` e `/privacidade` que **não existem** (404). | `frontend/app/page.tsx:85,146,167`; `login/page.tsx:43-44`; `booking-form.tsx:307`; `booking/[uid]/page.tsx:389`; não há `app/termos` nem `app/privacidade` | Arts. 6º (transparência), 9º | F7 (e antes do go-live) |
| G02 | 🔴 | **Sem política de privacidade, termos, ROPA, RIPD, base legal documentada, encarregado** — tratamento de dado de saúde sem nenhum desses. | `.lgpd/` não existia | Arts. 9º, 37, 38, 41 | F7 |
| G03 | 🔴 | **Sem canal/endpoint de direitos do titular**: não há exportar/excluir/anonimizar paciente nem excluir conta (`MeController` só tem `PUT profile` e onboarding). | `MeController.cs` | Arts. 18, 19 (15 dias) | F4 |
| G04 | 🔴 | **Sem registro de consentimento/aviso** no agendamento público; `GuestNotes` (texto livre) e `booking_responses` coletam saúde sem base legal registrada. | `Booking.cs`, `BookingResponse.cs`; `booking-form.tsx` só tem frase "você concorda" | Arts. 8º, 11 | F4/F7 |
| G05 | 🔴 | **IDOR** `DELETE /payouts/{id}` (qualquer um desconecta conta alheia). | `PayoutsController.cs:114` | Art. 46 | F3 |
| G06 | 🔴 | **Magic link em log** se `Resend:ApiKey` ausente (tomada de conta). | `DependencyInjection.cs:95-98`, `LoggingMagicLinkSender.cs` | Art. 46 | F3 |
| G07 | 🟠 | **PII em logs**: e-mail e telefone em `LogError/LogInformation` e corpos de resposta de provedores (`{Body}`). | `NotificationService.cs:100,107`; `EvolutionWhatsAppSender.cs:19`; `LoggingEmailClient.cs:11`; `MercadoPago*Service.cs`; `GoogleCalendarService.cs` | Arts. 6º III/VII, 46 | F3 |
| G08 | 🟠 | **Retenção indefinida** em todas as atividades; sem job de anonimização/eliminação. | todas as tabelas | Arts. 15, 16 | F4/F7 |
| G09 | 🟠 | **Tokens OAuth do Google (`accounts`) possivelmente em texto puro**; sem criptografia em nível de aplicação. | `Account.cs` (RefreshToken/AccessToken/IdToken) | Art. 46 | F7 |
| G10 | 🟠 | **Sem DPA/avaliação de operadores** (Stripe, MP, Resend, Google, Cloudflare) e **sem base para transferência internacional**. | — | Arts. 33-36, 39; Res. 19/2024 | F5/F6 |
| G11 | 🟠 | **WhatsApp via Evolution API (não oficial)** envia dado de saúde (lembretes) por canal sem contrato/garantias. | `EvolutionWhatsAppSender.cs` | Arts. 6º, 46 | F6 (D8) |
| G12 | 🟠 | **Sem plano de resposta a incidentes** (prazo ANPD: 3 dias úteis) nem registro de incidentes. | — | Art. 48; Res. 15/2024 | F7/F9 |
| G13 | 🟠 | **Sem rate limiting; dashboard do Hangfire aberto.** | `Program.cs` | Art. 46 | F3/F7 |
| G14 | 🟠 | **Backups com dado pessoal**: dump do Supabase fora do repo sem prazo de descarte nem cópia criptografada; banco de dev com dado real. | `C:\Code\marcaAi-backup\*.dump`; dev DB | Arts. 6º VII, 46 | F1 (dev), F9 |
| G15 | 🟡 | **Escopos OAuth sensíveis (Calendar) já no login** — minimização. | `Program.cs` AddGoogle | Art. 6º III | F6 |
| G16 | 🟡 | **Sem audit log** de acesso a dados de paciente. | — | Art. 6º X | F7 |
| G17 | 🟡 | **Sem verificação de idade**; pacientes menores possíveis → avaliar Art. 14 / ECA Digital. | — | Art. 14; Lei 15.211/2025 | F7 |
| G18 | 🟡 | **Sem testes** de segurança/DSAR/consentimento. | 0 testes no backend | Art. 46 | F8 |
| G19 | 🟡 | **Supabase/Vercel/Render ainda existem** com dados e credenciais antigas. | plano F10 | Arts. 15, 46 | F10 |

| G20 | ✅ V2 | **Detalhe e cancelamento de consulta anônimos por `uid` (CUID v1, previsível)** — expõe nome/e-mail do paciente a quem adivinhar. | `BookingsController.GetByUid/Cancel`; plano §2 #16 | Art. 46 | F7 |
| G21 | ✅ V2 | **CSRF: antiforgery nunca validado**; só SameSite=Lax protege. | plano §2 #17 | Art. 46 | F7 |

**Atualização F3 (06/11/2026):** G05 (IDOR) ✅ corrigido e testado · G06 (magic link em log) ✅ fail-fast em produção · G07 (PII em logs) ✅ removida (corpo de provedores só em Debug; senders simulados sem PII em Information) · G13 parcial (Hangfire protegido; rate limiting segue na F7).

**Atualização V2 (08/11/2026):** G20 e G21 fechados — o uid público da consulta passou a ser aleatório de 128 bits (antes: CUID previsível) e a API bloqueia requisições que alteram estado vindas de outra origem quando há cookie de sessão. Novo tratamento: a tabela `error_events` (erros inesperados) **não** guarda dado pessoal (sem usuário, corpo ou querystring; e-mails e números longos mascarados; retenção de 30 dias) e o painel `/admin` só mostra dados agregados, restrito a `ADMIN_USER_IDS`. Testes cobrem a ausência de e-mail no painel e a limpeza das mensagens.

**Atualização V1 (07/11/2026):** a nova lista de pacientes é derivada das consultas (mesma finalidade, só o próprio profissional vê — coberto por teste de isolamento) e a anonimização existente continua valendo; os e-mails de pagamento/remarcação não trazem dado de saúde além do título do serviço; os atalhos do pagamento simulado respondem 404 fora do modo Fake. Sem prontuário (D16), portanto sem novo dado sensível.

**Atualização F8 (07/11/2026):** testes automatizados passaram a cobrir o consentimento gravado (data + versão), exportar/anonimizar paciente, excluir conta, o job de retenção (anonimização, limpeza de tokens/eventos, cifra de tokens do Google) e o isolamento entre profissionais (nenhum acessa dado de paciente de outro). Ver `docs/testing.md`.

**Atualização F7 (07/11/2026):**
- G01 🟡: `/privacidade` e `/termos` publicadas como **versão preliminar** e alegações "Conforme a LGPD" removidas; falta revisão jurídica.
- G08 ✅ (técnico): job diário anonimiza consultas > 24 meses (provisório) e limpa tokens/eventos efêmeros; prazo final depende do advogado.
- G09 ✅: tokens do Google cifrados em repouso (Data Protection; legados cifrados pelo job).
- G13 ✅: rate limiting nas rotas públicas e sensíveis.
- G02/G10-G12/G14: seguem abertos (encarregado, RIPD/ROPA, descarte do dump).

**Atualização F6 (07/11/2026):**
- Minimização: o **login** com Google não pede nem guarda tokens/escopos de Calendar; a agenda é opt-in e revogável (revoga no Google ao desconectar).
- Segurança (Art. 46): e-mails com dados de terceiros agora escapam HTML (corrigida injeção de HTML por nome/título/motivo).
- Aberto: G09 (tokens do Google em texto em `accounts`) e limpeza de `verification_tokens` expirados → F7.

**Atualização F5 (07/11/2026):**
- **G22 (novo, 🟡):** a *descrição* enviada a Stripe/Mercado Pago é `Consulta: <título do tipo>` — pode revelar contratação de serviço de saúde. Sugestão: descrição genérica. Decisão do dono.
- **G23 (novo, 🟠):** DPA/termos com Stripe e Mercado Pago ainda não arquivados e mecanismo de transferência internacional do Stripe não confirmado (`.lgpd/vendors/`, `.lgpd/transfers/`).
- Tokens OAuth do vendedor Mercado Pago agora **cifrados** (Data Protection); a chave precisa persistir (`DataProtection:KeysPath`) e entrar no backup (F9).
- `processed_webhook_events` guarda só (provedor, id do evento, data) — sem dado pessoal; limpeza periódica entra na F7.

**Atualização F4 (06/11/2026):**
- G03 (canal do titular) 🟡 **parcial**: endpoints e tela `/settings/privacy` para exportar/anonimizar paciente e exportar/excluir conta (prazo imediato, Art. 19). Falta: canal para o **paciente** pedir direto (hoje o pedido passa pelo profissional, que é o controlador), registro dos pedidos e fluxo de correção.
- G04 (consentimento) 🟡 **parcial**: checkbox obrigatório no formulário + `ConsentAt`/`ConsentVersion` gravados no booking (versão `rascunho-2026-11` até a política revisada). Falta: **texto jurídico revisado** e a página `/privacidade` (G01 segue aberto).
- G08 (retenção) segue **aberto** — sem job nem prazos (F7, depende do advogado).
- Novo dado pessoal do profissional: especialidade, conselho, nº de registro, clínica (A003).
- Efeito colateral positivo: o cancelamento deixou de aceitar o papel `OWNER` vindo do corpo anônimo (decidido pela identidade autenticada).

**Atualização I1 (09/11/2026):** revisão técnica dos logs. (1) A `Message` de erros do Postgres inclui o `DETAIL` com valores de colunas (e-mail, por exemplo); log e `error_events` agora usam `SafeException` (código, texto-base e restrição) — teste cobre. (2) O log JSON não imprime escopos (o `RequestPath` leva o uid da consulta) e o erro 500 registra o **template** da rota, não o caminho real. (3) Novo: pre-commit e `verify` barram segredos/dumps no git. Aberto (baixo): `uid` ainda aparece em alguns avisos de log — ver `PENDENCIAS.md`.

Totais: 6 críticos · 8 altos · 5 médios.

## Ações imediatas (alto retorno, baixo esforço)
1. **G01:** até haver revisão jurídica, remover/atenuar "Conforme a LGPD" da landing **ou** publicar rascunho de `/privacidade` e `/termos` (sem 404). Decisão do dono.
2. **G05/G06/G07** entram na F3 (já planejada).
3. **G14:** definir prazo para descartar o dump do Supabase e o banco de dev com dados reais (sugestão: ao validar a F1, apagar o volume de dev ou anonimizar).
4. **D13:** definir encarregado e advogado.
