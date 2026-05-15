# Spec 00: Foundation & Cleanup

## 1. Contexto e Objetivo
O repositório do projeto "MarcaAí" possui arquivos gerados automaticamente (relatórios HTML do Playwright, arquivos de cobertura de código do Vitest e dados de cache do Next.js) que estão sendo rastreados pelo Git indevidamente. Isso distorce as estatísticas de linguagem do projeto (exibindo mais de 50% de HTML em vez de focar no TypeScript) e polui o histórico de commits. 

O objetivo desta Spec é:
1. Remover esses arquivos inúteis do rastreamento do Git (sem deletá-los da máquina local).
2. Atualizar o arquivo `.gitignore` para bloquear esses arquivos definitivamente.
3. Criar uma esteira de Continuous Integration (CI) com GitHub Actions para automatizar a verificação de Linting, Testes e Build a cada Push/Pull Request na branch principal.

## 2. Arquivos Afetados
- `.gitignore` (Modificação)
- `.github/workflows/ci.yml` (Criação)

## 3. Instruções de Execução (Passo a Passo)

### Passo 3.1: Atualização do `.gitignore`
Adicione as seguintes linhas ao final do arquivo `.gitignore` existente para garantir que as pastas de relatórios e resultados de testes End-to-End não sejam versionadas:

```text
# testing reports
/coverage
/playwright-report
/test-results
/.last-run.json
report.json
```

### Passo 3.2: Remoção do Cache do Git (Arquivos Indesejados)
Execute os seguintes comandos no terminal, na raiz do projeto, para remover as pastas que já foram comitadas indevidamente. O uso do `--cached` garantirá que os arquivos continuem existindo no seu disco local, mas serão apagados do controle de versão do Git.

```bash
git rm -rf --cached playwright-report
git rm -rf --cached test-results
git rm -rf --cached coverage
git rm -rf --cached .next
```

### Passo 3.3: Criação da Esteira de CI (GitHub Actions)
Crie o arquivo `.github/workflows/ci.yml` (crie as pastas `.github` e `workflows` se elas ainda não existirem) e insira o código abaixo. Esta pipeline irá rodar em todos os Pushes ou Pull Requests direcionados à branch `main`.

```yaml
name: CI Pipeline

on:
  push:
    branches: ["main"]
  pull_request:
    branches: ["main"]

jobs:
  build-and-test:
    name: Build, Lint & Test
    runs-on: ubuntu-latest

    steps:
      - name: Checkout Repository
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: 'npm'

      - name: Install Dependencies
        run: npm ci

      - name: Run ESLint
        run: npm run lint

      - name: Run Unit Tests
        run: npm run test

      - name: Build Check
        run: npm run build
```

## 4. Critérios de Aceite
1. O comando `git status` deve mostrar modificações no `.gitignore` e deleções (deleted) para os arquivos que estavam nas pastas `playwright-report`, `test-results` e `coverage`.
2. O arquivo `.github/workflows/ci.yml` deve estar presente com as configurações exatas detalhadas no Passo 3.3.
3. Executar o comando `npm run lint` e `npm run test` localmente não deve apresentar nenhum erro bloqueante que quebre a pipeline.