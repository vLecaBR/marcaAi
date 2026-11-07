# Segredos e chaves (F7)

Regra: **nenhum segredo no git**. Produção lê tudo do `.env` do compose (fora do repositório) ou de Docker secrets. Use `.env.example` como lista dos nomes.

## Gerar a chave do JWT (64 bytes aleatórios)
PowerShell:
```powershell
[Convert]::ToBase64String((1..64 | ForEach-Object { Get-Random -Maximum 256 }) -as [byte[]])
```
Prefira o gerador criptográfico:
```powershell
$b = New-Object byte[] 64; [System.Security.Cryptography.RandomNumberGenerator]::Fill($b); [Convert]::ToBase64String($b)
```
Git Bash: `openssl rand -base64 64`. Coloque o resultado em `Jwt__SigningKey` no `.env` de produção (a API não sobe com chave curta).

## Rotacionar tudo que já passou por Render/Vercel/Supabase
- [ ] `Jwt__SigningKey` (nova, gerada acima — invalida sessões antigas)
- [ ] Senha do Postgres (a do Supabase já foi resetada e não é mais usada)
- [ ] Stripe (`sk_`, `whsec_`), Mercado Pago (`ClientSecret`, `WebhookSecret`), Resend, Google (`ClientSecret`), Evolution (se usar)
- [ ] `DataProtection__KeysPath`: pasta em volume persistente **e incluída no backup** (cifra tokens de vendedores e do Google)

## Proxy / IP real
A API só confia em `CF-Connecting-IP` quando a conexão vem de rede interna (`Proxy__TrustedNetworks`, padrão: loopback e faixas privadas). O Next repassa o IP do usuário nas chamadas internas. Não exponha a API diretamente à internet sem o Cloudflare na frente.

## Variáveis desta fase
`DPO_EMAIL` (front, rodapé e política), `Privacy__PolicyVersion`, `Privacy__RetentionMonths` (24; 0 desliga), `Retention__Cron`, `Proxy__TrustedNetworks`.
