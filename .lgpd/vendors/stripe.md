# Operador: Stripe (cartão + assinaturas + Connect)

**Papel (LGPD):** operador dos dados de pagamento do paciente/profissional; o profissional é o controlador da consulta, o MarcaAí é operador do profissional e **controlador** dos dados de assinatura do próprio profissional.
**Última revisão:** 07/11/2026 (F5) · **Status:** rascunho — depende de conferência do dono.

## O que enviamos ao Stripe
| Dado | Titular | Onde |
|---|---|---|
| e-mail do paciente (`receipt_email`) | paciente | `StripeConnectService.CreateChargeAsync` |
| descrição `Consulta: <título do tipo>` | paciente (revela contratação de serviço de saúde) | idem |
| `bookingUid` (metadata) | paciente (pseudônimo) | idem |
| valor, moeda, conta conectada | — | idem |
| nome/e-mail/documentos (KYC) | profissional | coletados **direto pelo Stripe** (Account Link), não passam pelo MarcaAí |

## Pendências (dono)
- [ ] Aceitar/arquivar o **DPA do Stripe** (Dashboard → Settings → Legal) e guardar a versão aqui.
- [ ] Confirmar a entidade contratante e os **locais de tratamento** e o mecanismo de transferência — ver `.lgpd/transfers/stripe.md`.
- [ ] Decidir se a descrição enviada ao Stripe deve ser genérica ("Consulta") em vez do título do tipo (**minimização**, gap G22).
