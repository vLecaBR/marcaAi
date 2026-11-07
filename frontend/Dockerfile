# ==============================================================================
# MarcaAí — Frontend Next.js 16 (container de produção; orquestrado por docker-compose.prod.yml)
# Contexto de build = pasta `frontend/`.
#
# As variáveis NEXT_PUBLIC_* (e DPO_EMAIL, lida em páginas estáticas) são EMBUTIDAS no build:
# passe-as como build args (o compose faz isso a partir do .env.prod). Trocar o domínio = rebuild da imagem.
# API_INTERNAL_URL (http://api:8080) é de RUNTIME e nunca vai para o browser.
# ==============================================================================

# ---- dependências ----
FROM node:24-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# ---- build ----
FROM node:24-alpine AS build
WORKDIR /app
ARG NEXT_PUBLIC_API_URL=http://localhost:5080
ARG NEXT_PUBLIC_APP_URL=http://localhost:3000
ARG NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=
ARG DPO_EMAIL=
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL \
    NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL \
    NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=$NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY \
    DPO_EMAIL=$DPO_EMAIL \
    NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# ---- runtime (standalone: server.js mínimo, sem node_modules inteiro) ----
FROM node:24-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
COPY --from=build --chown=node:node /app/public ./public
USER node
EXPOSE 3000
CMD ["node", "server.js"]
