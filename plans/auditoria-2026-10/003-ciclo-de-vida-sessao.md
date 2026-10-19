# 003 — Ciclo de vida de sessão (refresh atômico, reset de senha, desativação)

- **Status**: DONE
- **Commit**: `d41947b` (API), `c173b36` (web)
- **Severity**: MEDIUM
- **Origem**: auditoria api-security M1, M2, M3 (M3 também em docs-conformance)
- **Escopo estimado**: `packages/api/src/auth/auth.service.ts`, `packages/api/src/permissions/permissions.guard.ts` (ou `auth/jwt-auth.guard.ts`), `packages/api/src/users/users.service.ts` (só `resetPassword`), testes `refresh.e2e-spec.ts`, `auth.e2e-spec.ts`, `users.e2e-spec.ts`, `permissions.e2e-spec.ts`
- **Ambiente**: siga `plans/auditoria-2026-10/_ambiente.md` com slug `p003`

## Problema

1. **Rotação concorrente (M3).** `AuthService.refresh` (`auth.service.ts:~54-96`) lê o token e checa `revokedAt` fora da transação; depois `refreshToken.update({ where: { id } , data: { revokedAt } })` sem condição. Duas chamadas simultâneas com o mesmo token criam **dois** sucessores ativos (e a detecção de reuso não dispara).
2. **Reset de senha não revoga sessões (M1).** `UsersService.resetPassword` (`users.service.ts:~184-189`) troca o hash mas mantém os refresh tokens (TTL de 7 dias). `deactivate` já chama `this.revokeSessions(tx, id)` — reuse.
3. **Desativado mantém acesso de equipe (M2).** `JwtAuthGuard` (`jwt-auth.guard.ts:~42-55`) só barra `DELETED`, de propósito: rotas de domínio do cliente respondem `USER_INACTIVE` com mensagem própria. Mas `PermissionsGuard` (`permissions.guard.ts:~28-53`) carrega o perfil sem checar `INACTIVE`, então uma conta de equipe desativada usa rotas administrativas por até 15 min com o access token antigo.

Referência: `docs/open-decisions.md:21` deixa validade/rotação/revogação em aberto; o código já escolheu rotação com detecção de reuso — este plano só torna essa escolha correta.

## Alvo

1. Consumo atômico do refresh token: dentro de uma transação interativa, `updateMany({ where: { id, revokedAt: null, expiresAt: { gt: now } }, data: { revokedAt: now } })`; só cria o sucessor se `count === 1`. Se `count === 0`, reler: se foi revogado (outra requisição venceu), aplicar a mesma política de reuso de hoje (revogar todas e 401 `sessionExpired`) — avalie e documente em comentário curto se a corrida legítima de duas abas deve ser tratada como reuso; a opção mais segura e coerente com o comentário atual é tratá-la como reuso. A checagem de usuário `ACTIVE` continua.
2. `resetPassword` revoga todos os refresh tokens do usuário na mesma transação (reuse `revokeSessions`).
3. `PermissionsGuard` rejeita usuário `INACTIVE` (além de `DELETED`, que já vira perfil `null`) — resposta consistente com o que as rotas de domínio fazem para inativo (veja o `ErrorCode.USER_INACTIVE` existente e o status usado no login, `auth.service.ts:~38-42`). Mantenha o `JwtAuthGuard` como está, e atualize o comentário dele, que hoje afirma que as rotas de domínio barram INACTIVE.

## Passos

1. Leia `auth.service.ts`, `auth.controller.ts`, `jwt-auth.guard.ts`, `permissions.guard.ts`, `permissions.service.ts`, `users.service.ts` (`deactivate`, `revokeSessions`, `resetPassword`) e os testes citados.
2. Testes (red primeiro):
   - duas `POST /api/auth/refresh` concorrentes (`Promise.all`) com o mesmo cookie → no máximo **um** 200; no banco, no máximo um refresh token ativo descendente; repetir o teste algumas vezes no mesmo `it` para reduzir falso verde;
   - reset de senha por admin → refresh com o cookie anterior → 401;
   - staff desativado, com access token emitido antes da desativação → rota protegida por `PermissionsGuard` (ex.: `GET /api/users`) → recusada; cliente inativo continua recebendo `USER_INACTIVE` nas rotas de domínio como hoje (regressão).
3. Implemente; rode a suíte da API, `pnpm typecheck` e lint direcionado.
4. Web: verifique se `packages/web` trata a nova resposta de inativo em rotas de equipe sem quebrar (ex.: mensagem/logout). Não mude layout; se precisar de ajuste, mínimo e com teste.

## Boundaries

- Não toque em atribuição de perfil (`createStaff`/`update`) nem em `profiles/*` (plano 001).
- Não altere TTLs nem o formato do cookie.
- Não introduza versão de sessão/blacklist de access token (fora do escopo; anote como melhoria futura).

## Melhoria futura

- Avaliar versionamento de sessão ou blacklist para invalidar access tokens emitidos antes da expiração, especialmente após reset de senha. Este plano revoga refresh tokens; access tokens existentes continuam sujeitos ao TTL normal.

## Aceitação

- Testes novos falham antes e passam depois; suíte verde.
- Commit `fix(api): torna a rotação de refresh atômica e revoga sessões no reset e na desativação`.
