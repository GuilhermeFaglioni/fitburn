import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import {
  PermissionScope,
  type ModuleCatalog,
  type ModuleName,
  type PermissionActionName,
  type PermissionScopeName,
  type ProfileDetail,
} from "@fitburn/contracts";
import { ACTION_LABELS, MODULE_LABELS, SCOPE_LABELS } from "../lib/profiles/labels";
import { setModuleAccess } from "../lib/profiles/api";

const SYSTEM_ADMIN_NAME = "Administrador";
const SYSTEM_CLIENT_NAME = "Cliente";

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
      <th scope="row" className="fb-td" style={{ fontWeight: 500, textAlign: "left" }}>
        {MODULE_LABELS[module]}
      </th>
      {catalog.actions.map((action) => (
        <td key={action} className="fb-mtd">
          <input
            type="checkbox"
            className="fb-checkbox"
            aria-label={`${ACTION_LABELS[action]} em ${MODULE_LABELS[module]}`}
            checked={actions.includes(action)}
            disabled={isAdminLocked}
            onChange={() => toggleAction(action)}
          />
        </td>
      ))}
      <td className="fb-td fb-scope">
        {isClientScopeLocked ? (
          <span title="O isolamento do Cliente aos próprios registros não pode ser alterado.">
            {SCOPE_LABELS.OWN} (fixo)
          </span>
        ) : (
          <select
            className="fb-field"
            aria-label={`Escopo de ${MODULE_LABELS[module]}`}
            value={scope}
            disabled={isAdminLocked}
            onChange={(event) => setScope(event.target.value as PermissionScopeName)}
          >
            {catalog.scopes.map((s) => (
              <option key={s} value={s}>
                {SCOPE_LABELS[s]}
              </option>
            ))}
          </select>
        )}
      </td>
      <td className="fb-td">
        <button
          type="button"
          className="fb-row-btn"
          disabled={isAdminLocked || mutation.isPending}
          onClick={() => mutation.mutate()}
        >
          Salvar
        </button>
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
  const isAdminLocked = profile.isSystem && profile.name === SYSTEM_ADMIN_NAME;
  const isClientScopeLocked = profile.isSystem && profile.name === SYSTEM_CLIENT_NAME;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, flexGrow: 1, minHeight: 0 }}>
      <h2 className="fb-page-title" style={{ fontSize: 16 }}>
        Matriz de permissões — {profile.name}
      </h2>

      {isAdminLocked && (
        <p role="note" className="fb-lock-banner">
          O Administrador sempre tem acesso total a todos os módulos — a matriz não pode ser
          alterada.
        </p>
      )}
      {isClientScopeLocked && (
        <p role="note" className="fb-lock-banner">
          O isolamento do Cliente aos próprios registros é fixo e não pode ser alterado.
        </p>
      )}

      <div className="fb-table-wrap" style={{ opacity: isClientScopeLocked ? 0.55 : 1 }}>
        <table>
          <thead>
            <tr>
              <th scope="col" className="fb-th">
                Módulo
              </th>
              {catalog.actions.map((action) => (
                <th scope="col" key={action} className="fb-th" style={{ textAlign: "center" }}>
                  {ACTION_LABELS[action]}
                </th>
              ))}
              <th scope="col" className="fb-th">
                Escopo
              </th>
              <th scope="col" className="fb-th" />
            </tr>
          </thead>
          <tbody>
            {catalog.modules.map((module) => {
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
                  initialActions={existing?.actions ?? []}
                  initialScope={existing?.scope ?? PermissionScope.OWN}
                  onSaved={onChanged}
                />
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
