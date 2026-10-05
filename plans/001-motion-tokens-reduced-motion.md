# 001 — Tokens de motion e reduced motion gentil

- **Status**: DONE
- **Commit**: d0cf723
- **Severity**: MEDIUM
- **Category**: Cohesion & tokens / Accessibility
- **Estimated scope**: 2 arquivos (`packages/web/src/styles/tokens.css`, `packages/web/src/styles/global.css`), ~40 linhas

## Problem

Não existe vocabulário de motion. `tokens.css` só tem cor, tipografia e `--radius-sm`. O reset de reduced-motion apaga todo feedback, não só o movimento:

```css
/* packages/web/src/styles/global.css:57 — current */
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}
```

Os planos 002–008 precisam de curvas, escalas e keyframes compartilhados, e de um reduced-motion que preserve fade de opacidade.

## Target

Em `tokens.css`, dentro do `:root` existente, adicionar (e um bloco reduced-motion no fim do arquivo):

```css
  /* Motion: curvas e deslocamentos compartilhados (ver global.css para os keyframes). */
  --ease-out: cubic-bezier(0.23, 1, 0.32, 1);
  --ease-in-out: cubic-bezier(0.77, 0, 0.175, 1);
  --ease-drawer: cubic-bezier(0.32, 0.72, 0, 1);
  --press-scale: 0.97;
  --press-scale-soft: 0.98;
  --enter-scale: 0.96;
  --enter-shift: 6px;
  --sheet-offset: 100%;
}

@media (prefers-reduced-motion: reduce) {
  :root {
    --press-scale: 1;
    --press-scale-soft: 1;
    --enter-scale: 1;
    --enter-shift: 0px;
    --sheet-offset: 0%;
  }
}
```

(Fechar o `:root` original corretamente: as variáveis novas entram antes do `}` do `:root` existente; o bloco `@media` vem depois.)

Em `global.css`, substituir o bloco reduced-motion por:

```css
@media (prefers-reduced-motion: reduce) {
  * {
    scroll-behavior: auto !important;
  }
}

/* Entradas de uma vez só (diálogos, popovers, resultados). Com reduced-motion os tokens
   zeram o deslocamento/escala e sobra só o fade de opacidade. */
@keyframes fb-enter {
  from {
    opacity: 0;
    transform: translateY(var(--enter-shift)) scale(var(--enter-scale));
  }
  to {
    opacity: 1;
    transform: none;
  }
}

@keyframes fb-fade {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

@keyframes fb-sheet-in {
  from {
    transform: translateY(var(--sheet-offset));
  }
  to {
    transform: none;
  }
}
```

O spinner de login (`LoginPage.css:183`, `animation: login-spin 0.8s linear infinite`) passa a girar normalmente em reduced-motion — é indicador de progresso, aceito como auxílio de compreensão.

## Repo conventions to follow

- Tokens vivem em `src/styles/tokens.css` (`:root`); `global.css` já importa `./tokens.css` na 1ª linha.
- Comentários em português, estilo do arquivo.
- `test/contrast.test.ts` lê CSS via `?raw`; ele só deve ver as variáveis de cor, então variáveis novas não devem afetá-lo (rodar para confirmar).

## Steps

1. Editar `tokens.css` conforme Target (variáveis dentro do `:root`; bloco `@media` ao final).
2. Editar `global.css`: trocar o bloco `@media (prefers-reduced-motion …)` pelo novo e acrescentar os 3 `@keyframes`.
3. `grep -rn "0.01ms" packages/web` — não deve restar nada além de ocorrências em comentários.

## Boundaries

- Não tocar em nenhum componente nem em outras folhas de estilo.
- Não criar JS nem dependências.
- Se `global.css`/`tokens.css` não baterem com os trechos "current" (drift), PARE e reporte.

## Verification

- **Mechanical**: `pnpm typecheck`, `pnpm test` (atenção a `contrast.test.ts`, `mobile-padding.test.ts`), `pnpm build` — tudo verde.
- **Feel check**: nada visível muda sozinho (os tokens ainda não são usados). No DevTools → Rendering → "prefers-reduced-motion: reduce": `getComputedStyle(document.documentElement).getPropertyValue('--press-scale')` retorna `1`; sem reduced: `0.97`.
- **Done when**: tokens existem nos dois modos e o reset antigo de 0.01ms sumiu.


