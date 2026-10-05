# 003 — Entrada do `ClassDetailSheet` (bottom sheet / cartão)

- **Status**: DONE
- **Commit**: d0cf723
- **Severity**: MEDIUM
- **Category**: Physicality & origin / Missed opportunities
- **Estimated scope**: 1 arquivo (`packages/web/src/styles/client.css`), ~30 linhas
- **Depende de**: 001

## Problem

O detalhe da aula aparece e some instantaneamente; no mobile é um bottom sheet sem relação visual com a borda de onde "nasce".

```css
/* packages/web/src/styles/client.css:567 — current */
.fb-sheet-backdrop { position: fixed; inset: 0; z-index: 20; background: rgba(0, 0, 0, 0.6); display: flex; align-items: center; justify-content: center; }
.fb-sheet { width: 460px; max-width: 100%; box-sizing: border-box; background: #1a1a1a; color: #ffffff; border-radius: 5px; padding: 28px; display: flex; flex-direction: column; gap: 18px; box-shadow: 0 16px 48px rgba(0,0,0,0.5); }
/* client.css ~937, dentro de @media (max-width: 767px): */
.fb-sheet-backdrop { align-items: flex-end; }
.fb-sheet { width: 100%; border-radius: 16px 16px 0 0; padding: 12px 20px 28px; box-shadow: 0 -8px 24px rgba(0,0,0,0.4); }
```

Montado por `{openItem && <ClassDetailSheet … />}` em `ClientAgendaPage.tsx:377`; `useDialogFocus` foca o diálogo ao montar (`components/Modal.tsx`). Frequência: ocasional.

## Target

```css
/* desktop: cartão centralizado (modal é exceção: origem no centro) */
.fb-sheet-backdrop { animation: fb-fade 200ms var(--ease-out) both; }
.fb-sheet { animation: fb-enter 200ms var(--ease-out) both; transform-origin: center; }

/* mobile: o sheet sobe da borda inferior (translateY em % da própria altura) */
@media (max-width: 767px) {
  .fb-sheet { animation: fb-sheet-in 320ms var(--ease-drawer) both; }
}
```

Observações exatas: `fb-enter` no desktop usa `--enter-shift: 6px` + `--enter-scale: 0.96` (nunca `scale(0)`); no mobile `fb-sheet-in` só translada (`translateY(100%)` → `none`), sem fade. Em reduced motion, `--enter-*` e `--sheet-offset` ficam neutros e sobra o fade do backdrop/cartão.

## Repo conventions to follow

- Estilos do cliente em `client.css`. O bloco mobile é `@media (max-width: 767px)`. **Criar um `@media (max-width: 767px)` NOVO, separado, logo depois do bloco do sheet** (não editar a linha que inicia o bloco `@media (max-width: 767px) {\n  .fb-client__sidebar`, âncora de `test/mobile-padding.test.ts`).
- Keyframes `fb-enter`, `fb-fade`, `fb-sheet-in` vêm do plano 001 (`global.css`).

## Steps

1. Em `client.css`, adicionar `animation: fb-fade 200ms var(--ease-out) both;` à regra base `.fb-sheet-backdrop` (linha ~567).
2. Adicionar `animation: fb-enter 200ms var(--ease-out) both;` à regra base `.fb-sheet` (linha ~577).
3. Imediatamente depois da regra `.fb-sheet[role="dialog"]:focus` (base), inserir o `@media (max-width: 767px)` novo com `.fb-sheet { animation: fb-sheet-in 320ms var(--ease-drawer) both; }`.
4. Não mexer em TSX: a animação dispara na montagem.

## Boundaries

- Não animar a saída (o desmonte é imediato por decisão registrada; follow-up).
- Não alterar `ClientAgendaPage.tsx`, `Modal.tsx` nem o foco programático.
- Não mudar `z-index`, tamanhos, radius, sombras.

## Verification

- **Mechanical**: `pnpm typecheck`, `pnpm test` (`ClientAgendaPage.test.tsx` deve seguir verde — jsdom ignora CSS), `pnpm build`.
- **Feel check**: abrir `/agenda`, tocar numa aula.
  - Mobile (375×812): sheet sobe da borda inferior em ~320ms, backdrop escurece junto; sem salto no fim.
  - Desktop: cartão entra com leve escala (0.96→1) + fade, centralizado.
  - Abrir/fechar várias vezes seguidas: sempre começa limpo.
  - 10% de playback: sem flash de frame final antes do início (`both` aplica o `from`).
  - Reduced motion: só fade, nada se move.
  - 320ms é o limite superior do orçamento de drawers; se parecer lento no aparelho, baixar para 280ms.
- **Done when**: sheet e cartão entram animados nos dois breakpoints, testes verdes.


