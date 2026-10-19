# 002 — Corrida de escopo na edição, cancelamento e exclusão de aula

- **Status**: TODO
- **Commit**: —
- **Severity**: HIGH
- **Origem**: auditoria api-logic A1
- **Escopo estimado**: `packages/api/src/agenda/occurrences.service.ts`, `packages/api/test/occurrences.e2e-spec.ts`
- **Ambiente**: siga `plans/auditoria-2026-10/_ambiente.md` com slug `p002`

## Problema

Em `OccurrencesService` a autorização por escopo é feita **antes** do lock da linha:

- `update` (`occurrences.service.ts:~115-159`): `findScheduledInScope` e `assertInScope(instructorId, …)` rodam fora da transação; `instructorId` é calculado a partir de `current` (lido antes do lock) e é **sempre** gravado no `updateMany`. Se um admin reatribui a aula da professora A para B entre a leitura e o lock, o PATCH de capacidade da A passa e ainda devolve a aula para A.
- `cancel` (`:~162-180`) e `delete` (`:~187-219`): escopo checado só antes do lock; depois da reatribuição a professora anterior ainda cancela/exclui.

Referência: `docs/mvp-web-pwa.md:202-209` (escopos, incluindo "aulas atribuídas"). O teste atual (`occurrences.e2e-spec.ts:~526-549`) cobre só o caso sequencial.

## Alvo

Dentro da transação, **depois** de `lockAndCountConfirmed` / `lockOccurrenceRows` (FOR UPDATE), revalidar sobre a linha relida:

- existência e `status` (o que já acontece hoje via `updateMany` condicional / `count === 0`);
- escopo do solicitante contra o `instructorId` **da linha bloqueada** (mesma regra de `assertInScope`), lançando o mesmo `DomainError` `OUT_OF_SCOPE` 403 de hoje;
- em `update`: quando `input.instructorId` vier `undefined`, gravar o `instructorId` **da linha bloqueada** (ou simplesmente não incluir `instructorId` no `data`); quando vier, manter as validações atuais (`assertIsInstructor`, escopo do novo valor).

A pré-checagem fora da transação pode continuar (resposta rápida e `assertNoOverlap`), mas a decisão final é a de dentro do lock. A sobreposição continua por professor (regra vigente — ver README): se `instructorId` final difere do que foi usado em `assertNoOverlap`/`withOverlapTranslation`, garanta que a checagem/tradução de conflito usa o valor final.

## Passos

1. Leia o serviço inteiro (incluindo `findScheduledInScope`, `findInScope`, `assertInScope`, `lockAndCountConfirmed`, `withOverlapTranslation`) e os testes de ocorrências.
2. Teste e2e determinístico de corrida (red primeiro). Sugestão: simule a reatribuição **entre** a pré-checagem e o lock sem depender de timing — por exemplo, abra uma transação no teste que faz `SELECT … FOR UPDATE` na ocorrência, dispare o PATCH/cancel/delete da professora A (que vai ficar bloqueado no lock), reatribua a aula para B dentro da transação do teste e faça commit; a requisição da A deve terminar com **403 OUT_OF_SCOPE** e a aula deve continuar com B e inalterada. Se preferir outro mecanismo determinístico já usado no repo (procure testes de concorrência em `reservations.e2e-spec.ts`), siga-o. Cubra editar, cancelar e excluir.
3. Implemente a revalidação dentro das três transações.
4. Rode `occurrences.e2e-spec.ts`, depois a suíte inteira da API, `pnpm typecheck` e lint direcionado.

## Boundaries

- Não mude a regra de sobreposição (por professor) nem a migration da constraint.
- Não mude contratos nem mensagens de erro existentes.
- Não toque no motor de reservas além do necessário.

## Aceitação

- Testes de corrida falham antes e passam depois; suíte da API verde.
- Commit `fix(api): revalida escopo da aula depois do lock`.
