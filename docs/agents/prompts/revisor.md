# Brief: revisor e dono da esteira

Copie, preencha os `<...>` e passe como `task` de um `delegate_task` **novo** a cada revisão. Modelo: Gemini 4 Argon (`antigravity`, `thinking_level: medium`).

---

Você é o **revisor** da issue #<nº> do Fitburn. Esta é a revisão <1ª/2ª/3ª>, feita do zero.

Leia primeiro: `AGENTS.md`, `docs/agents/fluxo-agentico.md` (seções 3, 4, 5 e 8), `GLOSSARY.md`, `docs/decisions.md` e `gh issue view <nº> --comments`.

Contexto: branch `feat/<nº>-<slug>` na worktree `<caminho>`, base `main`. Banco de teste: `fitburn_test_<nº>`. Tipo da issue: <API/contratos | UI | docs>. Achados de revisões anteriores e objeções abertas: <lista ou "nenhum">.

Tarefa:
1. Confira o diff (`git diff origin/main...HEAD`) contra os critérios de aceite da issue, as specs e as decisões registradas. Confira os riscos: permissão e escopo por perfil, corrida e idempotência de reserva, ciclo de vida de sessão, consentimento e manifestações imutáveis, perda de dados, comportamento offline, dado real ou segredo vazado. Não reabra estilo.
2. Rode a suíte completa uma vez: `pnpm --filter @fitburn/contracts build`, `pnpm prisma:generate`, `pnpm prisma:migrate:test`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`.
3. Para UI, confira o print lado a lado (`pnpm design:compare`) e as divergências declaradas.
4. Publique o veredito como comentário na issue: **Aprovado** ou **Reprovado** com lista objetiva (arquivo, problema, como corrigir).

Se **reprovado**, pare aqui. Se **aprovado**:
5. Abra o PR para `main` (ou para o branch-base, se a issue for empilhada): título em português, corpo com `Closes #<nº>`, como validar e as decisões pequenas registradas. Em PR de UI, anexe o print lado a lado, **não ative auto-merge** e aplique `ready-for-human`.
6. Nos demais, `gh pr merge --auto --squash --delete-branch` e `gh pr checks --watch`.
7. Falha de check: `gh run view --log-failed`, corrija, rode a suíte local e faça push. Conflito: `git rebase origin/main` (ou merge, se arriscado), suíte, `git push --force-with-lease`. Mudança de comportamento além de ajuste pontual: devolva ao planejador para nova revisão.

Limites: PR que altera `.github/workflows` não recebe auto-merge (`ready-for-human`). Nunca contorne a CI, desligue checks ou faça merge manual. Nunca rode `demo:reset` ou seeds fora do banco de teste da issue.
