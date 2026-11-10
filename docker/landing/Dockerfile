# Imagem da landing (Astro estático): build no Node e servida pelo Nginx.
# Contexto de build: a RAIZ do repositório (veja docker-compose.coolify.yml).
# A landing importa packages/web/src/styles/tokens.css, por isso o arquivo é copiado no mesmo caminho relativo.

FROM node:22-bookworm-slim AS build
ENV COREPACK_HOME=/opt/corepack
WORKDIR /app
COPY package.json ./
RUN corepack enable && pnpm --version

COPY pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY packages/api/package.json packages/api/
COPY packages/contracts/package.json packages/contracts/
COPY packages/landing/package.json packages/landing/
COPY packages/web/package.json packages/web/
RUN pnpm install --frozen-lockfile --filter "@fitburn/landing..."

COPY packages/landing packages/landing
COPY packages/web/src/styles/tokens.css packages/web/src/styles/tokens.css

ARG PUBLIC_SITE_URL=https://site.fitburn.faglionidev.com
ARG PUBLIC_INDEXABLE=false
ARG PUBLIC_UMAMI_SRC=
ARG PUBLIC_UMAMI_WEBSITE_ID=
ENV PUBLIC_SITE_URL=$PUBLIC_SITE_URL \
    PUBLIC_INDEXABLE=$PUBLIC_INDEXABLE \
    PUBLIC_UMAMI_SRC=$PUBLIC_UMAMI_SRC \
    PUBLIC_UMAMI_WEBSITE_ID=$PUBLIC_UMAMI_WEBSITE_ID
RUN pnpm --filter @fitburn/landing build

FROM nginx:1.27-alpine
# A imagem oficial renderiza /etc/nginx/templates/*.template com envsubst; o filtro evita que ele coma o $uri.
COPY docker/landing/nginx.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /app/packages/landing/dist /usr/share/nginx/html
ENV ANALYTICS_ORIGIN="" \
    ROBOTS_TAG="noindex, nofollow" \
    NGINX_ENVSUBST_FILTER="^(ANALYTICS_ORIGIN|ROBOTS_TAG)$"
EXPOSE 80
HEALTHCHECK --interval=15s --timeout=3s --start-period=5s --retries=5 \
  CMD wget -q -O /dev/null http://127.0.0.1/healthz || exit 1
