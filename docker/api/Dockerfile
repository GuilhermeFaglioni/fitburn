# Imagem da API (NestJS + Prisma), construída a partir do monorepo pnpm.
# Contexto de build: a RAIZ do repositório (veja docker-compose.prod.yml).
#
# A mesma imagem serve a três usos, com comandos diferentes:
#   - api:      node packages/api/dist/main.js        (CMD padrão)
#   - migrate:  prisma migrate deploy                  (serviço "migrate" do Compose)
#   - operação: pnpm demo:reset, via `docker compose exec/run` (runbook)
#   - coolify:  sh docker/api/start.sh (migrate + seed + API; docker-compose.coolify.yml)
# Por isso ela mantém as devDependencies (prisma CLI e tsx). É maior que uma
# imagem só de runtime, mas evita manter duas imagens para uma demo.

FROM node:22-bookworm-slim

# Toolchain só como rede de segurança caso o binding nativo do argon2 não tenha
# binário pré-compilado para a plataforma (aí ele compila no install).
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ ca-certificates \
  && rm -rf /var/lib/apt/lists/*

# pnpm na versão de "packageManager" do package.json, baixado uma vez para um
# local legível pelo usuário não-root que roda a API.
ENV COREPACK_HOME=/opt/corepack
WORKDIR /app
COPY package.json ./
RUN corepack enable && pnpm --version && chmod -R a+rX /opt/corepack

# Camada de dependências: só manifestos, para o cache sobreviver a mudanças de código.
COPY pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY packages/api/package.json packages/api/
COPY packages/contracts/package.json packages/contracts/
COPY packages/web/package.json packages/web/
RUN pnpm install --frozen-lockfile --filter "@fitburn/api..."

COPY tsconfig.base.json ./
COPY packages/contracts packages/contracts
COPY packages/api packages/api

# O prisma.config.ts exige DATABASE_URL até para gerar o client; o valor abaixo
# é só de build (nada conecta) e não vira configuração da imagem.
RUN pnpm --filter @fitburn/contracts build \
  && DATABASE_URL="postgresql://build:build@localhost:5432/build" pnpm --filter @fitburn/api prisma:generate \
  && pnpm --filter @fitburn/api build

COPY docker/api/start.sh /app/docker/api/start.sh

ENV NODE_ENV=production \
    PORT=3333 \
    HOME=/home/node
USER node
EXPOSE 3333
CMD ["node", "packages/api/dist/main.js"]
