#!/usr/bin/env bash
# Testa scripts/scan-secrets.sh num repositório temporário. Os "segredos" são montados em tempo de execução
# (nada com formato real é gravado neste arquivo).
set -uo pipefail
SCAN="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/scan-secrets.sh"
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
cd "$TMP"; git init -q; git config user.email t@t; git config user.name t
rep() { printf "$1%.0s" $(seq 1 "$2"); }
pass=0; fail=0
expect() { # expect <código-esperado> <descrição>
  bash "$SCAN" --staged >/tmp/scan.out 2>&1; local rc=$?
  if [ "$rc" = "$1" ]; then pass=$((pass+1)); echo "  ok   $2"; else fail=$((fail+1)); echo "  FAIL $2 (rc=$rc, esperado $1)"; cat /tmp/scan.out; fi
  if grep -q "$(rep a 12)" /tmp/scan.out; then fail=$((fail+1)); echo "  FAIL $2: a saída reimprimiu o segredo"; fi
  git reset -q; rm -rf ./* .env* 2>/dev/null
}
add() { printf '%s\n' "$2" > "$1"; git add -f "$1"; }

add a.txt "nada de mais aqui";                                   expect 0 "texto comum passa"
add a.md  "use whsec_... e sk_test_xxx na doc";                  expect 0 "menção em documentação passa"
add a.cs  "const string S = \"whsec_integration_tests\";";       expect 0 "segredo de teste curto passa"
add a.txt "k=sk_live_$(rep a 24)";                               expect 1 "Stripe live"
add a.txt "k=sk_test_$(rep b 30)";                               expect 1 "Stripe test longa"
add a.txt "w=whsec_$(rep c 32)";                                 expect 1 "webhook secret"
add a.txt "AGE-SECRET-KEY-1$(rep Q 55)";                         expect 1 "chave age"
add a.txt "RESEND=re_$(rep d 8)_$(rep e 24)";                    expect 1 "Resend"
add a.txt "GOCSPX-$(rep f 28)";                                  expect 1 "Google client secret"
add a.txt "-----BEGIN RSA PRIVATE KEY-----"; expect 1 "chave privada PEM" # secret-scan:allow
add a.txt "T=eyJ$(rep g 120)";                                   expect 1 "token longo (túnel Cloudflare/JWT)"
add a.txt "k=sk_live_$(rep a 24) # secret-scan:allow";           expect 0 "marca secret-scan:allow libera a linha"
add .env "A=1";                                                  expect 1 "arquivo .env"
add .env.prod "A=1";                                             expect 1 "arquivo .env.prod"
add .env.example "A=";                                           expect 0 ".env.example passa"
add backup.dump "x";                                             expect 1 "dump .dump"
add chave.age "x";                                               expect 1 "arquivo .age"
head -c $((6*1024*1024)) /dev/zero > big.bin; git add big.bin;   expect 1 "blob > 5 MB"
echo "scan-secrets: $pass ok, $fail falha(s)"; [ "$fail" = 0 ]
