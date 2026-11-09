# Design system Fitburn

Base de design do app, derivada da proposta `proposta-fitburn-oratry.html` (nesta pasta). Os valores abaixo são os da proposta; os tokens que o preview de todas as telas trouxer entram nesta mesma lista antes de virar código.

## Tema

**Decisão pendente.** A decisão 134 do repositório fixa tema escuro único; a proposta traz claro e escuro (pela preferência do sistema, com alternância manual). Este documento lista os dois valores de cada token e não escolhe um lado. A escolha é do dono do produto.

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
| `--grad-cta` | linear-gradient(145deg,#F58A55 0%,#ED6E34 45%,#C23A1F 100%) | — |
| `--grad-text` | linear-gradient(100deg,#C23A1F,#ED6E34 60%,#F7A274) | linear-gradient(100deg,#F06A3A,#ED6E34 55%,#FFB48C) |

Regras: o laranja `--brand` é acento, nunca fundo de área grande. Texto laranja sobre claro usa `--brand-strong` (6,15:1). Texto branco sobre o laranja só em texto grande e negrito.

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

## Tokens novos (aguardando aprovação)

Tokens que o preview de todas as telas (`preview-todas-telas.html`) precisou e que não existem na proposta. Só viram código depois da aprovação. Cores literais foram evitadas: o preview reaproveita os tokens acima. O branco `#fff` e o `rgba(255,255,255,.x)` sobre o gradiente CTA (botão, chip ativo, card de plano) seguem como na proposta.

| Token | Claro | Escuro | Tela de origem | Motivo |
|---|---|---|---|---|
| `--sidebar-w` | 224px | — | Todas as telas do admin | Largura da barra lateral do admin (11 itens de menu, "Templates & modalidades" é o mais longo). A proposta só mostra uma barra superior de exemplo. |
| `--list-w` | 260px | — | Fichas de treino, Metas | Largura da coluna de alunos no layout lista + detalhe. Sem equivalente na proposta. |

## Como adicionar um token

1. Confirme que o valor não existe aqui.
2. Adicione na tabela certa, com o valor claro e o escuro.
3. Se o token nasceu no preview de todas as telas, cite a tela de origem.
