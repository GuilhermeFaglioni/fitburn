# AGENTS.md

Instruções para agentes de IA neste repositório (Fitburn). Comentários, issues e PRs em português.

- **Fluxo agêntico completo:** [`docs/agents/fluxo-agentico.md`](docs/agents/fluxo-agentico.md). Briefs por papel em [`docs/agents/prompts/`](docs/agents/prompts/).
- **Domínio:** leia [`GLOSSARY.md`](GLOSSARY.md) (glossário) e [`docs/decisions.md`](docs/decisions.md) antes de explorar. Use o vocabulário do glossário.
- **Issues e labels:** GitHub via `gh`; ver [`docs/agents/issue-tracker.md`](docs/agents/issue-tracker.md) e [`docs/agents/triage-labels.md`](docs/agents/triage-labels.md).
- **Monorepo pnpm:** `packages/contracts` (tipos compartilhados, buildar antes de API/web), `packages/api` (NestJS + Prisma + Vitest), `packages/web` (React + Vite, PWA).
- **Verificação:** `pnpm typecheck` e o teste do arquivo mexido enquanto trabalha; suíte completa (`pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`) só antes do PR. Setup local no `README.md`.
- **Regras duras:** sem push direto em `main`, sem contornar a CI, segredos só no `.env`, sem dado real de pessoas em testes/seeds/prints, nunca rodar `pnpm demo:reset` ou seeds fora do banco de teste da issue, sem deploy. Decisão de produto, arquitetura ou tela é do humano: pare e pergunte na issue com `needs-info`.
- **UI:** as decisões de design em `docs/decisions.md` e as issues de UI guiam o código; veja a seção 5 do fluxo agêntico.
