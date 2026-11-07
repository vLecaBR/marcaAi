# Operador: Mercado Pago (PIX com split)

**Papel (LGPD):** operador dos dados de pagamento do paciente; o profissional (vendedor) conecta a própria conta via OAuth.
**Última revisão:** 07/11/2026 (F5) · **Status:** rascunho.

## O que enviamos ao Mercado Pago
| Dado | Titular | Onde |
|---|---|---|
| e-mail do paciente (`payer.email`) | paciente | `MercadoPagoSplitService.CreateChargeAsync` |
| descrição `Consulta: <título>` | paciente | idem |
| `external_reference` = uid do booking | paciente (pseudônimo) | idem |
| tokens OAuth do vendedor | profissional | **guardados cifrados** (Data Protection) em `payout_accounts` — nunca em log |

## Pendências (dono)
- [ ] Aceitar/arquivar os termos de tratamento de dados do Mercado Pago aplicáveis a integradores e guardar a versão aqui.
- [ ] Confirmar no contrato onde os dados são tratados (Mercado Pago opera no Brasil).
- [ ] Mesma decisão de minimização da descrição (G22).
