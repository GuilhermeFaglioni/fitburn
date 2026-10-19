# 004 — Sessão encerrada na web e erros silenciosos na tela de Perfis

- **Status**: DONE
- **Commit**: `7c439cd7927548ac9c673547934c848fe1bdb132`
- **Severity**: HIGH (sessão) / MEDIUM (Perfis)
- **Origem**: auditoria web (Alto: sessão revogada; Médio: falhas silenciosas em Perfis)
- **Escopo estimado**: `packages/web/src/lib/auth/*`, `packages/web/src/pages/ProfilesPage.tsx`, testes em `packages/web/test/`
- **Ambiente**: siga `plans/auditoria-2026-10/_ambiente.md` com slug `p004` (não precisa de banco; só `pnpm install`, build dos contracts e testes web)

## Problema

1. **Sessão encerrada não derruba a interface.** Após login, se o servidor revoga/expira o refresh, uma chamada protegida recebe 401 → `authFetch` (`authFetch.ts:~32-42`) tenta `/auth/refresh`, que responde 401/403; `api.ts:~75-77,94-96` limpa o `tokenStore`, mas `refreshSession()` reduz tanto `ended` quanto erro transitório a `null`. `authFetch` devolve o 401 sem avisar o `AuthProvider` (`AuthContext.tsx:~50-76`): `user` continua preenchido, `SessionCacheReset` (`SessionCacheReset.tsx:~10-16`) não limpa o cache do React Query e a tela protegida continua mostrando dados.
2. **Perfis falham em silêncio.** `ProfilesPage.tsx` (`~31-32, 38-55, 61-65, 123-157`): se `GET /profiles` ou `GET /profiles/catalog` falham, a lista/matriz fica vazia sem loading/erro/retry; mutations de criar/desativar/reativar não têm `onError`.

Referências: `docs/mvp-web-pwa.md:420-430` (sessão com refresh `HttpOnly`), `:166-210` (gestão de perfis).

## Alvo

1. Distinguir `ended` de falha transitória até o contexto de auth. Em `ended`: limpar `user`, limpar o cache do React Query (o mecanismo de `SessionCacheReset` já existe — reuse) e mandar para o login (comportamento igual ao logout atual). Em falha transitória (rede/5xx no refresh): manter usuário e cache e deixar o erro da chamada aparecer como hoje. Mecanismo sugerido: um evento/assinatura tipado no módulo de auth (ex.: `onSessionEnded(listener)`) emitido por `authFetch`/`refreshSession` quando o outcome é `ended`, assinado pelo `AuthProvider`. Prefira o padrão que o código já usa para `tokenStore`.
2. `ProfilesPage`: usar os componentes de estado já existentes no app (`LoadingState`, `ErrorState` com `refetch`, `Feedback` — procure como outras páginas fazem, ex.: páginas de usuários/planos) para as duas consultas; `onError` nas mutations exibindo `Feedback` de erro com a mensagem da API; desabilitar o botão enquanto a mutation está pendente.

## Passos

1. Leia `lib/auth/*` (api.ts, authFetch.ts, token-store.ts, AuthContext.tsx, SessionCacheReset.tsx) e seus testes; leia `ProfilesPage.tsx` e `test/ProfilesPage.test.tsx`; veja uma página que já trata loading/erro/feedback para copiar o padrão.
2. Testes (red primeiro):
   - integrado `AuthProvider` + `authFetch`: login ok → refresh responde 401 → usuário vira `null`, cache limpo, rota volta ao login; variação com refresh falhando por rede → usuário e dados preservados;
   - `ProfilesPage`: 5xx em cada consulta mostra erro com "tentar novamente" que refaz a consulta; erro em criar/desativar/reativar mostra feedback de erro.
3. Implemente; rode `pnpm --filter @fitburn/web test`, `pnpm --filter @fitburn/web typecheck`, `pnpm --filter @fitburn/web build`.

## Boundaries

- **Fidelidade de design:** as telas seguem o canvas pixel a pixel. Não mude layout, espaçamento, cores ou tipografia; use os componentes de estado/feedback já existentes, com o visual que já têm. Não mexa no contraste dos CTAs.
- Não mude a API nem os contratos.
- Não introduza bibliotecas novas.

## Aceitação

- Testes novos falham antes e passam depois; testes, typecheck e build da web verdes.
- Commit(s): `fix(web): encerra a sessão na interface quando o refresh termina` e `fix(web): mostra carregamento e erros na tela de perfis`.
