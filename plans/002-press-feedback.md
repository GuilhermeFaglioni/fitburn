# 002 — Feedback de press nos controles de toque

- **Status**: DONE
- **Commit**: d0cf723
- **Severity**: HIGH
- **Category**: Physicality & origin (press feedback)
- **Estimated scope**: ~6 arquivos CSS, 1 regra agrupada por arquivo
- **Depende de**: 001

## Problem

Nenhum controle tem `:active` (zero ocorrências no CSS). Alvos principais, todos sem transição de transform:

```css
/* packages/web/src/styles/client.css:693 — current */
.fb-sheet-btn { width: 100%; box-sizing: border-box; border-radius: 5px; font-family: var(--font-sans); font-weight: 700; color: #ffffff; cursor: pointer; }
/* client.css:332 */ .fb-class-card { width: 100%; box-sizing: border-box; display: flex; border-radius: 5px; padding: 4px; … }
/* client.css:293 */ .fb-daychip { … border-radius: 999px; … cursor: pointer; }
/* client.css:434 */ .fb-client-tab-btn { … cursor: pointer; }
/* client.css:863 (dentro de @media max-width:767px) */ .fb-client__tab { flex: 1; … text-decoration: none; }
/* attendance.css:161 */ .fb-seg-btn { … border: 1px solid rgba(255,255,255,0.2); background: transparent; … min-width: 84px; }
/* LoginPage.css (login-form__submit) */ .login-form__submit { background: var(--color-primary-orange); … cursor: pointer; }
/* admin.css:107 */ .fb-btn-primary { … cursor: pointer; }   /* admin.css:679 .fb-btn-secondary */
```

Toque sem resposta visual faz o app parecer "site", não app instalado. Frequência: dezenas de vezes por dia → só feedback sutil.

## Target

Valores exatos (usam os tokens do plano 001):

```css
/* padrão: controles pequenos/médios */
.alvo { transition: transform 160ms var(--ease-out); }
.alvo:active:not(:disabled) { transform: scale(var(--press-scale)); }   /* 0.97 */

/* largos e repetidos (.fb-class-card, .fb-seg-btn): mais sutil */
.alvo:active:not(:disabled) { transform: scale(0.98); }

/* .fb-seg-btn: além do press, transição de estado (marcação otimista) */
.fb-seg-btn {
  transition:
    transform 160ms var(--ease-out),
    background-color 120ms ease,
    border-color 120ms ease,
    color 120ms ease;
}
```

Em reduced motion o 0.97 vira 1 (via `--press-scale`) e o 0.98 vira 1 (via `--press-scale-soft`, definido no plano 001). Nos controles largos usar sempre `scale(var(--press-scale-soft))`, nunca o literal `0.98`.

Nunca `transition: all`. Nunca no `:hover`.

## Repo conventions to follow

- Seletores BEM `fb-*` em `src/styles/*.css`; cada controle é definido na sua folha (client.css, attendance.css, admin.css, LoginPage.css).
- Para `.fb-client__tab`, a regra fica dentro do bloco mobile existente (`@media (max-width: 767px) { … }` em `client.css`, ~linha 850) junto de `.fb-client__tab`. **Não alterar** a string que abre esse bloco (`@media (max-width: 767px) {\n  .fb-client__sidebar`): `test/mobile-padding.test.ts` a usa como âncora.
- Exemplar de agrupamento: a regra de touch target agrupada em `responsive.css:83-113`.

## Steps

1. `client.css`: acrescentar `transition: transform 160ms var(--ease-out);` a `.fb-sheet-btn`, `.fb-daychip`, `.fb-client-tab-btn`, `.fb-class-card`; e logo abaixo de cada bloco as regras `:active:not(:disabled)` (para `.fb-class-card` usar `--press-scale-soft`). Para `.fb-client__tab` (no bloco mobile, após a regra `.fb-client__tab.active`), idem.
2. `attendance.css`: `.fb-seg-btn` — substituir a ausência de transição pela lista de 4 transições acima e adicionar `:active:not(:disabled)` com `--press-scale-soft`.
3. `LoginPage.css`: `.login-form__submit` — transição + `:active:not(:disabled)`.
4. `admin.css`: `.fb-btn-primary`, `.fb-btn-secondary` (e variantes `--lg/--sm` herdam) — transição + `:active:not(:disabled)`.
5. `home.css`/`goals.css`/`profile.css`: não alterar (fora de escopo).

## Boundaries

- Não tocar em `.fb-row-btn`, kebab, ícones, links de navegação do admin, nem em TSX.
- Não animar `box-shadow` nem `background` para press (só transform; exceção: `.fb-seg-btn`).
- Não alterar tamanhos nem `min-height` (os alvos de toque de 44px vêm de `responsive.css`).
- Se um seletor não existir mais (drift), PARE e reporte.

## Verification

- **Mechanical**: `pnpm typecheck`, `pnpm test`, `pnpm build`.
- **Feel check** (pane de browser em viewport mobile via `resize_window` preset `mobile`):
  - Segurar o clique num `.fb-class-card`, num `.fb-sheet-btn` e num chip de dia: o elemento encolhe levemente e volta sem salto ao soltar.
  - Na Presença, tocar Presente/Faltou: a cor troca em ~120ms, sem "piscar".
  - Botão `disabled` (ex.: "Aula lotada") NÃO encolhe.
  - Playback a 10% (Animations panel): só `transform` (e as 3 cores no seg-btn) anima.
  - Reduced motion: nada encolhe, a cor do seg-btn ainda transiciona.
  - Sensação (160ms) não dá para julgar só pelo código — confirmar em aparelho real.
- **Done when**: todos os 9 seletores respondem a `:active`, sem regressão nos testes.


