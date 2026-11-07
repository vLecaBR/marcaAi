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

Totais: 6 críticos · 8 altos · 5 médios.

## Ações imediatas (alto retorno, baixo esforço)
1. **G01:** até haver revisão jurídica, remover/atenuar "Conforme a LGPD" da landing **ou** publicar rascunho de `/privacidade` e `/termos` (sem 404). Decisão do dono.
2. **G05/G06/G07** entram na F3 (já planejada).
3. **G14:** definir prazo para descartar o dump do Supabase e o banco de dev com dados reais (sugestão: ao validar a F1, apagar o volume de dev ou anonimizar).
4. **D13:** definir encarregado e advogado.
