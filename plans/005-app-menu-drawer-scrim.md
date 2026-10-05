# 005 — Gaveta e scrim do `AppMenu` (mobile admin)

- **Status**: DONE
- **Commit**: d0cf723
- **Severity**: MEDIUM
- **Category**: Easing & duration / Physicality
- **Estimated scope**: 2 arquivos (`packages/web/src/components/AppMenu.tsx`, `AppMenu.css`)
- **Depende de**: 001

## Problem

A gaveta desliza com `ease` genérico (curva fraca) e o scrim é renderizado condicionalmente, então aparece/some instantaneamente em desacordo com a gaveta:

```tsx
/* packages/web/src/components/AppMenu.tsx:60 — current */
{open && (
  <div className="app-menu__scrim" aria-hidden="true" onClick={() => setOpen(false)} />
)}
```
```css
/* AppMenu.css:154-176 — current (dentro de @media max-width: 767px) */
.app-menu { position: fixed; top: 0; bottom: 0; left: 0; z-index: 30; width: min(280px, 85vw); overflow-y: auto; transform: translateX(-100%); visibility: hidden;
  transition: transform 0.2s ease, visibility 0s linear 0.2s; }
.app-menu--open { transform: translateX(0); visibility: visible; transition: transform 0.2s ease, visibility 0s; }
.app-menu__scrim { display: block; position: fixed; inset: 0; z-index: 20; background: rgba(10, 10, 10, 0.55); }
/* base (fora do media): */
.app-topbar, .app-menu__scrim { display: none; }
```

`test/Layouts.test.tsx:152` abre o menu e clica em `.app-menu__scrim` — o scrim deve continuar existindo e clicável quando aberto.

## Target

```css
/* dentro do @media (max-width: 767px) */
.app-menu {
  transition:
    transform 200ms var(--ease-drawer),
    visibility 0s linear 200ms;
}
.app-menu--open {
  transition:
    transform 280ms var(--ease-drawer),
    visibility 0s;
}
.app-menu__scrim {
  display: block;
  position: fixed;
  inset: 0;
  z-index: 20;
  background: rgba(10, 10, 10, 0.55);
  opacity: 0;
  visibility: hidden;
  pointer-events: none;
  transition: opacity 200ms var(--ease-out), visibility 0s linear 200ms;
}
.app-menu__scrim--open {
  opacity: 1;
  visibility: visible;
  pointer-events: auto;
  transition: opacity 200ms var(--ease-out), visibility 0s;
}

@media (prefers-reduced-motion: reduce) {
  .app-menu { transform: none; opacity: 0; transition: opacity 200ms var(--ease-out), visibility 0s linear 200ms; }
  .app-menu--open { opacity: 1; transition: opacity 200ms var(--ease-out), visibility 0s; }
}
```

(Abrir 280ms, fechar 200ms: a resposta do sistema ao fechar é mais rápida.) O `@media (prefers-reduced-motion)` fica dentro do `@media (max-width: 767px)` ou imediatamente após, ao final do bloco.

TSX: o scrim fica sempre montado, só ganha a classe de estado:

```tsx
<div
  className={`app-menu__scrim${open ? " app-menu__scrim--open" : ""}`}
  aria-hidden="true"
  onClick={() => setOpen(false)}
/>
```

## Repo conventions to follow

`AppMenu.css` guarda o CSS da gaveta (mobile) e a gaveta já usa `visibility` para tirar links da tabulação (comentário no topo de `AppMenu.tsx`) — manter isso. Exemplar: o padrão `visibility 0s linear Xms` já existe em `.app-menu`.

## Steps

1. `AppMenu.tsx`: trocar o `{open && (<div … scrim/>)}` pelo scrim sempre montado com a classe condicional acima.
2. `AppMenu.css`: dentro do bloco mobile, atualizar `.app-menu`, `.app-menu--open`, `.app-menu__scrim` e acrescentar `.app-menu__scrim--open` e o bloco reduced-motion conforme Target.
3. O `display: none` base do scrim (`.app-topbar, .app-menu__scrim`, fora do media) permanece: no desktop o scrim continua oculto.

## Boundaries

- Não alterar `useDialogFocus`, `aria-*` da gaveta, nem a lógica de fechar por Esc/rota.
- Não animar o desktop (sidebar fixa).
- Não mexer em `Layouts.test.tsx`; se quebrar, parar e reportar.

## Verification

- **Mechanical**: `pnpm typecheck`, `pnpm test` (`AppMenu.test.tsx`, `Layouts.test.tsx`), `pnpm build`.
- **Feel check** (viewport mobile, login como staff): tocar "Menu": gaveta desliza em ~280ms e o scrim escurece junto; tocar o scrim ou escolher uma tela fecha em ~200ms, com o scrim sumindo em fade (antes sumia seco). Tocar "Menu" rápido várias vezes: a gaveta retarget-eia, sem reiniciar do zero. Com a gaveta fechada, Tab não alcança os links (visibility ok). Reduced motion: gaveta só faz fade, sem deslizar.
- **Done when**: gaveta e scrim animam em par nos dois sentidos; testes verdes.


