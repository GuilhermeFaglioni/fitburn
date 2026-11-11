import { useId, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import {
  Module,
  PermissionAction,
  PermissionScope,
  type ModuleCatalog,
  type ModuleName,
  type PermissionActionName,
  type PermissionScopeName,
  type ProfileDetail,
} from "@fitburn/contracts";
import { ACTION_LABELS, MODULE_LABELS, SCOPE_LABELS } from "../lib/profiles/labels";
import { setModuleAccess } from "../lib/profiles/api";
import { BlockedAction } from "../components/BlockedAction";
import { Alert } from "../components/ui/Alert";
import { Button } from "../components/ui/Button";
import { Checkbox } from "../components/ui/Checkbox";
import { Select } from "../components/ui/Select";
import { useAuth } from "../lib/auth/AuthContext";

const SYSTEM_ADMIN_NAME = "Administrador";
const SYSTEM_CLIENT_NAME = "Cliente";
/** Ordem dos módulos no design; os que ele não mostra vêm depois. */
const MODULE_ORDER: ModuleName[] = [
  Module.CLIENTES,
  Module.OCORRENCIAS,
  Module.RESERVAS,
  Module.PLANOS,
  Module.FICHAS_DE_TREINO,
  Module.GAMIFICACAO,
  Module.LOJA,
  Module.USUARIOS,
  Module.PERFIS_DE_ACESSO,
];

function sortModules(modules: ModuleName[]): ModuleName[] {
  const rank = (module: ModuleName) => {
    const index = MODULE_ORDER.indexOf(module);
    return index === -1 ? MODULE_ORDER.length : index;
  };
  return [...modules].sort((a, b) => rank(a) - rank(b));
}

const NO_EDIT_REASON = "Você não tem permissão para alterar perfis.";

function ModuleRow({
  profile,
  module,
  catalog,
  initialActions,
  initialScope,
  onSaved,
}: {
  profile: ProfileDetail;
  module: ModuleName;
  catalog: ModuleCatalog;
  initialActions: PermissionActionName[];
  initialScope: PermissionScopeName;
  onSaved: () => void;
}) {
  const [actions, setActions] = useState<PermissionActionName[]>(initialActions);
  const [scope, setScope] = useState<PermissionScopeName>(initialScope);
  // Sem a ação EDIT em Perfis de acesso a matriz é só leitura (a API recusaria o Salvar com 403).
  const { can } = useAuth();
  const canEdit = can(Module.PERFIS_DE_ACESSO, PermissionAction.EDIT);

  const isAdminLocked = profile.isSystem && profile.name === SYSTEM_ADMIN_NAME;
  const isClientScopeLocked = profile.isSystem && profile.name === SYSTEM_CLIENT_NAME;

  const mutation = useMutation({
    mutationFn: () => setModuleAccess(profile.id, module, actions, scope),
    onSuccess: onSaved,
  });

  function toggleAction(action: PermissionActionName) {
    setActions((current) =>
      current.includes(action) ? current.filter((a) => a !== action) : [...current, action],
    );
  }

  return (
    <tr>
      <th scope="row" className="fb-ui-table__rowhead">
        {MODULE_LABELS[module]}
      </th>
      {catalog.actions.map((action) => (
        <td key={action} className="fb-ui-table__center">
          <BlockedAction allowed={canEdit} reason={NO_EDIT_REASON}>
            <Checkbox
              label={
                <span className="fb-ui-sr-only">{`${ACTION_LABELS[action]} em ${MODULE_LABELS[module]}`}</span>
              }
              checked={actions.includes(action)}
              disabled={isAdminLocked}
              onChange={() => toggleAction(action)}
            />
          </BlockedAction>
        </td>
      ))}
      <td>
        {isAdminLocked ? (
          SCOPE_LABELS[scope]
        ) : isClientScopeLocked ? (
          <span title="O isolamento do Cliente aos próprios registros não pode ser alterado.">
            {SCOPE_LABELS.OWN} (fixo)
          </span>
        ) : (
          <BlockedAction allowed={canEdit} reason={NO_EDIT_REASON}>
            <Select
              label={`Escopo de ${MODULE_LABELS[module]}`}
              hideLabel
              value={scope}
              disabled={isAdminLocked}
              onChange={(event) => setScope(event.target.value as PermissionScopeName)}
            >
              {catalog.scopes.map((s) => (
                <option key={s} value={s}>
                  {SCOPE_LABELS[s]}
                </option>
              ))}
            </Select>
          </BlockedAction>
        )}
      </td>
      <td className="fb-ui-table__actions">
        {!isAdminLocked && (
          <BlockedAction allowed={canEdit} reason={NO_EDIT_REASON}>
            <Button
              size="sm"
              aria-label={`Salvar permissões de ${MODULE_LABELS[module]}`}
              disabled={mutation.isPending}
              onClick={() => mutation.mutate()}
            >
              Salvar
            </Button>
          </BlockedAction>
        )}
        {mutation.isError && (
          <Alert>{mutation.error.message || "Não foi possível salvar as permissões."}</Alert>
        )}
      </td>
    </tr>
  );
}

export function ProfileMatrix({
  profile,
  catalog,
  onChanged,
}: {
  profile: ProfileDetail;
  catalog: ModuleCatalog;
  onChanged: () => void;
}) {
  const headingId = useId();
  const isAdminLocked = profile.isSystem && profile.name === SYSTEM_ADMIN_NAME;
  const isClientScopeLocked = profile.isSystem && profile.name === SYSTEM_CLIENT_NAME;

  return (
    <section className="fb-ui-stack" aria-labelledby={headingId}>
      <h2 id={headingId} className="fb-ui-section-title">
        Matriz de permissões — {profile.name}
      </h2>

      {isAdminLocked && (
        <p role="note" className="fb-ui-sr-only">
          O Administrador sempre tem acesso total a todos os módulos — a matriz não pode ser
          alterada.
        </p>
      )}
      {isClientScopeLocked && (
        <p role="note" className="fb-ui-notice">
          <span aria-hidden="true">🔒</span>
          <span>
            O perfil <strong>Cliente</strong> possui acesso restrito aos próprios dados por regra do
            sistema. Esta matriz é fixa e não pode ser alterada, para garantir que um cliente nunca
            visualize dados de outros clientes.
          </span>
        </p>
      )}

      {/* Mesma moldura da `Table` (região rolável e rotulada), com marcação própria: cada linha tem estado local. */}
      <div
        role="region"
        aria-label={`Permissões do perfil ${profile.name}`}
        tabIndex={0}
        className="fb-ui-table-wrap"
      >
        <table
          className="fb-ui-table fb-ui-table--matrix"
          aria-label={`Matriz de permissões — ${profile.name}`}
        >
          <thead>
            <tr>
              <th scope="col">Módulo</th>
              {catalog.actions.map((action) => (
                <th scope="col" key={action} className="fb-ui-table__center">
                  {ACTION_LABELS[action]}
                </th>
              ))}
              <th scope="col">Escopo</th>
              <th scope="col" className="fb-ui-table__actions">
                Ações
              </th>
            </tr>
          </thead>
          <tbody>
            {sortModules(catalog.modules).map((module) => {
              const existing = profile.moduleAccess.find((entry) => entry.module === module);
              return (
                <ModuleRow
                  // Precisa incluir o id do perfil: as linhas têm estado local
                  // (checkboxes/escopo) inicializado só no primeiro mount. Sem
                  // isso, trocar de perfil reaproveita as mesmas linhas (mesma
                  // key "module") e mantém os valores do perfil anterior em
                  // vez de reinicializar a partir do moduleAccess do novo.
                  key={`${profile.id}-${module}`}
                  profile={profile}
                  module={module}
                  catalog={catalog}
                  // O Administrador tem acesso total implícito (a API não lista módulos para ele).
                  initialActions={isAdminLocked ? catalog.actions : (existing?.actions ?? [])}
                  initialScope={
                    isAdminLocked ? PermissionScope.ALL : (existing?.scope ?? PermissionScope.OWN)
                  }
                  onSaved={onChanged}
                />
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
