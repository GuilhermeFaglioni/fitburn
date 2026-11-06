# Prova em navegador real: renovar a sessão entre duas abas

Roda o Chromium com **duas abas do mesmo contexto** (mesmo cookie de refresh) contra a API e o web
reais e mostra que a renovação coordenada por Web Locks (`refresh-lock.ts`) não derruba a sessão.
Complementa o teste de duas abas do Vitest (`packages/web/test/RefreshAcrossTabs.test.ts`), que é a
cobertura da CI. **Este script não roda na CI** (ela não instala navegador); rode à mão e cole o
resultado no PR.

## Segurança

Só toca o banco `fitburn_test_<nº>` apontado por `DATABASE_URL_TEST` (ex.: `fitburn_test_77`).
O script **recusa rodar** se o nome do banco não casar com `^fitburn_test_\d+$`. Nunca lê
`DATABASE_URL`, nunca usa `fitburn_dev` nem chama `demo:reset`/seeds. Cria um usuário **sintético**
(`sessao-duas-abas-<id>@fitburn.local`) com um perfil de equipe mínimo e apaga os dois ao final.

## Pré-requisitos

- `.env` na raiz com `DATABASE_URL_TEST` apontando para `fitburn_test_<nº>`, com as migrations
  aplicadas (`pnpm prisma:migrate:test`) e o Postgres no ar (`pnpm db:up`).
- `pnpm install` e `@fitburn/contracts` buildado (`pnpm --filter @fitburn/contracts build`).
- Chromium do Playwright instalado localmente. Se a revisão do cache não for a que o
  `playwright-core` espera, o script usa o `chromium_headless_shell-*` mais novo do cache
  (`~/Library/Caches/ms-playwright`); `CHROMIUM_PATH` força um executável.

## Como rodar

```bash
pnpm session:two-tabs
```

Variáveis opcionais: `SESSION_TWO_TABS_ROUNDS` (rodadas dos cenários A e B, padrão 3) e
`SESSION_TWO_TABS_CONTROL_ATTEMPTS` (tentativas do controle negativo, padrão 10).

O script compila a API (`tsc`, saída em `packages/api/dist`), sobe-a numa porta livre contra o banco
de teste, gera o build do web em `packages/web/node_modules/.cache/session-two-tabs` e o serve com
`vite preview` (proxy `/api` para a API, via config derivada do `vite.config.ts` sem alterá-lo).
Usa o **build de produção** de propósito: o `vite dev` roda o React em StrictMode, que dispara a
restauração da sessão duas vezes por aba e mascararia o cenário. API e web são encerrados ao final,
mesmo com erro.

## O que prova

Em cada rodada (contexto novo, login pela UI numa aba, a outra abre com o cookie compartilhado):

- **A, restauração simultânea:** as duas abas recarregam ao mesmo tempo (`Promise.all` de
  `page.reload()`); ambas terminam autenticadas e a cadeia de refresh tokens no banco é consistente:
  nenhum `/auth/refresh` recusado (nenhum token reapresentado), um token ativo e todos os demais
  revogados (um sucessor por token consumido).
- **B, 401 simultâneo:** `GET /api/clients` responde 401 uma vez em cada aba (access token
  "expirado"); as duas abas navegam para Clientes ao mesmo tempo, renovam, repetem a requisição
  (200) e seguem autenticadas, com a mesma verificação da cadeia.
- **Controle negativo (evidência, não afeta o código de saída):** repete o cenário A num contexto
  sem `navigator.locks` (via `addInitScript`). A API revoga todas as sessões do usuário quando um
  token consumido é reapresentado, então a corrida real derruba uma das abas (tela de login, zero
  tokens ativos). O resumo informa em quantas das tentativas a sessão caiu; se não reproduzir, o
  resumo diz isso.

Sai com código 0 quando A e B passam em todas as rodadas; código diferente de 0 se algum cenário
legítimo falhar (ou se o banco não for `fitburn_test_<nº>`).
