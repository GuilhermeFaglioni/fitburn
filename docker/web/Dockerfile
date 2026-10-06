# Imagem do frontend (Vite/React PWA): build estático servido pelo Nginx, que
# também faz o proxy de /api para a API. Assim web e API ficam na MESMA origem
# (cookie de refresh sem CORS) e o Coolify só precisa expor um domínio.
# Contexto de build: a RAIZ do repositório (veja docker-compose.coolify.yml).

FROM node:22-bookworm-slim AS build
ENV COREPACK_HOME=/opt/corepack
WORKDIR /app
COPY package.json ./
RUN corepack enable && pnpm --version

COPY pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY packages/api/package.json packages/api/
COPY packages/contracts/package.json packages/contracts/
COPY packages/web/package.json packages/web/
RUN pnpm install --frozen-lockfile --filter "@fitburn/web..."

COPY tsconfig.base.json ./
COPY packages/contracts packages/contracts
COPY packages/web packages/web
RUN pnpm --filter @fitburn/contracts build && pnpm --filter @fitburn/web build

FROM nginx:1.27-alpine
COPY docker/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/packages/web/dist /usr/share/nginx/html
EXPOSE 80
HEALTHCHECK --interval=15s --timeout=3s --start-period=5s --retries=5 \
  CMD wget -q -O /dev/null http://127.0.0.1/healthz || exit 1
