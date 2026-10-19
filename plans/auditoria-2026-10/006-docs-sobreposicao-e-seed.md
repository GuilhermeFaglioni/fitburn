# 006 — Documentação: regra de sobreposição de aulas e cenário do seed de demo

- **Status**: DONE
- **Commit**: `a02d98d`
- **Severity**: MEDIUM (classificado como Crítico/incerto pela auditoria porque docs e código divergiam)
- **Origem**: auditoria api-logic M1, docs-conformance (Crítico: sobreposição; Médio: seed vs checklist)
- **Escopo estimado**: `docs/requirements.md`, `docs/decisions.md`, `docs/open-decisions.md` (se aplicável), `docs/demo-script.md`, `docs/demo-data-checklist.md`, `docs/deploy-coolify.md`, `docs/test-matrix.md`, `CONTEXT.md` (se citar a regra)
- **Ambiente**: siga `plans/auditoria-2026-10/_ambiente.md` com slug `p006` (só documentação; não precisa de banco)

## Decisão já tomada (pelo responsável do produto)

**Aulas simultâneas são permitidas quando os professores são diferentes.** O conflito de agenda (`OCCURRENCE_OVERLAP`) continua proibido para o **mesmo professor**, garantido no banco pela exclusion constraint por `instructorId` (`packages/api/prisma/migrations/20261006120000_instructor_scoped_overlap/migration.sql`) e pela pré-validação em `packages/api/src/agenda/occurrences.service.ts`. `SCHEDULE_CONFLICT` é o conflito entre reservas sobrepostas do mesmo cliente. Essa regra de agenda já está descrita em `docs/deploy-coolify.md:81` e coberta por `packages/api/test/occurrences.e2e-spec.ts` (~206-227). **O código não muda.**

## Problema

1. Docs ainda afirmam a regra antiga de espaço exclusivo/sem sobreposição global: `docs/requirements.md:29-35`; `docs/demo-data-checklist.md:217,233`; `docs/demo-script.md:97-99,214` (promete garantia no banco e diz que `SCHEDULE_CONFLICT` não pode ser disparado pela interface). Não há decisão registrada em `docs/decisions.md` (última é D-036).
2. Seed de demo vs checklist: `docker/api/start.sh:17-20` roda o seed quando `DEMO_SEED=true` e `docs/deploy-coolify.md:12,49,56-59` recomenda isso, mas `docs/demo-data-checklist.md:3,7,27-46` diz que não existe seed e que o cadastro é manual; o seed (`packages/api/src/demo-seed/demo-data.ts`) cria outro cenário (uma modalidade "Personal Class" 60 min cap. 3, quatro professores, 14 clientes, senha única de demo) que não bate com as aulas R1/R2/F/X/S/LR/LR2/P, 7 modalidades e 8 templates do checklist/roteiro.

## Alvo

1. Registrar **D-037** em `docs/decisions.md` no formato das decisões existentes: contexto (espaço deixou de ser exclusivo; aulas simultâneas de professores diferentes), decisão, consequências (constraint por professor; conflito só para o mesmo professor; mensagens da API já dizem isso) e data 2026-10-18. Se `open-decisions.md` tiver item relacionado, marque como decidido apontando para D-037.
2. Atualizar `requirements.md`, `demo-script.md`, `demo-data-checklist.md`, `test-matrix.md` (linha de conflito de agenda) e `CONTEXT.md` (se citar a regra) para a regra nova. No roteiro, demonstrar a recusa de duas aulas do **mesmo professor** no mesmo horário (`OCCURRENCE_OVERLAP`), que professores diferentes podem ter aula simultânea e que duas reservas sobrepostas do mesmo cliente são recusadas com `SCHEDULE_CONFLICT`. Confirme na interface (código em `packages/web/src/pages/agenda/*`) se o conflito do mesmo professor é alcançável pela UI antes de afirmar no roteiro.
3. Seed: deixar explícito que existem **dois cenários**: (a) o seed automático (`DEMO_SEED=true`, Coolify) — documente o que ele cria (contas por papel sem senhas em texto, modalidade/template, professores, clientes, aulas), lendo `packages/api/src/demo-seed/*` e `packages/api/test/demo-seed.e2e-spec.ts`; e (b) a massa manual do checklist, usada pelo `demo-script.md`. Corrija a frase "não existe seed" e diga, no topo do checklist e do roteiro, qual cenário cada um pressupõe. Não altere o código do seed.

## Passos

1. Leia todos os documentos citados e o código de agenda/seed referido (apenas leitura de código).
2. Edite os documentos mantendo o tom, a língua (pt-BR) e a formatação de cada arquivo; mudanças mínimas e precisas, sem reescrever seções inteiras sem necessidade.
3. Rode `grep -rn -i "sobrepos\|espaço exclusivo\|SCHEDULE_CONFLICT" docs CONTEXT.md` e confirme que não sobrou afirmação da regra antiga.

## Boundaries

- Não altere nenhum código, migration, teste ou seed.
- Não "corrija" outros achados de docs fora deste plano (ex.: selo "Reservada" na agenda, seletor do Dashboard na matriz) — anote no relatório final como pendências baixas.
- Não exponha senhas reais ou de demo nos docs (refira-se a variáveis de ambiente).

## Aceitação

- D-037 registrada; nenhum documento afirma mais a regra de espaço exclusivo; cenário do seed descrito e separado do manual.
- Commit `docs: registra D-037 (aulas simultâneas) e separa o cenário do seed de demo`.
