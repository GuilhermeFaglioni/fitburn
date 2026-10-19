# Planos de correção — auditoria de 2026-10-18

Planos auto-contidos para corrigir os achados **Altos** e **Médios** da auditoria multiagente (relatórios de origem: api-security, api-logic, web, contracts-infra, docs-conformance). Cada plano pode ser executado por um agente sem contexto da conversa.

**Decisões válidas para todos os planos:**

- **Sobreposição de aulas:** vale a regra do Coolify. Aulas simultâneas são **permitidas** quando os professores são diferentes; o conflito continua proibido apenas para o **mesmo professor** (exclusion constraint por `instructorId`, como no código atual). O código não muda nesse ponto; a documentação é que passa a refletir a regra (plano 006).
- **Contraste branco sobre laranja (`#fff` em `#ed6e34`):** fora deste lote. É um trade-off de design registrado em `docs/design-fidelity-report.md`, e o port das telas segue o canvas pixel a pixel; mudar exige decisão de produto.
- Cada plano roda em worktree própria, faz commits locais na sua branch e **não** faz push nem abre PR.
- Testes da API exigem banco próprio por worktree (ver "Ambiente" em cada plano) — a suíte limpa as tabelas e não pode compartilhar o `fitburn_test` com outra worktree.

Verificação geral (raiz da worktree): `pnpm typecheck`, `pnpm test`, `pnpm build`; lint direcionado `pnpm exec eslint packages scripts eslint.config.mjs`.

| # | Título | Severidade | Área | Status |
|---|---|---|---|---|
| 001 | Autoelevação de privilégio (usuários e perfis) | HIGH | api | DONE |
| 002 | Corrida de escopo na edição/cancelamento/exclusão de aula | HIGH | api | DONE |
| 003 | Ciclo de vida de sessão (refresh atômico, reset, desativação) | MEDIUM | api | TODO |
| 004 | Sessão encerrada na web + erros da tela de Perfis | HIGH / MEDIUM | web | DONE |
| 005 | Infra: dependências vulneráveis, guarda de deploy Vercel, X-Forwarded-For | MEDIUM | infra | TODO |
| 006 | Documentação: regra de sobreposição e cenário do seed de demo | MEDIUM | docs | TODO |

Todos são independentes entre si. Conflitos de merge esperados são pequenos: 001 e 003 tocam funções diferentes de `packages/api/src/users/users.service.ts`.
