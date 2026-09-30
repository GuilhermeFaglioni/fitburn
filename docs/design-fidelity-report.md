# Fidelidade ao design: divergências por tela

Objetivo: as telas do app web ficarem idênticas aos 27 artboards do Claude Design
(<https://claude.ai/artifact/VncuMf9CffiWGUEQYywLVX>). Onde o design e o código divergem, o design vence.
Este relatório foi gerado com a ferramenta `scripts/design-compare/` (ver o README de lá): renderiza cada
artboard no tamanho de `canvas.json`, captura a tela equivalente do app com dados de demonstração no mesmo
viewport, compara pixels e também mede texto, cor, fonte, caixa, raio e posição de cada elemento.

Como reproduzir e conferir depois de corrigir: `pnpm design:seed` (uma vez) e `pnpm design:compare`
(veja o README). As medidas exatas de cada tela ficam em `tmp/design-compare/divergences/<Tela>.md`, as imagens
em `tmp/design-compare/diff/<Tela>.side.png` (design | app | diferença) e o ranking em
`tmp/design-compare/report.md`. Os pontos abaixo são a leitura dessas medidas junto com o HTML do artboard e o
código.

Leia com estas ressalvas:

- Nomes, datas, pontos e contagens do design são dados de exemplo; a diferença de conteúdo dinâmico (ex.: "1.240"
  contra "210") não é divergência. O que conta é layout, medidas, tipografia, cor, raio, ícones, textos fixos,
  estados e comportamento visual.
- A % de pixels diferentes é baixa em quase todas as telas porque o fundo é quase todo preto/branco. Use também a
  coluna "% do conteúdo" e as listas de medidas. Telas cujo app tem outra estrutura (Cadastro, Dashboard) pesam
  mais do que o número sugere.
- "Quirk do design": o artboard renderiza algo que provavelmente não era a intenção (por exemplo `<button>` sem
  `font-family`, que cai em Arial, ou `<a>` sem cor herdando o azul do navegador). Está marcado onde ocorre; a
  decisão de copiar o quirk ou a intenção é de quem corrige, com a recomendação indicada.

## 1. Ranking (rodada de 2026-09-30, banco `fitburn_test_60`)

| # | Tela (artboard) | Grupo | Rota do app | % pixels | % conteúdo |
|---|---|---|---|---|---|
| 1 | Cadastro | G1 | `/clientes` (modal "Novo cliente") | 61,6 | 100 |
| 2 | PresencaMobile | G3 | `/presenca/:occurrenceId` | 13,2 | 15,4 |
| 3 | ReservaMobile | G2 | `/agenda` (detalhe da aula) | 12,0 | 17,4 |
| 4 | AgendaMobile | G2 | `/agenda` | 7,5 | 15,0 |
| 5 | GamificacaoMobile | G3 | `/gamificacao` | 6,1 | 9,1 |
| 6 | MetasAdmin | G3 | `/metas` | 4,7 | 11,1 |
| 7 | HomeMobile | G1 | `/` | 4,5 | 5,8 |
| 8 | FichaTreinoAdmin | G5 | `/fichas` | 3,9 | 7,3 |
| 9 | ClientesAdmin | G5 | `/clientes` | 3,8 | 14,8 |
| 10 | PerfilMobile | G4 | `/perfil` | 3,7 | 7,2 |
| 11 | PlanoMobile | G4 | `/plano` | 3,6 | 10,2 |
| 12 | DashboardAdmin | G3 | `/dashboard` | 3,3 | 5,6 |
| 13 | GamificacaoDesktop | G3 | `/gamificacao` | 3,2 | 7,5 |
| 14 | HomeDesktop | G1 | `/` | 2,6 | 5,1 |
| 15 | FichaTreinoMobile | G4 | `/ficha-treino` | 2,4 | 6,2 |
| 16 | UsuariosPerfis | G5 | `/usuarios` | 2,3 | 9,3 |
| 17 | AgendaAdmin | G5 | `/agenda-administrativa` | 2,3 | 5,9 |
| 18 | ReservasAdmin | G5 | `/reservas-administrativas` | 2,3 | 9,8 |
| 19 | AgendaDesktop | G2 | `/agenda` | 1,7 | 7,0 |
| 20 | PlanoDesktop | G4 | `/plano` | 1,6 | 9,9 |
| 21 | PerfilDesktop | G4 | `/perfil` | 1,5 | 7,4 |
| 22 | FichaTreinoDesktop | G4 | `/ficha-treino` | 1,4 | 5,1 |
| 23 | PlanosAdmin | G5 | `/planos` | 1,4 | 6,9 |
| 24 | TemplatesModalidades | G5 | `/templates-e-modalidades` | 1,2 | 6,3 |
| 25 | ReservaDesktop | G2 | `/agenda` (detalhe da aula) | 0,9 | 2,6 |
| 26 | Login | G1 | `/login` | 0,6 | 4,5 |
| 27 | LoginMobile | G1 | `/login` | 0,3 | 0,9 |

Estados alternativos comparados (design x app): Login/LoginMobile erro, ReservaDesktop/ReservaMobile reservada,
GamificacaoDesktop/Mobile ranking mensal, PerfilDesktop/Mobile edição, ClientesAdmin confirmar exclusão,
ReservasAdmin nova reserva, AgendaAdmin nova aula, PlanosAdmin atribuir, UsuariosPerfis perfis,
TemplatesModalidades modalidades (0,3% a 9,6%; a tabela completa está em `tmp/design-compare/report.md`).
Estados só renderizados no design (sem captura no app): Login carregando, Cadastro erro de e-mail e sucesso,
HomeMobile e PlanoDesktop/Mobile sem plano, AgendaMobile sem aulas, Reserva sucesso, erro_lotada,
erro_conflito, erro_duplicada, erro_permissao e falha_remarcar, ReservasAdmin erro_lotada e erro_duplicada.
As mensagens desses estados foram conferidas no código (ver cada tela).

## 2. Causas transversais (corrigir uma vez, vale para várias telas)

Estas causas aparecem nas listas de medidas de quase todas as telas. Cada uma é uma decisão de token ou de casca,
não de tela.

**T1. Texto sobre laranja.** `--color-on-orange` (`styles/tokens.css`) é `#0a0a0a`; o design usa `#ffffff` em todo
texto sobre o laranja (botões primários, aba "Próximas", chip de dia selecionado, "Semanal", "Presente", "Salvar"...).
Afeta: Login/LoginMobile ("Entrar"), Agenda (aba "Próximas", `.fb-daychip[aria-pressed]`), Reserva ("Reservar"),
Gamificação ("Semanal"/"Mensal"), Presença ("Presente"), e todos os `.fb-btn-primary` administrativos (`+ Novo ...`,
"Criar meta", "Salvar ficha", "Confirmar reserva"). O branco sobre `#ed6e34` dá cerca de 3,05:1 (o preto dá 6,5:1):
é o trade-off de contraste já registrado; siga o design (mude o token e reavalie só onde o texto for pequeno; o
design usa 700 e 13 a 15px). Um único ajuste em `--color-on-orange` resolve a maior parte.

**T2. Transparências do texto secundário no escuro.** O design usa alphas diferentes por elemento (0,40 / 0,45 /
0,50 / 0,55 / 0,60 / 0,65); o app colapsou vários no token `--color-text-muted-on-dark` (0,60). Diferenças medidas:
rótulos de campo do Perfil, do Plano e da Ficha (0,45 no design), datas de histórico (0,45), "PENDENTE" e o aviso de
Presença (0,40), cabeçalho dos dias da grade da Agenda (0,45), horas da grade (0,40), textos "Ontem"/"Há 3 dias" da
Gamificação (0,45), rodapé do Login e "®" (0,40). Correção: usar em cada classe o alpha literal do design (o token
0,60 fica só onde o design usa 0,60).

**T3. Cinzas do tema claro (administração).** `--color-text-muted-on-light` é `#666666`; o design usa `#8a8a8a` no
"eyebrow" (`.fb-page-eyebrow`), em `.fb-th`, nos títulos de aba inativa (`.fb-tab-btn`), em "MEUS ALUNOS", no
prazo das metas e nas legendas; `#b0b0b0` em textos de linha inativa e na legenda "Lista filtrada pelos alunos...".
Linhas inativas (cliente inativo, usuário inativo, reserva concluída/cancelada) ficam esmaecidas no design
(`#8a8a8a` no nome, `#b0b0b0` nos demais) e no app têm a cor normal. O laranja de texto sobre claro é `#b44a14`
no app (`--color-accent-on-light`, escolhido por contraste AA) contra `#ed6e34` no design (cliente selecionado na
lista de alunos, horários e títulos dos chips da Agenda administrativa, selo ADMINISTRADOR); é o mesmo trade-off
de T1, para telas claras.

**T4. Alvos de toque de 44px no mobile** (`styles/responsive.css`, bloco `@media (max-width: 767px), (pointer: coarse)`).
O `min-height: 44px` (e `min-width`/padding lateral de 8px em `.fb-home__link`, `.fb-home__ghost-btn`,
`.fb-back-btn`, `.fb-icon-btn`...) muda a geometria das telas mobile: abas "Próximas/Histórico" 44px contra 35px,
"Remarcar/Cancelar" da Home 53px de altura da linha contra 34px e deslocados 8px, botões da Presença 48px contra
39px (linhas de 76px contra 67px), "Semanal/Mensal" 44px contra 33px, botão voltar 44px contra 32px (título da
Presença desloca 12px), "Editar" do Perfil. É a causa da maior parte da divergência das telas mobile
(ReservaMobile, PresencaMobile, AgendaMobile, HomeMobile). Recomendação: manter a área de toque de 44px, mas sem
mexer no layout visível, com o mesmo truque do `.fb-checkbox` (`position: relative` e `::before` com `inset` negativo
para ampliar só a área clicável), em vez de `min-height`. Onde o design permite (botões de 44px ou mais), nada muda.

**T5. Família de fonte dos botões.** No design, `<button>` sem `font-family` renderiza em Arial (quirk) e `<a>` em
DM Sans. Efeitos: rótulos da barra inferior (design Arial 11px, app DM Sans), chips de dia da AgendaMobile
(Arial no design), "Sair da conta", "Entrar" do Login; e o inverso: "+ Novo cliente" (link `<a>` no design, DM Sans)
é `<button class="fb-btn-primary">` no app, que cai em Arial porque `.fb-btn-primary` não define `font-family`.
Recomendação: DM Sans em todos os controles (a intenção do design system); se a fidelidade literal for exigida,
copiar caso a caso pela lista de medidas ("fonte Arial -> DM Sans").

**T6. Casca do cliente (`components/ClientLayout.tsx`, `styles/client.css`).**
- Ícones da barra lateral: 18px no design, 20px no app (mesmo componente serve a barra inferior, que é 20px nos
  dois). Com o ícone de 20px cada item tem 44px de passo em vez de 42px (Agenda 129 contra 126, Perfil 261 contra
  252). Dar `size` ao `Icon`: 18 na sidebar, 20 na tab bar.
- Rótulo do item "Ficha de treino" na sidebar (desktop); o app usa "Treino" (que é o rótulo certo só da barra
  inferior no mobile). `ITEMS` precisa de `label` e `tabLabel`.
- Rodapé "Sair" da sidebar não existe no design (a saída é "Sair da conta" no Perfil): remover
  `.fb-client__logout` da sidebar ou aceitar como desvio.
- O bloco da marca (`.fb-client__brand`, `<span>` solto) não é um flex column com `gap: 24px` como no design
  (`<nav>` com `display:flex; flex-direction:column; gap:24px`), o que soma 3px na primeira posição.
- Padding do conteúdo: `.fb-client__content` é `32px 40px` para todas as telas; o design usa `32px 40px` só na
  Agenda e `48px` (todos os lados) em Home, Perfil, Plano, Ficha de treino, e `40px 40px` na Gamificação
  (título em y=40). Torne o padding uma variável por tela (como `--fb-admin-pad-*` na administração).

**T7. Casca administrativa (`components/AppMenu.tsx`, `AppMenu.css`, `lib/auth/areas.ts`).**
- Ordem e nomes: design = Dashboard, Clientes, Usuários e perfis, Agenda, Reservas, Planos, Templates &
  modalidades, Fichas de treino, Metas, Configurações. App = Dashboard, Usuários e perfis, Clientes, Agenda,
  Reservas, Minhas aulas, Planos, Fichas de treino, Metas, Atribuições, Templates & modalidades (ordem de
  `visibleAdminMenuItems`).
- "Minhas aulas" e "Atribuições" não existem no design (telas `MyClassesPage` e `AssignmentsPage` sem artboard);
  "Configurações" existe no design e não tem tela nem rota no app.
- O bloco de conta no rodapé (`.app-menu__account`: nome, perfil, "Minha conta", "Sair") não existe no design.
- Alguns artboards (Cadastro, Dashboard) usam uma sidebar reduzida (Dashboard, Clientes, Planos, Configurações):
  são versões abreviadas de exemplo, não um requisito.

**T8. Cabeçalho das telas administrativas.** `.fb-page-title` 24px/700 DM Sans e eyebrow 13px batem com o design.
As telas do design com "botão à direita do título" (Clientes, Reservas, Agenda, Usuários) alinham o botão na linha do
título, e o app o coloca na linha da toolbar, abaixo (ClientesAdmin: botão em y=113 no app, y=49 no design).

**T9. Fontes.** Cormorant e DM Sans carregam por `<link>` em `packages/web/index.html`. Nos artboards o `@import`
das fontes vem depois de outras regras (é ignorado pelo navegador); a ferramenta injeta o mesmo `<link>` no design
para comparar as fontes pretendidas.

**T10. Chips da grade da Agenda (quirk).** No design, os chips da AgendaDesktop são `<a>` sem cor e herdam o azul de
link (`#0000ee`) nos textos; a intenção é branco (`.fb-client-chip` do app usa `#ffffff`). Recomendação: branco.

## 3. Por artboard

Convenção: "Design" descreve o alvo; "App" onde o app diverge; os arquivos apontados são os que precisam mudar.
Os números de pixel vêm de `tmp/design-compare/divergences/<Tela>.md`.

### G1. Login, LoginMobile, Cadastro, Home

#### Login (`/login`, `pages/LoginPage.tsx` + `LoginPage.css`), 0,57%
Praticamente idêntico. Restam:
- Texto do botão "Entrar": `#0a0a0a` -> `#ffffff` (`.login-form__submit-label`, T1).
- Rodapé "Acesso restrito a alunos e equipe Fitburn." e "®": `rgba(255,255,255,0.6)` -> `0.4`
  (`.login-page__footer`, `.login-page__logo-reg`; hoje usam `--color-text-muted-on-dark`).
- `.login-form__submit` `margin-top: 4px` -> `8px` no desktop (o design usa 4px só no mobile); o cartão fica 4px
  mais alto (402 -> 406).
- Placeholder dos campos: `rgba(255,255,255,0.5)` -> `0.32` (`.login-form__input::placeholder`).
- Estado erro: bate (mesma caixa `rgba(255,109,90,0.1)`, borda 0.35, ícone, texto `#ff9587`). Estado
  "carregando" (spinner + "Entrando…"): markup e classes idênticos ao design; só não foi capturado no app.
- O foco visível é global (`:focus-visible`); o design troca só a `border-color` para laranja. Manter o do app.

#### LoginMobile (`/login`, 390x844), 0,34%
Mesmos três itens (botão, "®", rodapé 12px `rgba(255,255,255,0.4)`). O `margin-top` do botão é 4px no mobile
(já correto). Tudo o mais bate.

#### Cadastro (`/clientes` + modal `ClientCreateForm`), 61,6%
O design é uma tela cheia; o app usa um modal. Estrutura diferente:
- Design: página no tema claro, breadcrumb "Clientes / Novo cliente" (13px `#8a8a8a`), H1 24px/700 DM Sans, cartão
  branco `max-width: 760px`, borda 1px `#e6e6e6`, raio 5px, padding 32px, grade de 2 colunas
  (`column-gap: 20px`, `row-gap: 18px`), rodapé com `border-top: 1px solid #eee`. Conteúdo com padding `32px 48px`.
- Campos: Nome completo* (2 colunas), E-mail* + Telefone*, Data de nascimento* + CPF*, Endereço (2 colunas, sem
  asterisco: opcional), Perfil de acesso* (select Cliente/Professor/Funcionário administrativo/Administrador +
  legenda "Somente administradores podem alterar o perfil de acesso.") + Senha inicial* (legenda "Definida por
  você ou gerada e comunicada ao cliente fora do sistema."). Rótulos 13px/500 `#333`, asterisco no rótulo,
  inputs `10px 12px`, 14px, borda `#d6d6d6`, foco com borda laranja, placeholders "Nome e sobrenome",
  "email@exemplo.com", "(00) 00000-0000", "000.000.000-00", "Rua, número, bairro, cidade", "••••••••".
- Botões: "Cancelar" (`11px 20px`, 14/500 `#333`, borda `#d6d6d6`) e "Salvar cliente" (`11px 22px`, 15/700), alinhados à
  direita. O app tem um único botão de largura total "Cadastrar cliente".
- App diverge: modal de 460px com campos empilhados em coluna única, rótulos sem asterisco e em 12px/600 `#4a4a4a`,
  "Documento" em vez de "CPF", sem placeholders, sem select de perfil, sem "Cancelar" (o modal fecha por X/Esc),
  endereço obrigatório (o contrato `createClientRequestSchema` exige `address`; o design o dá como opcional: decisão de
  produto/contrato).
- Perfil de acesso: o design cria qualquer usuário por este formulário; o app tem `POST /users/clients` e
  `POST /users/staff` (exige `profileId`), então o select precisa escolher o endpoint. "+ Novo usuário" na tela de
  Usuários (design) também usa este fluxo.
- Estados do design: erro de e-mail ("Este e-mail já está cadastrado." 12px `#d64545` sob o campo, borda do input
  `#d64545`) e sucesso (faixa `#eaf7ee`, borda `#bfe6c9`, texto `#1e6b34` 13px: "Cliente cadastrado com sucesso.
  Voltando para a listagem de clientes…"). No app o erro é uma faixa geral no topo do modal com o texto "Este
  e-mail já está em uso." e o sucesso fecha o modal sem faixa.
- Arquivos: `pages/ClientCreateForm.tsx`, `pages/ClientsPage.tsx`, nova rota `/clientes/novo` em `App.tsx`,
  `styles/admin.css` (`.fb-form`, `.fb-modal*`).

#### HomeDesktop (`/`, `pages/ClientHomePage.tsx`, `pages/home/HomeReservations.tsx`, `styles/home.css`), 2,6%
- Padding do conteúdo 48px (design) contra 32px 40px (app): tudo desloca -8px em x e -16px em y (T6).
- Coluna direita: no design cada aula é uma linha `display:flex; justify-content:space-between` (título e quando à
  esquerda, "Remarcar"/"Cancelar" à direita com `gap: 20px`, sem `border-top`), cartão `padding: 16px 18px` e 72px de
  altura. O app usa o layout mobile (ações embaixo com `border-top`, 112px de altura). Precisa de variante ≥768px em
  `.fb-home__reservation` e `.fb-home__reservation-actions`.
- Título do bloco: "Ver agenda completa" no desktop (o app: "Ver agenda"; no mobile o design diz "Ver agenda").
- Dia da aula: design "Hoje, 18h00", "Quinta, 07h00", "Sábado, 09h00" (nome do dia por extenso, maiúscula) e
  professor só pelo primeiro nome ("Prof. Rafael"); app "qui 01/10, 07h00" e nome completo (`formatClassDay`
  em `lib/agenda/format`, `HomeReservation`).
- Plano: design "Ativo até 15 de novembro" (13px, `rgba(255,255,255,0.5)`), um só texto; app "Ativo até 15/11/2026"
  (12px) mais uma segunda linha "15/08/2026 – 15/11/2026" (cartão 89px em vez de 72px). Remover a segunda linha e
  usar `formatDayMonth` com o mês por extenso (`ClientHomePage.tsx`, `.fb-home__plan-until`).
- Evolução: número 56px no desktop (app 48px, `.fb-home__points-total`), rótulo "pontos" ok; "Badges recentes"
  (plural) com até 3 discos de 36px em fileira (app: "Badge recente" com um disco + "Streak de 3 dias"); "8º lugar
  no ranking semanal" na cor `rgba(255,255,255,0.65)` ok. O cartão fica 239px contra 229px.
- "Atalhos" (17/18px, grade 2x2) não existe no design: remover `.fb-home__shortcuts` ou aceitar como desvio.
- Sidebar: T6 (rótulo "Ficha de treino", ícone 18px, sem "Sair").

#### HomeMobile (`/`), 4,5%
- Ordem dos blocos no design: saudação e plano, "Próximas aulas", "Sua evolução". No app: plano, "Sua evolução",
  "Próximas aulas", "Atalhos" (`.fb-home__main` contém saudação, plano e evolução; `.fb-home__side` contém aulas e
  atalhos). Reordenar (por `order` no mobile, ou `display: contents` em `.fb-home__main`).
- Pontos: `padding-bottom: 6px` ok; "Badges recentes" com 3 discos (ver desktop).
- Ações "Remarcar/Cancelar": 44px de toque (T4) descolam o texto 8px e a linha cresce de 34 para 53px.
- Rótulos da tab bar: T5. Altura da página no app: 1227px contra 1080px (a soma de Atalhos e ordem).
- Estado sem plano: design = cartão com borda tracejada `rgba(255,255,255,0.2)`, "Você ainda não tem um plano ativo.
  Fale com a recepção para começar." 13/19px `rgba(255,255,255,0.65)`; o app tem `.fb-home__plan--empty` com o mesmo
  texto e estilo (confere).

### G2. Agenda e Reserva (cliente)

#### AgendaDesktop (`/agenda`, `pages/ClientAgendaPage.tsx`, `styles/client.css`), 1,7%
- Navegação de semana ("‹ 28 de setembro – 4 de outubro ›") não existe no design (o título tem só o controle
  "Próximas | Histórico" à direita). Sem ela não dá para ver outras semanas: decisão de produto; a linha
  `.fb-client-week` e `.fb-client-icon-btn` hoje fica entre o título e o controle.
- Linha dos dias: o design mostra o dia e o número em duas linhas com `gap: 2px`, sem borda de coluna; a grade tem
  `min-height: 56px` por célula, alinhamento `flex` em linha e `align-items: center`. No app a célula é
  `flex-direction: column; justify-content: center; gap: 4px` (`.fb-client-cell`), a linha do cabeçalho tem 15px a mais
  (`dy 14,5`) e as linhas de hora crescem até 75px porque o chip ocupa a largura toda (`.fb-client-chip` tem
  `width: 100%`; no design o chip é `display:block` sem largura, encolhe ao conteúdo, 70 a 115px).
- Chip: título 12/700, subtítulo 11px `rgba(255,255,255,0.55)` (app `rgba(255,255,255,0.6)`), "quase lotada" laranja
  `#ed6e34`, "lotada" `#ff8a70`. O app acrescenta a linha "Reservada" laranja (`.fb-client-chip__reserved`) que não
  existe no design.
- Coluna de hoje: `rgba(237,110,52,0.04)` no corpo e `0.08` no cabeçalho, com o rótulo do dia em laranja (confere).
- Design em `#0000ee` nos títulos dos chips: quirk T10.
- Rótulos e cores: cabeçalho SEG/TER... `rgba(255,255,255,0.45)`, hora da linha `rgba(255,255,255,0.4)` (app 0,60, T2);
  aba "Próximas" com texto branco (T1). Nota "Disponibilidade sujeita a confirmação..." 12px `rgba(255,255,255,0.45)` (app 0,60).
- Shell: T6.

#### AgendaMobile (`/agenda`, 390x900), 7,5%
- Igual ao desktop: navegação de semana extra no topo (empurra tudo 56px para baixo), 44px de toque nas abas (35 -> 44px), nota 0,45.
- Chips de dia: círculo selecionado laranja com o rótulo `rgba(255,255,255,0.85)` e dia branco (T1: app usa `#0a0a0a`);
  rótulos em Arial no design (T5); número do dia 15/700 (confere).
- Cartão da aula: no design "9/12 vagas disponíveis" em 12px/700 `rgba(255,255,255,0.6)`, "quase lotada" laranja,
  "lotada" `#ff8a70` (confere); o app acrescenta o selo "RESERVADA" (`.fb-class-card__reserved`) e o cartão fica 125px
  contra 93px. Prof. por primeiro nome no design.
- Título "Hoje, terça-feira 22" (13px/500 `rgba(255,255,255,0.5)`) confere. Estado "sem aulas": `EmptyState` do app
  ("Nenhuma aula agendada para este dia.") tem o mesmo texto; o estilo pontilhado precisa ser conferido em
  `components/states.tsx` contra o artboard (`hasClasses=false`).

#### ReservaDesktop (`/agenda`, `pages/client/ClassDetailSheet.tsx`), 0,9%
- Diálogo: falta `box-shadow: 0 16px 48px rgba(0,0,0,0.5)` no cartão; botão "Reservar" com texto branco (T1).
- Subtítulo: design "Hoje, 18h00 – 19h00"; app "sex 02/10, 18h00 – 18h50" (formato do dia, ver Home). Professor
  pelo primeiro nome no design ("Prof. Rafael").
- Título 26px da página atrás do diálogo é o mock do design (não é tela real).
- Estados (cenario): `reservada`, `sucesso`, `erro_lotada`, `erro_conflito`, `erro_duplicada`, `erro_permissao`,
  `falha_remarcar`. No app existem sucesso ("Reserva confirmada com sucesso. Bom treino!"), lotada ("Ver outros
  horários"), duplicada ("Ver minha reserva"), conflito ("Ver minha agenda"), remarcação falha ("RESERVA ORIGINAL ATIVA",
  "Tentar remarcar novamente"). Não existe `erro_permissao` ("Seu plano atual não dá acesso a esta modalidade." + "Ver
  planos disponíveis"): a API não tem regra de modalidade por plano (o plano é informativo).

#### ReservaMobile (`/agenda`, 390x844), 12,0%
- Sheet inferior: falta `box-shadow: 0 -8px 24px rgba(0,0,0,0.4)`, o botão "Reservar" e "Fechar" ficam 13 a 27px acima do
  design (o sheet do app tem 399px de altura contra 372px porque o botão fechar/X usa 44px de toque, T4, e o padding
  inferior é menor: design `padding: 12px 20px 28px`).
- Fundo: design mostra "Agenda" 22px/700 esmaecido e três placeholders; o app mostra a agenda real (Cormorant 32px):
  não é divergência de tela, só do mock.
- "Reservar" em branco (T1), subtítulo "Hoje, 18h00 – 19h00" (formato do dia).

### G3. Gamificação, Presença, Metas, Dashboard

#### GamificacaoDesktop (`/gamificacao`, `pages/GamificationPage.tsx`, `pages/gamification/*`, `styles/gamification.css`), 3,2%
- Padding do topo 40px (título em y=40) contra 32px do app.
- Histórico recente: o design mostra só os 3 mais recentes (`+10`, `+20`, `+15`); o app lista tudo (página de 2236px). Limitar a 3
  (ou paginar por "Ver mais") em `GamificationPage.tsx`. Cada item do design tem 64 a 82px; o app 64 a 82px (confere),
  mas o "Há 3 dias" tem `rgba(255,255,255,0.45)` (T2).
- Conquistas: design tem 5 badges (3 conquistados com check laranja, 2 bloqueados com cadeado, opacidade baixa e o
  progresso "20 aulas (12/20)", "Convidou um amigo"); o app mostra só os badges de streak conquistados ("Streak de 3/5/10")
  e a frase "Você atingiu todos os marcos." (não existe no design). Badges "Primeira presença", "20 aulas" e
  "Convidou um amigo" não existem no contrato de gamificação (só streaks de 3, 5 e 10): faltam no backend.
- Metas do professor: no design cada meta é um cartão de 60px com título 14/500, "3/4" à direita e uma barra de
  progresso (6px, raio 999px, trilho `#0f0f0f`, preenchimento laranja `#ed6e34`); no app o cartão traz título, "Prazo: 30/09/2026", descrição e não tem barra. Depende
  de valor alvo/progresso por meta, que a API não tem (ver MetasAdmin).
- Ranking: linha do usuário destacada `rgba(237,110,52,0.14)` com texto laranja; os textos "N presenças · empate" seguem o
  design; diferença: cor `rgba(255,255,255,0.45)` na coluna de presenças (T2) e o rótulo "(você)" ao lado do nome
  ("Marina (você)"). Controle "Semanal | Mensal" com texto branco no ativo (T1).
- Cartão de pontos: número 52px no design (o app 52px, confere) mas o cartão é 258px contra 224px de altura por
  causa da frase extra e de `gap` maior.
- Sidebar: T6.

#### GamificacaoMobile (`/gamificacao`, 390x2020), 6,1%
Mesmos itens do desktop, mais: altura 2884px contra 2020px (histórico completo e frase extra); "Semanal/Mensal" 44px
(T4); cabeçalho "‹ Sua evolução" com botão voltar de 44px (T4). Título em Cormorant 26px (confere).

#### PresencaMobile (`/presenca/:occurrenceId`, `pages/AttendancePage.tsx`, `styles/attendance.css`), 13,2%
Capturada numa aula passada com presentes e faltas para comparar os estados marcados.
- Linha do aluno: 76px contra 67px e botões 48px contra 39px (`.fb-seg-btn { min-height: 48px }` em `responsive.css`,
  ver T4); largura dos botões 87 e 84px (confere).
- "Presente" marcado: fundo `#ed6e34`, borda `#ed6e34`, texto `#ffffff` (app `#0a0a0a`, T1); "Faltou" marcado: fundo
  `#c23a1f`, borda `#c23a1f`, texto branco (confere). Desmarcados: borda `rgba(255,255,255,0.2)`, texto
  `rgba(255,255,255,0.65)` (confere).
- Título "Presença" 19px/700 a x=64 (app x=76, o botão voltar de 44px ocupa 12px a mais); subtítulo do design "Treino
  Funcional · Hoje, 18h00" 12px `rgba(255,255,255,0.5)`; app "Treino Funcional · seg 28/09, 06h00" (formato do dia).
- Contador "2 de 5 registrados" 13px e "Toque para marcar" (`rgba(255,255,255,0.4)` no design, 0,60 no app, T2).
- "PENDENTE" 11/700 `rgba(255,255,255,0.4)` (app 0,60, T2). Aviso "Somente o professor atribuído..." 12px 0,40 (app 0,60).
- Estado extra do app sem design: "A presença abre no início da aula, às 18h00." e botões desabilitados antes da aula.
- Layout ok (tela cheia sem sidebar).

#### MetasAdmin (`/metas`, `pages/GoalsPage.tsx`, `goals/*`, `styles/goals.css`), 4,7%
- Lista "MEUS ALUNOS" (coluna de 240px, borda direita), busca, item selecionado `rgba(237,110,52,0.14)` com texto laranja
  (`#ed6e34`, app `#b44a14`), legenda "Lista filtrada pelos alunos vinculados ao professor logado." (11px `#b0b0b0`,
  app `#666`); o app lista todos os clientes (por escopo do perfil, dado do seed).
- Faixa de aviso: fundo `#faf1e6`, borda `#f0dcb8`, `padding: 12px 16px`, texto 12px/18px `#6b4a1e` com o texto "A pontuação de gamificação é calculada
  automaticamente pelo sistema com base na frequência e no progresso do cliente. Os pontos **não podem ser editados** nesta
  tela — aqui você define apenas as metas e acompanha o progresso." O app usa outro texto (menciona concluir meta e
  pontos da configuração) em 12px com linha de 18px; a altura do aviso é 62px contra 68px.
- Cartão de meta: design = título 14/500, "Prazo: 30/09/2026" à direita (`#8a8a8a`), **barra de progresso** (8px, raio 4px,
  fundo `#eee`, preenchimento laranja `#ed6e34`) e o texto de progresso ("9 de 12 aulas concluídas") abaixo; sem botões. Concluída:
  esmaecida, selo "CONCLUÍDA" verde, barra verde cheia e o texto "3 de 3 modalidades — concluída em 02/09/2026".
  App: título, prazo, descrição, botões "Concluir", "Editar", "Cancelar meta" (108px de altura contra 92px) e sem barra.
  Concluída em duas linhas ("3 de 3 modalidades" e "concluída em 30/09/2026").
- Formulário "+ Nova meta": campos Título, Descrição, **Valor alvo** ("Ex.: 10") e Prazo lado a lado; o app não tem
  Valor alvo (contrato `createGoalRequestSchema` só tem título, descrição e prazo). Sem o valor alvo/progresso não
  há como desenhar a barra: exige mudança de API (`targetValue`, `currentValue` ou cálculo) e de contrato.
- Botões: "Criar meta" 13px 100x37 (app 14px 109x38); "Cancelar" 90x38 contra 98x40 no design de outra tela
  (confira `.fb-btn-secondary`); branco sobre laranja (T1).

#### DashboardAdmin (`/dashboard`, `pages/DashboardPage.tsx`, `styles/dashboard.css`), 3,3%
Estrutura diferente (o dado existe na API, é só a tela):
- Design: título "Dashboard" 24/700 + subtítulo "Visão geral do Fitburn" (13px `#8a8a8a`); 4 cartões de KPI (grade de 4
  colunas, cartão 266x110, fundo `#fff`, borda 1px `#e6e6e6`, raio 5px): "Clientes ativos" 312, "Ocupação média da
  semana" 78%, "Pontos distribuídos no mês" 48.200, "Streaks ativos" 67 (rótulo 12/500 `#8a8a8a`, valor 32/700).
  Abaixo, dois painéis: "Ocupação por aula · semana atual" (uma barra por aula: nome 13px `#333`, percentual
  13/700 à direita, barra de 8px laranja sobre `#eee`) e "Gamificação" (dois valores de 22/700 em laranja: pontos
  distribuídos e streaks ativos; separador; "Ranking do período" 12/500 `#8a8a8a` com os 3 primeiros em linhas de
  13px, presenças à direita).
- App: um bloco `#f7f7f7` "Ocupação das aulas" com duas colunas ("Hoje" e "Semana" em listas de aulas por dia com
  "N vagas"/"Lotada"), seguido dos blocos de clientes ativos e gamificação; com alternância Semana/Mês. Não usa
  cartões de KPI nem barras.
- O contrato (`dashboardSchema`) já traz `activeClients.total`, `gamification.pointsDistributed`,
  `gamification.clientsWithActiveStreak`, `gamification.top` e `occupancy.week` (dá para calcular a ocupação
  média e o percentual por aula agrupando por nome). O seletor Semana/Mês do app não existe no design.
- Padding do conteúdo 32px 48px (título em x=280; app 272).

### G4. Perfil, Plano, Ficha de treino (cliente)

#### PerfilDesktop (`/perfil`, `pages/ProfilePage.tsx`, `styles/profile.css`), 1,5%
Muito próximo. Restam: padding 48px (T6); rótulos dos campos `rgba(255,255,255,0.45)` (app 0,60, T2); "CPF" no
design e "Documento" no app (rótulo); "Sair da conta" em Arial no design (T5) e 55% (app 0,60). Estado edição:
design e app equivalentes (2,4% de pixels), com as diferenças de T1 ("Salvar alterações" branco).

#### PerfilMobile (`/perfil`), 3,7%
Cartão "Dados pessoais" 388px contra 362px de altura (44px de toque no botão "Editar" e `gap` entre linhas), "Sair da
conta" precedido por um filete `border-top: 1px solid rgba(255,255,255,0.08)` no design (o app não tem), "CPF" x
"Documento", T2 e a barra inferior (T5). Edição (`PerfilMobile__edicao`): 6,3%: campos e botões com 44px de altura contra
os 40 do design.

#### PlanoDesktop (`/plano`, `pages/PlanPage.tsx`, `styles/plan.css`), 1,5%
Praticamente idêntico: padding 48px (T6); rótulos "Início/Término" e datas do histórico
`rgba(255,255,255,0.45)` (app 0,60, T2) e "ENCERRADO" 0,45. Estado sem plano: texto idêntico
("Você não tem um plano ativo no momento. Fale com a recepção do Fitburn para contratar um plano.").

#### PlanoMobile (`/plano`), 3,6%
Mesmos itens de T2 (rótulos "Início/Término", datas e "ENCERRADO" a 0,45) e a barra inferior em Arial (T5).

#### FichaTreinoDesktop (`/ficha-treino`, `pages/ClientWorkoutSheetsPage.tsx`, `ClientWorkoutSheetPage.tsx`, `styles/workout.css`), 1,4%
Estrutura diferente: o design mostra numa página só a ficha ativa com os exercícios e "Fichas anteriores"; o app tem duas
telas: `/ficha-treino` (lista "Fichas ativas" + "Fichas anteriores") e `/ficha-treino/:id` (detalhe, com link "← Fichas de treino").
- Design: título "Ficha de treino" 24/700; abaixo "Fase 2" 18px/700 + selo "ATIVA"; "Montada por Prof. Rafael · desde
  10/09/2026" (12px 0,45); grade 2x2 de cartões de exercício (548x132, padding 18px, título 15/700, chips "Séries/Repetições/Carga"
  `#0f0f0f`, "Obs. do professor: ..." 12px itálico 0,50); "Fichas anteriores" 15/700 com linhas "Fase 1 · 01/07/2026 – 09/09/2026 ·
  CONCLUÍDA" e "Avaliação inicial · 15/06/2026 · ARQUIVADA" (esmaecida).
- App na lista: cartão "Fase 2" com "4 exercícios" (sem exercícios inline), "Fichas anteriores" ok, datas únicas (a ficha não tem período
  início–fim, só `createdAt`; o design mostra "01/07/2026 – 09/09/2026": exige um campo de encerramento).
- App no detalhe: título "Fase 2" (sem "Ficha de treino"), "← Fichas de treino", a observação geral em destaque (borda
  esquerda laranja: não existe no design), cartões de exercício quase iguais (556px contra 548px por causa do `gap`).
- Recomendação: `/ficha-treino` renderizar a ficha ativa inline (como o detalhe) e listar as demais abaixo, mantendo
  `/ficha-treino/:id` para as anteriores.
- Rótulo da sidebar "Ficha de treino" (T6).

#### FichaTreinoMobile (`/ficha-treino`, 390x1520), 2,4%
Mesma estrutura (design 1520px com quatro exercícios em cartões de 15/700 e chips de 10px); o app na lista tem 1520px de página
(sem os exercícios). Mesmo ajuste da versão desktop.

### G5. Administração

#### ClientesAdmin (`/clientes`, `pages/ClientsPage.tsx`, `styles/admin.css`), 3,8%
- Cabeçalho: "+ Novo cliente" na linha do título, à direita (app: na toolbar, abaixo); é `<a>` DM Sans no design
  (T5, T8).
- Filtros: busca 280px "Buscar por nome, e-mail ou telefone" (app 300px, "...ou documento"); `<select>` "Status: todos" e
  "Plano: todos" (opções "Plano Performance/Essencial/Sem plano ativo") sem rótulo "Status" ao lado; contagem "6 clientes" à direita
  (12px `#8a8a8a`). O app tem só o filtro de status, com rótulo.
- Tabela: 6 colunas (Nome, E-mail, Telefone, Plano, Status, Ações) contra 5 (Nome, Contato empilhado, Plano ativo com "até dd/mm",
  Status, Ações); linha de 49px contra 59px; nome sem sublinhado (o app usa link com `text-decoration: underline`, laranja
  `text-decoration-color`, `fb-admin-content a:not([class])` em `responsive.css`); e-mail/telefone `#5a5a5a`; plano só o nome
  ("Plano Performance", "Sem plano ativo"); selo de status `padding: 4px 9px`, `letter-spacing: 0.03em` (app sem
  `letter-spacing`).
- Ações: "Editar", "Desativar"/"Reativar", "Excluir" (vermelho `#c23a1f`); o app não tem "Editar" na linha (edita no detalhe do cliente).
- Linhas inativas esmaecidas (nome `#8a8a8a`, demais `#b0b0b0`) no design; normais no app (T3).
- Diálogo "Excluir cliente?" (`ClientesAdmin__confirmar_exclusao`, 5,0%): design 440px, padding 28px, título 17/700, corpo 13/20px
  `#4a4a4a` com "anonimizados" em negrito, rodapé com filete; botões "Cancelar" e "Excluir e anonimizar" (`#c23a1f`, 10px 18px,
  13/700). Comparar com `components/DeleteUserDialog.tsx` (texto e medidas).

#### UsuariosPerfis (`/usuarios`, `pages/UsuariosPerfisPage.tsx`, `UsersPage.tsx`, `ProfilesPage.tsx`, `ProfileMatrix.tsx`), 2,3%
- Aba Usuários: no design lista só a equipe (Administrador, Professor, Recepção) com "+ Novo usuário"; o app lista também
  os clientes e o botão é "+ Novo cliente" (e o filtro "Status"); coluna "Perfil de acesso" com **selos coloridos por perfil**
  (ADMINISTRADOR laranja `#ed6e34` sobre `rgba(237,110,52,0.14)`; PROFESSOR azul `#2a5fb0` sobre `#eaf1fb`; RECEPÇÃO `#8a5a2a`
  sobre `#faf1e6`; app: cinza `#4a4a4a` sobre `#f2f2f2`, `.fb-badge--neutral`, e laranja `#b44a14`).
- Ações: "Editar" + "Desativar"/"Reativar" (o app: "Desativar" + "Excluir", sem "Editar"). Legenda inferior "Cada usuário possui
  exatamente um perfil de acesso." (12px `#8a8a8a`), que o app deixa fora da tela porque a lista é longa (1193px).
- Aba Perfis (`UsuariosPerfis__perfis`): lista de perfis (Administrador, Professor, Recepção, Cliente) + "+ Novo perfil", aviso do
  perfil Cliente com cadeado ("possui acesso restrito aos próprios dados por regra do sistema...") e matriz Módulo × Ver/Criar/
  Editar/Excluir/Escopo com os módulos do design (Clientes, Agenda, Reservas, Planos, Fichas de treino, Metas, Usuários e perfis,
  Configurações); o app usa os módulos do sistema (`Module`: USUARIOS, PERFIS_DE_ACESSO, DASHBOARD, TEMPLATES_DE_AULA,
  OCORRENCIAS, RESERVAS, CLIENTES, PLANOS, PRESENCA, FICHAS_DE_TREINO, GAMIFICACAO) e uma coluna "Executar". Alinhar rótulos e
  ordem dos módulos é decisão de produto.

#### TemplatesModalidades (`/templates-e-modalidades`, `pages/TemplatesModalidadesPage.tsx`, `pages/catalog/*`), 1,2%
Praticamente idêntico. Restam: "Desativar" extra na coluna de ações (o design tem só "Editar" e "Excluir"); professor "Prof. Camila"
(primeiro nome) contra "Prof. Camila Lopes"; largura das colunas (design 223/192/129/156/223px; o app 205/176/119/143/209px,
porque a coluna "Ações" é mais larga com o botão extra); botão "+ Novo template" em branco (T1). Aba "Modalidades" e o aviso
"Não é possível excluir: há 8 aulas agendadas usando este template..." (`showBlocked`) conferir contra `catalog/ModalitiesTab.tsx`.

#### AgendaAdmin (`/agenda-administrativa`, `pages/AgendaAdminPage.tsx`, `pages/agenda/*`, `styles/admin.css`), 2,3%
- Semana: o design mostra "15 – 21 de setembro" (texto simples, sem botões); o app tem "‹ 28 de setembro – 4 de outubro ›" com
  dois botões de 32px.
- Chips (`.fb-chip-cls`): fundo `rgba(237,110,52,0.12)` normal e **`rgba(194,58,31,0.12)` com texto `#c23a1f` quando lotada**; hora
  11/700, modalidade 12/500, "Prof. Camila · 12/15" 10px na mesma cor a 75%. O app usa `#b44a14` sem variante vermelha para
  lotada e o nome completo do professor ("Prof. Camila Lopes · 0/12"), com modalidade e cor iguais nas duas situações.
- Cabeçalho de coluna: `SEG 15` 12/700 `#8a8a8a`, "HOJE 22" em laranja com `border-bottom: 2px solid #ed6e34` (o app usa `#666` e
  o de hoje sublinhado laranja: confere), altura 35px contra 30px.
- Modal "Nova aula"/"Editar aula" e aviso de cancelamento: ver `pages/agenda/OccurrenceFormModal.tsx`,
  `OccurrenceEditModal.tsx` contra o artboard (Modalidade/template, Data, Horário, Professor "(titular)/(substituta)", legenda
  sobre notificação, Capacidade, Recorrência "Não se repete/Repetir semanalmente", "Cancelar aula", "Fechar", "Salvar"; aviso "Cancelar
  esta aula?" com "Voltar/Confirmar cancelamento"); `AgendaAdmin__nova_aula` tem 3,4% de pixels e 29 divergências de estilo.

#### ReservasAdmin (`/reservas-administrativas`, `pages/ReservasAdminPage.tsx`, `reservations-admin/*`), 2,3%
- Filtros: design = busca "Buscar por cliente ou aula" (260px) + selects "Status: todas" e "Data: hoje" (180px); app = selects "Cliente",
  "Status", "Período" com rótulos, sem busca de texto.
- Tabela: design Cliente, Aula, Data / Horário, Status, Ações (5 colunas); o app acrescenta "Registro" ("Criada por Fulano
  (equipe)"). Linhas concluída/cancelada esmaecidas com "—" na coluna de ações (T3); selos CONFIRMADA `#1e6b34` sobre `#eaf7ee`,
  CONCLUÍDA `#4a4a4a` sobre `#f0f0f0`, CANCELADA `#c23a1f` sobre `rgba(194,58,31,0.1)` (todos `padding: 4px 9px`, 11/700).
- Nome da aula: o design usa o nome da modalidade ("Muay Thai"), o app o nome do template ("Muay Thai iniciante").
- Diálogo "Nova reserva (administrativa)" (`ReservasAdmin__nova_reserva`, 5,4%): no design, Cliente (select), Aula ("Treino Funcional — hoje,
  18h00 (8/10)"), mensagens de cenário (Aula cheia., Reserva duplicada., Vaga disponível.), "Cancelar" e "Confirmar reserva".

#### PlanosAdmin (`/planos`, `pages/PlansPage.tsx`, `pages/plans/*`), 1,4%
- Catálogo: colunas Nome, **Preço** ("R$ 349,90/mês"), **Duração** ("3 meses"), **Modalidades incluídas** ("Todas"), Clientes
  ativos e Ações ("Editar", "Excluir"). O app tem Nome, Descrição, Status, Clientes ativos e Ações ("Editar", "Desativar", sem
  "Excluir"). Preço, duração e modalidades por plano **não existem no modelo** (`plans` tem só nome e descrição): exige
  mudança de API, contrato e formulário `PlanForm`.
- Bug visível no app: o selo "ATIVO" quebra em duas linhas ("ATIV/O") porque a coluna Status é estreita (`.fb-td` sem
  `white-space: nowrap` no selo); e as ações "Editar/Desativar" empilham em vez de ficarem em linha (linhas de 73px contra 49px).
- Aba "Atribuir a cliente" (`PlanosAdmin__atribuir`, 2,2%): aviso "Marina Souza já possui um plano ativo (Plano Performance, até
  15/11/2026). Um cliente só pode ter um plano ativo por vez — atribuir este novo plano encerrará o atual imediatamente." e o botão
  "Encerrar atual e atribuir": conferir texto e botão contra `plans/AssignTab.tsx` (o app usa "Atribuir e substituir o atual").

#### FichaTreinoAdmin (`/fichas`, `pages/WorkoutSheetsPage.tsx`, `pages/workout-sheets/SheetEditor.tsx`), 3,9%
Capturada na edição da ficha ativa (o estado inicial do app é "Nova ficha", vazio).
- Título "Editar ficha — Fase 2" (22/700) contra "Nova ficha"/"Editar ficha" do app; botão "+ Nova ficha (nova fase)" à direita do título (borda
  `#d6d6d6`) que o app não tem.
- Exercícios: cada exercício é um cartão `#fafafa` com 5 colunas rotuladas (Exercício, Séries, Repetições / tempo, Carga,
  Observações) e link vermelho "Remover" à direita; o app organiza campos por exercício de outra forma (Exercício, Séries, Repetições,
  Carga, Tempo, Distância, Observações no contrato). O design **junta repetições e tempo** em uma coluna e omite distância.
- Rodapé: "Cancelar" 14px 98x40 e "Salvar ficha" 15/700 128x40 (app 13px 90x38 e 14px 118x38); "Fichas anteriores de Marina Souza"
  (15/700) com linhas "Fase 1 · 01/07/2026 – 09/09/2026 · CONCLUÍDA · Ver" contra "Fichas de Marina Souza" com todas as fichas, contagem de
  exercícios, "criada em ..." e botão "Editar".
- Lista lateral e legenda: T3 (cores) e o app mostra todos os clientes (escopo do perfil).
- Campos extras do app sem design: "Título", "Status" e "Observações gerais".

## 4. Resumo do que falta ou não existe

Não existe no app (ou não existe no backend):
- Rota/tela "Configurações" (item de menu e módulo da matriz de permissões) e `Cadastro` como tela cheia (`/clientes/novo`).
- Preço, duração e modalidades incluídas nos planos (`plans` só tem nome/descrição); "Excluir" plano.
- Valor alvo e progresso das metas (barra de progresso no MetasAdmin e "Metas do professor" da Gamificação).
- Badges "Primeira presença", "20 aulas" e "Convidou um amigo" (só existem streaks de 3, 5 e 10), e o estado bloqueado com progresso.
- Período de uma ficha (início–fim; só há `createdAt`), no "Fichas anteriores".
- Regra "plano não dá acesso à modalidade" (estado `erro_permissao` da Reserva).
- Perfil de acesso no cadastro de cliente (o design cria qualquer usuário) e "+ Novo usuário" na tela de Usuários.
- Papel do autor da ficha (precisa de backend): o contrato só traz `authorName`, então "Montada por Rafael" aparece sem o
  prefixo "Prof." (o design mostra "Montada por Prof. Rafael"); o prefixo só deve voltar quando o contrato informar que o autor é professor.
- Notificação de substituição de professor (precisa de backend): a dica "os clientes inscritos serão notificados" saiu dos modais da
  agenda administrativa porque o backend não notifica ninguém.

Existe no app e não está no design (decidir manter ou remover):
- "Minhas aulas" (`MyClassesPage`), "Atribuições" (`AssignmentsPage`), detalhe do cliente (`ClientDetailPage`), bloco de conta e
  "Sair" na sidebar, "Atalhos" na Home, navegação de semana na Agenda (cliente e administração), selo "Reservada" na Agenda,
  aviso "A presença abre no início da aula", alternância Semana/Mês do Dashboard, coluna "Registro" de Reservas, "Desativar"
  em templates e planos, ações "Concluir/Editar/Cancelar meta", campos Título/Status/Observações gerais da ficha,
  "← Fichas de treino" e a observação geral da ficha no detalhe.

## 5. Grupos para os corretores

Cada grupo cita as causas transversais que precisa (T1 a T10, seção 2). T1, T2, T3 e T5 são tokens/estilos globais: um
único corretor (G1) deve aplicá-los primeiro, para que os outros não conflitem.

**G1: Login, LoginMobile, Cadastro, HomeDesktop, HomeMobile** (T1, T2, T5, T6, T9 e a casca do cliente).
- Tokens globais: `--color-on-orange` -> `#ffffff`; alphas literais do design nas classes (T2); `font-family` dos controles (T5);
  casca do cliente (ícone 18px, rótulos, sem "Sair", padding por tela, `gap` da marca).
- Login: botão branco, "®" e rodapé 0,4, placeholder 0,32, `margin-top: 8px` (desktop).
- Cadastro: tela cheia em `/clientes/novo`, grade de 2 colunas, asterisco nos rótulos, placeholders, "Cancelar/Salvar cliente",
  select de perfil, estados de erro de e-mail e sucesso.
- Home: layout de linha das aulas no desktop, ordem dos blocos no mobile, "Ativo até 15 de novembro" (uma linha), badges
  em fileira, dia por extenso e primeiro nome do professor, "Ver agenda completa" no desktop, remover "Atalhos"
  (ou decidir), `padding: 48px`.

**G2: AgendaDesktop, AgendaMobile, ReservaDesktop, ReservaMobile** (T1, T2, T4, T6, T10).
- Agenda: retirar a navegação de semana do cabeçalho (ou movê-la), chips que encolhem ao conteúdo (`.fb-client-chip` sem
  `width: 100%`), célula em `flex` de linha, alturas da grade (`min-height: 56px`), alphas do cabeçalho e da hora,
  selo "Reservada" (remover ou decidir), chips de dia mobile com `rgba(255,255,255,0.85)` e branco sobre laranja.
- Reserva: `box-shadow` do cartão (desktop) e do sheet (mobile), subtítulo com "Hoje, ..." e primeiro nome do
  professor, `padding` inferior 28px, alvos de toque sem alterar o layout (T4), estado `erro_permissao` (decidir).

**G3: GamificacaoDesktop, GamificacaoMobile, PresencaMobile, MetasAdmin, DashboardAdmin** (T1, T2, T3, T4, T6, T7).
- Gamificação: histórico limitado a 3, badges bloqueados com progresso (depende de backend), "Metas do professor" com
  barra e `3/4` (depende de valor alvo), ranking com alphas do design, padding do topo 40px.
- Presença: alturas 67px/39px sem perder o alvo de 48px (T4), texto branco nos estados marcados, alphas 0,40, subtítulo
  "Hoje, 18h00", estado "presença ainda não abre" (sem design).
- Metas: barra de progresso e "Valor alvo" (backend), faixa de aviso com o texto do design, cartão sem botões
  (mover ações para um menu) e cores de T3.
- Dashboard: refazer com 4 cartões de KPI, painel "Ocupação por aula" com barras e painel "Gamificação" com ranking (dados já
  existem no contrato).

**G4: PerfilDesktop, PerfilMobile, PlanoDesktop, PlanoMobile, FichaTreinoDesktop, FichaTreinoMobile** (T2, T4, T5, T6).
- Perfil e Plano: padding 48px, alphas 0,45 nos rótulos e datas, "CPF" no lugar de "Documento", filete acima de "Sair da
  conta" no mobile, alturas do mobile sem quebrar o alvo de toque.
- Ficha de treino: `/ficha-treino` com a ficha ativa inline + "Fichas anteriores" (data início–fim depende do backend),
  título "Ficha de treino", "Montada por Prof. Rafael" (primeiro nome), cartões 548px (o prefixo "Obs. do professor: " já existe).

**G5: ClientesAdmin, UsuariosPerfis, TemplatesModalidades, AgendaAdmin, ReservasAdmin, PlanosAdmin, FichaTreinoAdmin** (T1, T3, T5, T7, T8).
- Casca administrativa: ordem e rótulos do menu, "Configurações" (decidir), remover bloco de conta ou aceitar como desvio.
- Clientes: botão na linha do título, tabela de 6 colunas com "Editar", filtro de plano e contagem, linhas inativas esmaecidas, link
  do nome sem sublinhado (ou decidir), diálogo de exclusão.
- Usuários e perfis: selos por perfil com as cores do design, "+ Novo usuário" e lista só da equipe (decidir), "Editar" na linha.
- Templates: retirar "Desativar" ou aceitar; largura das colunas.
- Agenda administrativa: chips vermelhos para "lotada", cores `#ed6e34`, primeiro nome do professor, semana sem botões (ou
  decidir), altura do cabeçalho de coluna.
- Reservas: busca de texto e selects "Status: todas"/"Data: hoje", coluna "Registro" (decidir), linhas esmaecidas, nome da modalidade.
- Planos: colunas Preço/Duração/Modalidades (depende de backend), corrigir a quebra do selo "ATIVO" e as ações em linha.
- Ficha de treino (admin): edição da ficha ativa com 5 colunas por exercício, "+ Nova ficha (nova fase)", rodapé com
  "Cancelar/Salvar ficha" nos tamanhos do design, "Fichas anteriores de ...".
