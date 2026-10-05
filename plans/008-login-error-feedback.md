# 008 — Erro de login e blocos `Feedback`

- **Status**: DONE
- **Commit**: d0cf723
- **Severity**: LOW
- **Category**: Missed opportunities (jarring change)
- **Estimated scope**: 2 arquivos (`packages/web/src/pages/LoginPage.css`, `packages/web/src/styles/states.css`)
- **Depende de**: 001

## Problem

O erro de login surge e empurra o formulário para baixo sem transição; os blocos de `Feedback` (sucesso/erro de ações) entram do mesmo jeito:

```css
/* packages/web/src/pages/LoginPage.css:71 — current */
.login-form__error { display: flex; align-items: flex-start; gap: 8px; padding: 12px 14px; background: var(--color-danger-bg); border: 1px solid var(--color-danger-border); border-radius: var(--radius-sm); }
```
```tsx
/* LoginPage.tsx:70 */ {showError && ( <div className="login-form__error" role="alert"> … )}
```
```css
/* states.css:11 */ .fb-state { margin: 0; box-sizing: border-box; padding: 12px 14px; border-radius: var(--radius-sm); font-size: 13px; … }
```

Frequência: rara. Só opacidade + leve deslocamento: animar altura empurraria o layout (proibido).

## Target

```css
.login-form__error { animation: fb-enter 180ms var(--ease-out) both; }   /* sem shake */
.fb-state--error,
.fb-state--success { animation: fb-enter 180ms var(--ease-out) both; }
```

`LoadingState` e `EmptyState` **não** animam (vistos o tempo todo; ver Boundaries).

Para o erro de login usar só translação vertical negativa seria o ideal, mas `fb-enter` usa +6px e escala 0.96; para blocos largos a escala é imperceptível e o conjunto é aceitável. Se parecer estranho, trocar por um keyframe local `fb-fade` (opacidade apenas).

## Repo conventions to follow

`states.css` guarda os estados compartilhados (`.fb-state--light/--dark`, `.fb-state--error/--success`); `LoginPage.css` o login. Keyframes do plano 001.

## Steps

1. `LoginPage.css`: adicionar a `animation` em `.login-form__error`.
2. `states.css`: acrescentar, após a regra base `.fb-state--empty`, a regra agrupada `.fb-state--error, .fb-state--success { animation … }`.

## Boundaries

- Não animar `.fb-state--loading` nem `.fb-state--empty`.
- Não alterar `states.tsx`, `LoginPage.tsx` nem `role`s (alert/status).
- Sem shake, sem animação de altura.

## Verification

- **Mechanical**: `pnpm typecheck`, `pnpm test` (`LoginFlow.test.tsx`, `StateComponents.test.tsx`, `SharedStatesScreens.test.tsx`), `pnpm build`.
- **Feel check**: em `/login`, errar a senha: o aviso entra em ~180ms, sem pulo brusco; errar de novo: reentra. Em `/usuarios`, forçar um erro de ação: o bloco entra suave. Reduced motion: só fade.
- **Done when**: erro e feedback entram suaves; testes verdes.


