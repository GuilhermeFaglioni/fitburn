# 009 — (Opcional) Gate de hover para dispositivos de toque

- **Status**: DONE
- **Commit**: d0cf723
- **Severity**: LOW
- **Category**: Accessibility
- **Estimated scope**: ~7 arquivos CSS (os `:hover` existentes)
- **Depende de**: nada (independente de 001)

## Problem

13 regras `:hover` sem `@media (hover: hover) and (pointer: fine)`; em celular o hover "gruda" depois do toque:

`styles/attendance.css:261 (.fb-myclass:hover)`, `home.css:57 (.fb-home__link:hover)`, `states.css:89 (.fb-state__retry:hover)`, `admin.css:234 (.fb-row-btn:hover)`, `admin.css:252`, `admin.css:578 (.fb-day-empty:hover)`, `goals.css:209 (.fb-goals__kebab:hover…)`, `goals.css:250 (.fb-goals__menu-item:hover:not(…))`, `client.css:169 (.fb-client-weeknav .fb-client-icon-btn:hover)`, `AppMenu.css:38,86,107`.

## Target

Cada regra, mantendo a declaração, vai para dentro de:

```css
@media (hover: hover) and (pointer: fine) {
  .fb-row-btn:hover { background: #f2f2f2; }
}
```

Regra especial: onde o seletor combina `:hover` com outro estado (ex.: `.fb-goals__kebab:hover, .fb-goals__kebab[aria-expanded="true"]`) separar — o `[aria-expanded]` fica fora do media.

## Steps

1. `grep -rn ":hover" packages/web/src --include='*.css'` e envolver cada ocorrência (uma por vez, preservando a ordem de cascata).
2. Não mudar valores de cor.

## Boundaries

- Não adicionar movimento no hover (só mover o que já existe).
- Não tocar TSX.

## Verification

- **Mechanical**: `pnpm typecheck`, `pnpm test`, `pnpm build`.
- **Feel check**: desktop (mouse) mantém o hover; em viewport mobile com toque emulado, tocar um botão não deixa o estado hover preso.
- **Done when**: nenhum `:hover` fora do `@media (hover: hover) and (pointer: fine)`.


