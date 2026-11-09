#!/usr/bin/env bash
# Instala os hooks versionados em .githooks/ (pre-commit: segredos; pre-push: verify --fast).
# Desinstalar: git config --unset core.hooksPath
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"
chmod +x .githooks/* scripts/*.sh 2>/dev/null || true
git config core.hooksPath .githooks
echo "Hooks instalados (core.hooksPath=.githooks): pre-commit = scan-secrets --staged · pre-push = verify --fast"
