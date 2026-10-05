# 004 — Entrada do `Modal` administrativo

- **Status**: DONE
- **Commit**: d0cf723
- **Severity**: MEDIUM
- **Category**: Missed opportunities (jarring change)
- **Estimated scope**: 1 arquivo (`packages/web/src/styles/admin.css`), ~6 linhas
- **Depende de**: 001

## Problem

Todos os diálogos admin (criar/editar/excluir usuário, perfil, reserva etc.) usam `Modal.tsx` e surgem de uma vez:

```css
/* packages/web/src/styles/admin.css:595 — current */
.fb-modal-backdrop { position: fixed; inset: 0; z-index: 10; background: rgba(10, 10, 10, 0.55); display: flex; align-items: center; justify-content: center; padding: 16px; }
.fb-modal { width: 460px; max-width: 100%; max-height: 100%; overflow: auto; box-sizing: border-box; background: #ffffff; color: var(--color-ink-on-light); border-radius: var(--radius-sm); padding: 28px; display: flex; flex-direction: column; gap: 16px; }
```

Frequência: ocasional (equipe). Modal é centralizado: `transform-origin: center`.

## Target

```css
.fb-modal-backdrop { animation: fb-fade 180ms var(--ease-out) both; }
.fb-modal { animation: fb-enter 200ms var(--ease-out) both; transform-origin: center; }
```

(Usa `--enter-shift: 6px` e `--enter-scale: 0.96`; reduced motion → só fade.)

## Repo conventions to follow

Mesma abordagem do plano 003 (keyframes de `global.css`). Exemplar: `.fb-sheet`/`.fb-sheet-backdrop` após o plano 003.

## Steps

1. Em `admin.css`, adicionar a `animation` ao `.fb-modal-backdrop` (linha ~595) e ao `.fb-modal` (~606).
2. Verificar que nenhuma outra folha redefine `.fb-modal` (`grep -rn "fb-modal" src/styles`): se redefinir `animation`, parar e reportar.

## Boundaries

- Sem animação de saída; não editar `Modal.tsx`, `useDialogFocus`, nem `Modal.test.tsx`.
- Não aplicar a nenhum outro overlay (`app-menu__scrim` é o plano 005).

## Verification

- **Mechanical**: `pnpm typecheck`, `pnpm test` (`Modal.test.tsx`, `UsersPage.test.tsx`, `ClientsPage.test.tsx`), `pnpm build`.
- **Feel check**: em `/usuarios`, "Novo usuário": cartão branco entra com fade+leve escala em 200ms, backdrop em 180ms; foco continua no primeiro campo; abrir dois diálogos em sequência funciona. 10% de playback: sem flash. Reduced motion: só fade.
- **Done when**: qualquer `Modal` anima na entrada; testes verdes.


