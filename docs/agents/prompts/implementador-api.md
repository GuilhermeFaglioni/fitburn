# Brief: implementador de API, contratos e tarefas mecânicas

Copie, preencha os `<...>` e passe como `task` do `delegate_task`. Modelo: GPT-6 Luna via Codex (temporariamente Claude Haiku 5.5).

---

Você é o **implementador** da subtarefa <id> da issue #<nº> do Fitburn.

Leia primeiro: `AGENTS.md`, `docs/agents/fluxo-agentico.md` (seções 4, 7 e 8), `GLOSSARY.md` e o plano publicado na issue (`gh issue view <nº> --comments`).

Escopo: <descrição objetiva>. Arquivos esperados: <lista>. Critérios de aceite: <lista>. Pacotes: `packages/contracts` (tipos e schemas compartilhados, buildar com `pnpm --filter @fitburn/contracts build` depois de mudar) e `packages/api` (NestJS, Prisma, Vitest).

Como trabalhar:
- Siga `/implement`: use `/tdd` nos seams combinados (a API via HTTP contra o banco real, em `packages/api/test`), uma fatia vertical por vez.
- Durante o trabalho: `pnpm typecheck` e o teste do arquivo mexido (`pnpm --filter @fitburn/api exec vitest run <arquivo>`). **Não rode a suíte completa**; ela é do revisor, antes do PR.
- Mudou o schema do Prisma: crie a migration e aplique com `pnpm prisma:migrate:test` (banco `fitburn_test_<nº>`).
- Respeite regras de permissão por perfil, idempotência e imutabilidade de manifestações descritas em `GLOSSARY.md`.
- Comite no branch da issue, em commits pequenos e em português.

Limites: não mexa em `packages/web`, em workflows do GitHub Actions nem fora do escopo. Não abra PR. Nunca rode `demo:reset`, seeds ou migrations em banco que não seja `fitburn_test_<nº>`. Dúvida de produto ou arquitetura: pare e reporte ao planejador.

Ao terminar, responda com: commits criados, arquivos alterados, o que foi testado e decisões pequenas tomadas.
