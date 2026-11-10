# Design system Fitburn

Base de design do app, derivada da proposta `proposta-fitburn-oratry.html` (nesta pasta). Os valores abaixo são os da proposta; os tokens que o preview de todas as telas trouxer entram nesta mesma lista antes de virar código.

## Tema

Decidido em D-038 (`docs/decisions.md`): claro e escuro pela preferência do sistema, em cliente e admin, com alternância manual salva por aparelho. Revisa a #134 (escuro sempre). Implementado na pilha da issue #156: o botão de tema do cabeçalho alterna e grava `fb-theme` no `localStorage` (atributo `data-theme` no `<html>`). As tabelas abaixo listam os dois valores de cada token; `tokens.css` os declara no `:root` (claro) e nos blocos de tema escuro, e `test/theme-css.test.ts` confere que os valores batem com este documento.

## Marca

| Token | Claro | Escuro |
|---|---|---|
| `--brand` | #ED6E34 | — |
| `--flame` | #C23A1F | — |
| `--brand-strong` | #A8401A | #F08A5A |
| `--brand-hover` | #D85F28 | #F58A55 |
| `--brand-tint` | #FFF4EE | #2A1810 |
| `--brand-tint-2` | #FFE8DC | #3A1F12 |
| `--brand-line` | #F7CDB7 | #5A2E1A |
| `--on-brand` | #FFFFFF | — |
| `--grad-cta` | linear-gradient(145deg,#F58A55 0%,#ED6E34 45%,#C23A1F 100%) | — |
| `--grad-text` | linear-gradient(100deg,#C23A1F,#ED6E34 60%,#F7A274) | linear-gradient(100deg,#F06A3A,#ED6E34 55%,#FFB48C) |

Regras: o laranja `--brand` é acento, nunca fundo de área grande. Texto laranja sobre claro usa `--brand-strong` (6,15:1). Texto branco sobre o laranja só em texto grande e negrito; `--on-brand` é esse branco (texto, traço e a translucidez sobre o laranja, o vermelho-chama e o gradiente CTA), em vez de `#fff` literal nas folhas de estilo.

## Superfícies, texto e bordas

| Token | Claro | Escuro |
|---|---|---|
| `--bg` | #FFFFFF | #0A0A0A |
| `--bg-soft` | #FFFAF7 | #100D0C |
| `--surface` | #FFFFFF | #161311 |
| `--surface-2` | #FBF5F1 | #1E1916 |
| `--ink` | #1C1714 | #FFFFFF |
| `--ink-2` | #3A302A | #E9E1DC |
| `--muted` | #6B5D55 | #A39A94 |
| `--faint` | #8E7F76 | #857B75 |
| `--line` | #EFE2DA | #2A2320 |
| `--line-2` | #E5D3C8 | #3A302B |

## Estados

| Token | Claro | Escuro |
|---|---|---|
| `--danger` | #B42318 | #FF6D5A |
| `--danger-bg` | #FDECEA | rgba(255,109,90,.1) |
| `--danger-line` | #F5C2BC | rgba(255,109,90,.35) |
| `--success` | #1E6B34 | #5CC98A |
| `--success-bg` | #EAF7EE | rgba(92,201,138,.1) |
| `--success-line` | #BFE3CA | rgba(92,201,138,.35) |
| `--warn` | #8A5A00 | #F2C25C |
| `--warn-bg` | #FFF5DB | rgba(242,194,92,.1) |

## Sombras e foco

| Token | Claro | Escuro |
|---|---|---|
| `--sh-1` | 0 5px 14px rgba(120,52,20,.06) | 0 5px 14px rgba(0,0,0,.35) |
| `--sh-2` | 0 12px 38px rgba(120,52,20,.08) | 0 12px 38px rgba(0,0,0,.45) |
| `--sh-3` | 0 22px 60px rgba(120,52,20,.10) | 0 22px 60px rgba(0,0,0,.55) |
| `--sh-cta` | 0 10px 23px rgba(237,110,52,.28) | 0 10px 26px rgba(237,110,52,.30) |
| `--sh-focus` | 0 0 0 3px rgba(237,110,52,.35) | — |

Uso: `--sh-1` em listas, `--sh-2` em cards, `--sh-3` em telas e diálogos, `--sh-cta` em ações. Anel de foco: `--sh-focus` (3px).

## Raio

| Token | Valor | Uso |
|---|---|---|
| `--r-xs` | 6px | chips e elementos pequenos |
| `--r-sm` | 10px | botão pequeno |
| `--r-md` | 14px | botão e campo |
| `--r-lg` | 20px | card |
| `--r-xl` | 28px | tela e diálogo |
| `--r-pill` | 999px | pílulas e chips de dia |

## Espaçamento (base 4)

| Token | Valor |
|---|---|
| `--s-1` | 4px |
| `--s-2` | 8px |
| `--s-3` | 12px |
| `--s-4` | 16px |
| `--s-5` | 20px |
| `--s-6` | 24px |
| `--s-8` | 32px |
| `--s-12` | 48px |
| `--s-16` | 64px |
| `--s-24` | 96px |

Container de 1240px, gutter de 16px no celular e até 48px no desktop. Padding de card 24px; itens de lista 12px.

## Tipografia

Fontes: `--font-sans` (DM Sans, para tudo) e `--font-serif` (Cormorant, só em itálico como ênfase dentro de título).

| Papel | Tamanho / altura | Peso e tracking | Uso |
|---|---|---|---|
| Display | 72px / 1.04 (fluido, mínimo 34px) | 700, -0.045em | Título de herói |
| H2 | 52px / 1.06 (fluido, mínimo 28px) | 700, -0.045em | Título de seção |
| H3 | 24px / 1.1 | 700, -0.035em | Título de tela e card |
| Corpo | 16px / 1.55 | 400 | Texto corrido |
| Pequeno | 13px / 1.45 | 500 | Metadados |
| Kicker | 11px | 700, 0.32em, caixa alta | Rótulo acima do título |

## Movimento

| Token | Valor |
|---|---|
| `--ease-out` | cubic-bezier(.23,1,.32,1) |

## Componentes

Peças e estados (repouso, hover, foco, pressionado com escala 0,97, desabilitado, erro e carregando) estão na seção "Componentes" de `proposta-fitburn-oratry.html`. Botões: primário (gradiente CTA), secundário, soft, ghost, perigo e pequeno. Campos: repouso, foco, erro, sucesso e desabilitado.

## Layout do admin (aprovados)

Tokens que o preview de todas as telas (`preview-todas-telas.html`) precisou e que não existem na proposta. Aprovados pelo dono na issue #156; estão em `tokens.css` e em uso (`--sidebar-w` na barra lateral do admin, `--list-w` na lista + detalhe de Fichas e Metas). Cores literais foram evitadas: o preview reaproveita os tokens acima. O branco `#fff` e o `rgba(255,255,255,.x)` sobre o gradiente CTA (botão, chip ativo, card de plano) seguem como na proposta.

| Token | Claro | Escuro | Tela de origem | Motivo |
|---|---|---|---|---|
| `--sidebar-w` | 224px | — | Todas as telas do admin | Largura da barra lateral do admin (11 itens de menu, "Templates & modalidades" é o mais longo). A proposta só mostra uma barra superior de exemplo. |
| `--list-w` | 260px | — | Fichas de treino, Metas | Largura da coluna de alunos no layout lista + detalhe. Sem equivalente na proposta. |

Token novo que o preview trouxer e ainda não estiver aprovado fica fora desta seção, numa seção "Tokens novos (aguardando aprovação)", e só vira código depois da aprovação.

## Landing (aprovados em 2026-11-10)

A landing (`packages/landing`, D-039) importa `tokens.css` do app e só acrescenta os tokens abaixo, em `packages/landing/src/styles/landing-tokens.css`. Ela é só escura (D-040): o `<html>` sai com `data-theme="dark"`.

| Token | Valor | Motivo |
|---|---|---|
| `--text-h2-marketing` | `clamp(28px, 4.6vw, 52px)` | H2 de seção de marketing (52px / 1.06). Não é token do app. |
| `--leading-h2-marketing` | `1.06` | Entrelinha do H2 de marketing. |
| `--text-hero-sub` | `clamp(22px, 3.2vw, 36px)` | Linha de apoio do H1 (segunda frase do herói). |
| `--text-lead` | `clamp(17px, 1.6vw, 20px)` | Subtítulo do herói e intros de seção. |
| `--text-cta` | `17px` | Rótulo do botão da landing, como no site atual (o app usa `--text-action`, 15px). |
| `--cta-min-h` | `52px` | Alvo de toque mínimo do botão. |
| `--cta-ink` | `#0A0A0A` | Texto sobre o laranja de marca (decisão L6). |
| `--landing-max` | `1240px` | Container da proposta (o app usa `--container-max`, 1200px). |
| `--landing-gutter` / `--landing-gutter-lg` | `--s-4` / `--s-12` | Gutter lateral: 16px no celular, 48px a partir de 1024px. |
| `--section-y` / `--section-y-lg` | `--s-16` / `--s-24` | Respiro vertical entre seções. |
| `--reveal-shift` | `20px` (`0px` com reduced motion) | Deslocamento do fade-up de entrada (inventário: 16 a 24px). |
| `--action-bar-h` | `72px` | Altura da barra fixa de ações no celular. |

**Botão primário da landing (L6):** fundo `--brand` (#ED6E34), texto `--cta-ink` (#0A0A0A), hover `--brand-hover`. Contrastes: 6,49:1 sobre `--brand` e 8,15:1 sobre `--brand-hover` (escuro). O botão do app (texto branco no gradiente, 3,05:1 e 2,43:1) não é reaproveitado. Outros contrastes no escuro: `--muted` sobre `--surface` 6,7:1, `--brand-strong` sobre `--bg` 8,0:1, `--brand` sobre `--surface` 6,06:1 (números grandes). O `test/tokens.test.ts` da landing calcula todos.

## Como adicionar um token

1. Confirme que o valor não existe aqui.
2. Adicione na tabela certa, com o valor claro e o escuro.
3. Se o token nasceu no preview de todas as telas, cite a tela de origem.
