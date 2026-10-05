# 006 — Resultado da reserva no `ClassDetailSheet`

- **Status**: DONE
- **Commit**: d0cf723
- **Severity**: LOW
- **Category**: Missed opportunities (state change that teleports)
- **Estimated scope**: 1 arquivo (`packages/web/src/styles/client.css`), ~15 linhas
- **Depende de**: 001 (e, para consistência visual, 003)

## Problem

Ao reservar/cancelar/remarcar, a área de ação do sheet troca de conteúdo de uma vez (`renderAction()` em `ClassDetailSheet.tsx:~172`), incluindo o bloco de sucesso com `CheckIcon`:

```tsx
/* packages/web/src/pages/client/ClassDetailSheet.tsx:~172 — current */
<div className="fb-sheet__stack">
  <div className="fb-sheet-alert fb-sheet-alert--success" role="status">
    <CheckIcon />
    <span>{outcome.message}</span>
  </div>
  <button …>Ver na agenda</button>
</div>
```
```css
/* client.css:752 */
.fb-sheet-alert { display: flex; align-items: flex-start; gap: 8px; padding: 12px 14px; border-radius: 5px; font-size: 13px; line-height: 18px; }
.fb-sheet-alert svg { flex-shrink: 0; margin-top: 2px; }
```

O momento de sucesso é o mais importante do produto (reserva confirmada). Atenção: o React reaproveita o mesmo `div` entre os ramos de `renderAction()` (mesmo tipo/posição), então o fade deve ser **keyframes na classe do alerta** (dispara quando a classe aparece), não `@starting-style`.

## Target

```css
.fb-sheet-alert { animation: fb-enter 220ms var(--ease-out) both; }
.fb-sheet-alert--success svg { animation: fb-check-pop 240ms var(--ease-out) 80ms both; }
```
com um keyframe local novo (colocar em `client.css`, junto do `.fb-sheet-alert`):

```css
@keyframes fb-check-pop {
  from { opacity: 0; transform: scale(0.6); }
  to   { opacity: 1; transform: none; }
}
```

Em reduced motion: o alerta só faz fade (tokens zeram o deslocamento); o ícone, cujo `scale(0.6)` é literal, precisa do override:

```css
@media (prefers-reduced-motion: reduce) {
  .fb-sheet-alert--success svg { animation: fb-fade 200ms var(--ease-out) both; }
}
```

Sem bounce: é confirmação, não festa. `.fb-reschedule-banner` (`ClientAgendaPage.tsx:~217`) usa a mesma classe `fb-sheet-alert` e também ganha o fade — aceitável.

## Repo conventions to follow

Tokens/keyframes do plano 001; classes `fb-sheet-alert*` já existem em `client.css:752-775`.

## Steps

1. `client.css`: adicionar `animation: fb-enter 220ms var(--ease-out) both;` à regra `.fb-sheet-alert`.
2. Adicionar `.fb-sheet-alert--success svg` + `@keyframes fb-check-pop` + o override de reduced-motion conforme Target.
3. Nenhuma mudança em TSX.

## Boundaries

- Não adicionar `key`s nem mexer na lógica de `renderAction`.
- Não animar `.fb-sheet-badge` nem os botões do resultado.
- Sem crossfade/blur no swap de conteúdo (decisão: só o bloco novo entra).

## Verification

- **Mechanical**: `pnpm typecheck`, `pnpm test` (`ClientAgendaPage.test.tsx`), `pnpm build`.
- **Feel check**: reservar uma aula: o bloco de sucesso sobe 6px com fade em ~220ms e o check "pousa" logo depois (80ms de atraso); repetir cancelar → mensagem de erro/sucesso entra do mesmo jeito. Playback a 10%: o ícone começa invisível, não pisca. Reduced motion: só fade. É um julgamento de sensação (o atraso do check) — confirmar no aparelho.
- **Done when**: sucesso, recusa e banner de remarcação entram com fade; testes verdes.


