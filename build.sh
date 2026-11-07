#!/usr/bin/env bash
# =============================================================================
# MarcaAí — validação local (build backend .NET + frontend Next.js).
# Uso:  ./build.sh            (build completo dos dois apps)
#       ./build.sh backend    (só o .NET)
#       ./build.sh frontend   (só o Next.js)
# Requer: dotnet SDK 10, Node 20+ / npm. Falha no primeiro erro.
# =============================================================================
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TARGET="${1:-all}"

build_backend() {
  echo "▶ Backend (.NET) — restore + build"
  cd "$ROOT/backend"
  dotnet restore
  dotnet build --no-restore -c Release
  # Testes (se existirem projetos de teste)
  if find tests -name '*Tests*.csproj' 2>/dev/null | grep -q .; then
    echo "▶ Backend — testes"
    dotnet test --no-build -c Release
  fi
  echo "✔ Backend OK"
}

build_frontend() {
  echo "▶ Frontend (Next.js) — install + typecheck/lint + build"
  cd "$ROOT/frontend"
  npm ci || npm install
  npx tsc --noEmit
  npm run lint --if-present
  npm run build
  echo "✔ Frontend OK"
}

case "$TARGET" in
  backend)  build_backend ;;
  frontend) build_frontend ;;
  all)      build_backend; build_frontend ;;
  *) echo "Alvo inválido: $TARGET (use: all | backend | frontend)"; exit 2 ;;
esac

echo "✅ Validação concluída ($TARGET)."
