# Ambiente comum (worktree nova)

Repositório principal: `/Users/guilhermefaglioni/Documents/Development/Fitburn` (não edite lá; trabalhe só na sua worktree).

1. `.env`: a worktree nova não tem `.env` (é ignorado pelo git). Copie o da raiz principal para a raiz da sua worktree e, **somente na cópia**, troque o nome do banco em `DATABASE_URL_TEST` de `fitburn_test` para `fitburn_test_<slug-do-plano>` (ex.: `fitburn_test_p001`). Nunca imprima o conteúdo do `.env` no terminal ou em relatórios.
2. Banco de teste próprio (Postgres local de desenvolvimento, container `fitburn-postgres-1`):
   `docker exec fitburn-postgres-1 createdb -U fitburn fitburn_test_<slug>` (ignore o erro "already exists").
   Não toque nos bancos `fitburn` e `fitburn_test`, nem em nenhum banco remoto.
3. `pnpm install --frozen-lockfile` (exceto o plano 005, que altera o lockfile), `pnpm --filter @fitburn/contracts build`, `pnpm --filter @fitburn/api prisma:generate`, `pnpm --filter @fitburn/api prisma:migrate:test`.
4. Testes da API: `pnpm --filter @fitburn/api test` (sequencial; um arquivo: `pnpm --filter @fitburn/api exec vitest run test/<arquivo>`). Web: `pnpm --filter @fitburn/web test`.
5. Commits: mensagens em português no estilo do repo (`fix(api): ...`, `fix(web): ...`, `docs: ...`), commits locais na branch da worktree. Sem push, sem PR.
6. Ao final, atualize a linha do seu plano em `plans/auditoria-2026-10/README.md` **da sua worktree** para `DONE` e anote o hash do commit no topo do plano.
