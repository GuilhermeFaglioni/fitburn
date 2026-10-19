# 001 — Autoelevação de privilégio (usuários e perfis)

- **Status**: TODO
- **Commit**: —
- **Severity**: HIGH
- **Origem**: auditoria api-security A1, A2, A3
- **Escopo estimado**: `packages/api/src/users/*`, `packages/api/src/profiles/*`, `packages/api/src/permissions/*`, testes e2e em `packages/api/test/`
- **Ambiente**: siga `plans/auditoria-2026-10/_ambiente.md` com slug `p001`

## Problema

Três caminhos deixam uma conta de equipe ganhar mais autoridade do que tem:

1. **Atribuição de perfil (A1).** `PATCH /api/users/:id` (`users.controller.ts:93-102`) só checa `assertUserInScope` (escopo OWN permite o próprio id). `UsersService.update` (`users.service.ts:123-136`) aceita qualquer `profileId` existente. Quem tem `USUARIOS/EDIT` com escopo OWN troca o próprio perfil para **Administrador**; o `PermissionsGuard` relê o perfil a cada requisição, então vale na hora. `POST /api/users/staff` (`users.controller.ts:84-90`, `createStaff` em `users.service.ts:105-120`) também aceita qualquer `profileId`, deixando quem tem `USUARIOS/CREATE` criar uma conta Administrador.
2. **Edição da matriz (A2).** `PUT /api/profiles/:id/module-access/:module` (`profiles.controller.ts:96-109` → `ProfilesService.setModuleAccess`, `profiles.service.ts:101-137`) não recebe o solicitante. Quem tem `PERFIS_DE_ACESSO/EDIT` concede ao próprio perfil qualquer ação com escopo `ALL`.
3. **Renomear perfil de sistema (A3).** `ProfilesService.update` (`profiles.service.ts:51-71`) não chama `assertNotSystem`. O motor identifica Administrador/Cliente por `isSystem && name === "Administrador" | "Cliente"` (`permissions.service.ts:14-15,82-90`; `client-scope.ts:14-16` usa `SystemProfileName.CLIENT`). Renomear o Administrador tira o acesso total de todos os admins (e o perfil de sistema não tem linhas de permissão, então não há como desfazer pela API); renomear Cliente desliga o piso de escopo OWN e os filtros de clientes.

Regra de referência: `docs/mvp-web-pwa.md:168-176` (gestão de usuários e perfis é do administrador) e `:202` (isolamento do cliente não pode ser removido).

## Alvo (política)

Introduza uma regra única de **teto de privilégio**, aplicada no serviço (não só no controller):

- Um ator só pode **conceder** (via atribuição de perfil ou via matriz) permissões que **ele mesmo possui** naquele módulo: cada ação concedida ⊆ ações efetivas do ator, e o escopo concedido não pode ser mais amplo que o escopo efetivo do ator (ordem de amplitude: `OWN` < `ASSIGNED_CLIENTS`/`ASSIGNED_CLASSES` < `ALL`; trate os dois "ASSIGNED" como equivalentes entre si e menores que `ALL`).
- O perfil de sistema **Administrador** só pode ser atribuído (criação de staff ou edição de usuário) por quem é Administrador de sistema.
- Um ator **não-administrador** não pode alterar o `profileId` de si mesmo, nem a matriz do **próprio** perfil.
- Administrador de sistema continua sem restrições (bypass atual de `PermissionsService`).
- Perfis de sistema: o **nome** é imutável (`update` com `name` diferente do atual → `SYSTEM_PROFILE_IMMUTABLE`, 422, mensagem em português no estilo das existentes). `description` pode continuar editável.

Violações retornam `DomainError(ErrorCode.FORBIDDEN, <mensagem pt-BR>, ErrorStatus.FORBIDDEN)` (ou `OUT_OF_SCOPE` se for mais coerente com códigos existentes — verifique `packages/contracts/src/errors*` e use o que já existir; **não** crie código de erro novo sem necessidade; se criar, adicione ao contrato e trate na web se houver mapeamento de mensagens).

## Passos

1. Leia `permissions.service.ts`, `permissions.guard.ts`, `scoped-requester.ts`, `users.controller.ts`, `users.service.ts`, `profiles.controller.ts`, `profiles.service.ts` e os testes `test/permissions.e2e-spec.ts`, `test/profiles.e2e-spec.ts`, `test/users.e2e-spec.ts`.
2. Em `PermissionsService`, exponha um helper reutilizável (ex.: `assertCanGrant(actorProfile, targetProfileOrMatrix)` / `isSystemAdmin` público) que compara permissões efetivas do ator com as do perfil alvo (para atribuição) ou com `{module, actions, scope}` (para matriz). Reuse `getEffectivePermissions`/`getEffectiveScope`; não duplique a lógica de piso do Cliente.
3. Passe o solicitante (id + perfil) do controller para `UsersService.createStaff`, `UsersService.update` (só quando `profileId` vier) e `ProfilesService.setModuleAccess`. Siga o padrão existente de `requesterOf(req)` / `AuthenticatedRequest`.
4. Em `ProfilesService.update`, bloqueie mudança de nome de perfil de sistema.
5. Testes e2e (red → green), no estilo dos arquivos existentes (factories, `login-helper`):
   - perfil custom com `USUARIOS/EDIT` escopo OWN → `PATCH /users/<próprio>` com `profileId` do Administrador → 403 e perfil inalterado;
   - perfil custom com `USUARIOS/CREATE` → `POST /users/staff` com perfil Administrador → 403; com perfil cujas permissões ⊆ às do ator → 201;
   - perfil custom com `PERFIS_DE_ACESSO/EDIT` → `PUT` da matriz do **próprio** perfil → 403; de outro perfil concedendo ação que o ator não tem → 403; concedendo subconjunto → 200;
   - `PATCH /profiles/<Administrador>` e `<Cliente>` com `name` novo → 422 e nome inalterado; com só `description` → 200;
   - Administrador de sistema continua conseguindo tudo isso (regressão).
6. Rode a suíte inteira da API, `pnpm typecheck` e o lint direcionado.
7. Verifique a web: se `packages/web` exibe mensagens por `ErrorCode`, confirme que os novos 403/422 aparecem de forma legível nas telas de usuários/perfis (sem mudar layout). Ajuste testes web só se quebrarem.

## Boundaries

- Não altere o schema Prisma nem crie migration (um identificador imutável de perfil de sistema é melhoria futura — anote no relatório final, não implemente).
- Não toque em `auth/*` nem em `resetPassword`/`deactivate` de `users.service.ts` (plano 003 mexe neles).
- Não mude contratos de resposta existentes.

## Aceitação

- Todos os testes novos falham antes da correção e passam depois; suíte da API, typecheck e lint verdes.
- Commit `fix(api): impede autoelevação de privilégio em usuários e perfis`.
