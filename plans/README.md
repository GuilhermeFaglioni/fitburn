# Planos de animação — Fitburn

Planos auto-contidos gerados por `improve-animations plan` a partir do relatório `find-animation-opportunities` (commit `d0cf723`). Cada arquivo pode ser executado por qualquer agente, sem contexto da conversa.

**Decisões válidas para todos os planos:** entradas por `@keyframes` (não `@starting-style`, por compatibilidade com Safari < 17.5); só entrada nos diálogos (a saída continua instantânea; follow-up); reduced motion gentil via tokens (fade fica, movimento some); só `transform` e `opacity`.

Verificação (a partir de `packages/web`): `pnpm typecheck`, `pnpm test`, `pnpm build`.

| # | Título | Severidade | Status | Depende de |
|---|---|---|---|---|
| 001 | Tokens de motion + reduced motion gentil | MEDIUM | DONE | — |
| 002 | Feedback de press | HIGH | DONE | 001 |
| 003 | Entrada do ClassDetailSheet | MEDIUM | DONE | 001 |
| 004 | Entrada do Modal admin | MEDIUM | DONE | 001 |
| 005 | Gaveta + scrim do AppMenu | MEDIUM | DONE | 001 |
| 006 | Resultado da reserva | LOW | DONE | 001 (003 recomendado) |
| 007 | Menu de ações da meta | LOW | DONE | 001 |
| 008 | Erro de login e Feedback | LOW | DONE | 001 |
| 009 | Gate de hover (opcional) | LOW | DONE | — |

**Ordem recomendada:** 001 → 002 → 003 → 004 → 005 → 006 → 007 → 008 → 009. Follow-ups registrados (fora de escopo): animação de saída de sheet/Modal/menu (exige atrasar o desmonte e ajustar `Modal.test.tsx`/`Layouts.test.tsx`); momento de celebração para "badge recém-conquistado" (depende de o app saber o que é novo).

## Notas

- Feel (320ms do sheet, atraso de 80ms do check, 150ms do menu) não se julga só pelo código; todo plano tem passo de feel-check em aparelho/10%.
