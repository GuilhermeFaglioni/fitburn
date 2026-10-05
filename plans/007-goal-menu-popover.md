# 007 — Menu de ações da meta (kebab)

- **Status**: DONE
- **Commit**: d0cf723
- **Severity**: LOW
- **Category**: Physicality & origin
- **Estimated scope**: 1 arquivo (`packages/web/src/styles/goals.css`), ~4 linhas
- **Depende de**: 001

## Problem

O menu do kebab aparece sem animação, ancorado ao botão mas sem sugerir origem:

```css
/* packages/web/src/styles/goals.css:222 — current */
.fb-goals__menu-list { position: absolute; top: calc(100% + 4px); right: 0; z-index: 5; min-width: 140px; box-sizing: border-box; padding: 4px; display: flex; flex-direction: column; background: #ffffff; border: 1px solid #e6e6e6; border-radius: 5px; box-shadow: 0 4px 16px rgba(0,0,0,0.1); }
```
```tsx
/* pages/goals/GoalCard.tsx:~146 */
{open && ( <div id={panelId} ref={panelRef} className="fb-goals__menu-list" role="group" …> … )}
```

Frequência: ocasional (professor). O popover nasce do kebab, no canto superior direito.

## Target

```css
.fb-goals__menu-list {
  transform-origin: top right;
  animation: fb-enter 150ms var(--ease-out) both;
}
```

Para este popover o deslocamento do `fb-enter` (6px) é aceitável (desce do botão). Reduced motion: só fade.

## Repo conventions to follow

`fb-enter` do plano 001; `goals.css` é a folha dos estilos de metas.

## Steps

1. `goals.css:222`: acrescentar `transform-origin: top right;` e `animation: fb-enter 150ms var(--ease-out) both;` à regra `.fb-goals__menu-list`.

## Boundaries

- Sem animação de saída (render condicional em `GoalCard.tsx`; não alterar).
- Não mexer na lógica de foco/`onBlur`/teclado do menu (`GoalCard.tsx:~114-135`).
- Não aplicar a `.fb-blocked-popover`.

## Verification

- **Mechanical**: `pnpm typecheck`, `pnpm test` (`GoalsPage.test.tsx`), `pnpm build`.
- **Feel check**: em `/metas`, abrir o kebab de uma meta: o menu cresce a partir do canto superior direito (do botão), ~150ms; abrir/fechar rápido várias vezes não deixa estado preso. Reduced motion: só fade.
- **Done when**: o menu entra a partir do gatilho; testes verdes.


