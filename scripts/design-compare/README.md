# design-compare

Compara o app web com os 27 artboards do Claude Design (`.dc.html`): renderiza os dois no mesmo viewport, gera
PNGs, uma imagem de diferença, a porcentagem de pixels diferentes, as medidas de cada elemento (texto, fonte,
cor, caixa, raio, posição) e um ranking. O relatório com a leitura das divergências está em
`docs/design-fidelity-report.md`.

Saídas em `tmp/design-compare/` (ignorado pelo git):

```
design/<Tela>[__<estado>].png|json   artboards renderizados (+ medidas)
app/<Tela>[__<estado>].png|json      telas do app no mesmo viewport (+ medidas)
diff/<Tela>.side.png                 design | app | diferença
diff/<Tela>.diff.png                 só a diferença
divergences/<Tela>.md                divergências medidas (texto, estilo, caixa, posição)
report.md / report.json              ranking da mais para a menos divergente
```

## 1. Baixar o design (uma vez)

O runtime do tipo Design (`dc-runtime.js`) e os artboards ficam no artefato
`https://claude.ai/artifact/VncuMf9CffiWGUEQYywLVX`. Com a ferramenta `Artifact` (action `read`, `paths`), salve em
`tmp/design-compare/source/` (ou em outra pasta e aponte `DESIGN_DIR`):

```
project/*.dc.html
project/canvas.json
project/ds/fitburn/tokens.json
artifact-type/dc-runtime.js
```

O `dc-runtime.js` é o mesmo que o canvas carrega (serve como `support.js`). A ferramenta o serve por um servidor local
e passa as props de cada estado (`?props=`), então nada precisa ser editado nos artboards.

## 2. Subir o app com dados de demonstração

Banco de teste (exemplo com `fitburn_test_60`; qualquer banco de teste livre serve):

```bash
pnpm install --frozen-lockfile
cp <repo principal>/.env .env         # e troque o nome do banco em DATABASE_URL e DATABASE_URL_TEST
                                       # NODE_ENV="development"
pnpm --filter @fitburn/contracts build
pnpm --filter @fitburn/api prisma:generate
pnpm --filter @fitburn/api prisma:migrate:test
pnpm --filter @fitburn/api prisma:seed  # admin inicial
pnpm dev:api    # http://localhost:3333/api
pnpm dev:web    # http://localhost:5173 (o Vite faz proxy de /api)
pnpm design:seed
```

`pnpm design:seed` (`seed-demo.mjs`) é temporário e reutilizável: cria pela API (o admin do seed) modalidades,
templates, professores, recepção, clientes, planos, atribuições, a grade das próximas semanas, reservas, fichas e metas,
com os nomes e números dos artboards (Marina Souza, Plano Performance, Treino Funcional 18h00, Muay Thai lotada...).
Pode ser rodado de novo: o que já existe é reaproveitado. Para o histórico de presenças (pontos, streaks, ranking) a API
não deixa mudar o horário de uma aula com reservas, então o script move as aulas para o passado direto na tabela
`class_occurrences` do banco de teste (único ponto que escreve fora da API). **Não use fora de um banco de teste.**

Todas as contas usam a senha `INITIAL_ADMIN_PASSWORD` do `.env` (nada de credencial no repositório):

| Perfil    | E-mail                        |
| --------- | ----------------------------- |
| admin     | `INITIAL_ADMIN_EMAIL`         |
| professor | `rafael.prof@fitburn.example` |
| cliente   | `marina.souza@email.com`      |

## 3. Comparar

```bash
export DESIGN_DIR=tmp/design-compare/source   # padrão; ajuste se baixou em outro lugar
pnpm design:compare                # design + app + comparação + relatório (cerca de 4 min)
pnpm design:compare design         # só renderiza os artboards
pnpm design:compare app            # só captura o app
pnpm design:compare compare        # só compara os arquivos já gerados
pnpm design:compare all --only=Login,HomeMobile
```

Variáveis: `DESIGN_DIR`, `WEB_URL` (padrão `http://localhost:5173`), `API_URL` (padrão `http://localhost:3333/api`),
`DESIGN_COMPARE_OUT`, `CHROMIUM_PATH` (o ambiente já traz o Chromium em `/opt/pw-browsers`).

## Como funciona

- `lib/captures.mjs`: o mapa artboard -> tela do app (perfil, rota, passos de clique) e os estados alternativos.
  Estados com `app.variants` são capturados e comparados dos dois lados; `design.variants` sem par só são renderizados.
- `lib/render-design.mjs` + `design-server.mjs`: renderiza cada artboard no tamanho de `canvas.json`. `this.props.x` vira
  `window.__DCP.x`, preenchido por estado. As fontes (Cormorant e DM Sans) são injetadas por `<link>`, porque o `@import` dos
  artboards vem depois de outras regras e o navegador o ignora.
- `lib/capture-app.mjs`: entra por perfil (uma sessão por perfil) e captura a tela no mesmo viewport (largura e altura do
  artboard). Registra também a altura total da página.
- `lib/fonts.mjs`: o Chromium não usa o proxy do ambiente; as fontes do Google são baixadas com `curl`, guardadas em
  `tmp/design-compare/fonts` e servidas por `page.route`.
- `lib/extract.mjs` + `divergences.mjs`: extraem texto, tipografia, cor, caixa, raio, sombra e posição dos dois lados e
  pareiam por texto para listar divergências concretas.
- `lib/compare.mjs`: `pixelmatch` (limiar 0,1), lado a lado, `% de pixels` e `% do conteúdo` (pixels que não são fundo).

Limitações: a captura depende dos dados do seed (a Agenda usa a semana atual; o Reserva mobile abre a sexta-feira);
os passos de clique procuram botões por nome; telas que só existem no app ou só no design ficam sem par.
