#!/bin/sh
# Entrypoint da API no Coolify: aplica as migrations, garante os dados base
# (perfis, regras de pontuação e administrador inicial; idempotente) e, se
# DEMO_SEED=true, a massa de demonstração (idempotente, ~5s) antes de subir.
# Uma falha em qualquer passo derruba o contêiner: a versão anterior segue no ar.
set -eu
# Binários chamados direto (sem pnpm): o pnpm tenta verificar/reinstalar dependências
# e o usuário não-root da imagem não pode escrever em node_modules.
cd /app/packages/api

echo "[start] prisma migrate deploy"
./node_modules/.bin/prisma migrate deploy

echo "[start] seed base"
./node_modules/.bin/tsx prisma/seed.ts

if [ "${DEMO_SEED:-false}" = "true" ]; then
  echo "[start] seed da demonstração"
  node dist/demo-seed/cli.js
fi

echo "[start] iniciando a API"
exec node dist/main.js
