# Checklist — Pivô Healthtech (Frontend Next.js)

Adaptação da experiência para profissionais da saúde (médicos, psicólogos, terapeutas,
nutricionistas, dentistas e clínicas). Foco: **confiança, segurança e sobriedade**.
Terminologia: *Agendamento → Consulta/Sessão*, *Cliente/Convidado → Paciente*.

> Escopo deste checklist: **textos, cores e copy**. A troca de dados (API .NET) é etapa
> separada. Nada aqui altera nomes de coluna/tabela do banco — só a camada visual.

---

## 1. Marca, metadados e logo

| Onde | Arquivo | O que mudar |
|---|---|---|
| Título/*template* e descrição | `app/layout.tsx` | `metadata.title` ("Marca AI") e `description` ("Agendamento inteligente para profissionais de alto padrão.") → copy voltada à saúde (ex.: "Agenda online para profissionais e clínicas de saúde"). |
| Nome exibido no logo | `components/ui/logo.tsx` | Texto "Marca AI" e ícone `CalendarCheck2` → considerar ícone mais clínico (ex.: `HeartPulse`, `Stethoscope`, `CalendarHeart`). |
| Remetente de e-mail | `auth.ts` (hardcoded) + `lib/email/resend.ts` | `from`/`FROM_EMAIL` com domínio e nome da marca de saúde. |

## 2. Landing page (`app/page.tsx`)

- **Badge/hero:** "Novo · Assistente de agenda com IA" e headline → mensagem de saúde ("Menos faltas, mais pacientes atendidos"). A copy de IA pode assustar em contexto clínico — suavizar ou remover.
- **Nav:** "Recursos / Planos / Dúvidas" pode manter; adicionar seção de **segurança/LGPD**.
- **Blocos de features** (ícones `Shield`, `Users`, `Zap`, `Globe`): recontextualizar para "Lembretes que reduzem no-show", "Prontuário/anamnese na pré-consulta", "Dados protegidos (LGPD)", "Telemedicina e presencial".
- **Prova social / confiança:** adicionar selo de segurança de dados, menção a sigilo profissional.
- **CTA** "Começar agora" → "Criar minha agenda" ou "Testar grátis".

## 3. Paleta de cores (sobriedade clínica)

Hoje o tema é **violeta**. Migrar para tons sóbrios de saúde (azul/teal/verde clínico).

| Token | Arquivo | Valor atual | Sugestão saúde |
|---|---|---|---|
| `--primary` (light) | `app/globals.css:21` | `#6d28d9` (violet-700) | teal/azul ex.: `#0f766e` (teal-700) ou `#0369a1` (sky-700) |
| `--primary` / sidebar (dark) | `app/globals.css` (bloco `.dark`) | oklch violeta | equivalente escuro do tom escolhido |
| Gradiente do hero | `app/page.tsx` | `from-violet-50/40 ... dark:from-violet-950/20` | `from-teal-50/40` / `sky` correspondentes |
| Badges/realces violeta | `app/page.tsx` | `bg-violet-100 text-violet-700 ...` | classes `teal`/`sky` equivalentes |
| **Default de marca** | `prisma/schema.prisma` (`brandColor @default("#7c3aed")`) **e** backend `Domain/Entities/User.cs` e `Team.cs` (`BrandColor = "#7c3aed"`) | violet-600 | novo default clínico (manter os dois lados sincronizados) |

> Como o projeto usa CSS variables + tokens Tailwind (`--color-primary: var(--primary)`),
> trocar `--primary` no `globals.css` propaga para botões, foco, sidebar etc. — mudança central.

## 4. Terminologia (Consulta/Sessão · Paciente)

Substituir "agendamento/reserva" por "consulta/sessão" e "cliente/convidado" por "paciente"
na copy visível. Arquivos com termos de UI a revisar:

- Público / booking: `components/booking/booking-form.tsx`, `booking-page-shell.tsx`, `time-slot-picker.tsx`, `cancel-form-client.tsx`, `app/(public)/[username]/page.tsx`, `app/(public)/[username]/[slug]/page.tsx`, `app/(public)/booking/[uid]/page.tsx`.
- Dashboard: `app/(dashboard)/dashboard/page.tsx`, `.../bookings/page.tsx`, `.../event-types/page.tsx`, `app/(dashboard)/layout.tsx`.
- Event types (rótulos "Tipo de evento" → "Tipo de consulta"): `components/event-types/event-type-form.tsx`, `event-type-card.tsx`, `event-type-list.tsx`.
- Onboarding: `components/onboarding/*` (perfil, disponibilidade) — copy para "profissional/consultório".
- E-mails: `emails/booking-confirmed.tsx`, `emails/booking-cancelled.tsx` e templates em `lib/email/templates.ts` → "Sua consulta com Dr(a). ...".
- WhatsApp: `lib/whatsapp/send.ts` (mensagens "agendamento" → "consulta").

> Sugestão: centralizar strings num dicionário (ex.: `lib/copy.ts`) para não caçar termo a termo e permitir ajuste por nicho (psicólogo usa "sessão", médico usa "consulta").

## 5. Campos de formulário orientados à saúde

- Formulário público de paciente: além de nome/e-mail/telefone, os `EventTypeQuestion` já suportam perguntas customizadas — usar para **motivo da consulta / convênio / primeira vez**. Rever placeholders em `components/event-types/event-type-form.tsx`.
- Perfil: `components/onboarding/step-profile.tsx` e `settings/profile` → adicionar **especialidade** e **registro profissional (CRM/CRP/CRO/CRN)** na copy (campo novo exige coluna futura — sinalizar no backend code-first).

## 6. Segurança e confiança (LGPD / dado sensível)

- Copy de rodapé/landing com política de privacidade e menção a **dado de saúde é sensível (LGPD art. 11)**.
- Página pública de agendamento: aviso de consentimento no envio de dados do paciente.
- (Backend, fora deste checklist visual) reforça o que já decidimos: cookie `HttpOnly`+`SameSite=Strict`, CSRF, e cuidado com logs — hoje o `auth.ts` e várias rotas logam e-mails/PII no console; **remover logs de PII** antes de produção.

---

### Ordem sugerida
1. `globals.css` (`--primary`) + `brandColor` default (impacto visual imediato e central).
2. `logo.tsx` + `layout.tsx` (metadados/marca).
3. Landing `app/page.tsx` (copy + cores).
4. Dicionário de termos → varredura Consulta/Paciente.
5. E-mails + WhatsApp.
6. Segurança/LGPD + remoção de logs de PII.
