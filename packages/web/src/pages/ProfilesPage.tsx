import { useId, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Module, PermissionAction } from "@fitburn/contracts";
import { BlockedAction } from "../components/BlockedAction";
import { useAuth } from "../lib/auth/AuthContext";
import {
  activateProfile,
  createProfile,
  deactivateProfile,
  getCatalog,
  listProfiles,
} from "../lib/profiles/api";
import { ProfileMatrix } from "./ProfileMatrix";

export function ProfilesPage() {
  const { can } = useAuth();
  const queryClient = useQueryClient();
  const formId = useId();

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDescription, setNewDescription] = useState("");

  const profilesQuery = useQuery({ queryKey: ["profiles"], queryFn: listProfiles });
  const catalogQuery = useQuery({ queryKey: ["profiles", "catalog"], queryFn: getCatalog });

  function invalidateProfiles() {
    return queryClient.invalidateQueries({ queryKey: ["profiles"] });
  }

  const createMutation = useMutation({
    mutationFn: () => createProfile({ name: newName, description: newDescription || undefined }),
    onSuccess: () => {
      setShowCreateForm(false);
      setNewName("");
      setNewDescription("");
      void invalidateProfiles();
    },
  });

  const deactivateMutation = useMutation({ mutationFn: deactivateProfile, onSuccess: invalidateProfiles });
  const activateMutation = useMutation({ mutationFn: activateProfile, onSuccess: invalidateProfiles });

  const canCreate = can(Module.PERFIS_DE_ACESSO, PermissionAction.CREATE);
  const canEdit = can(Module.PERFIS_DE_ACESSO, PermissionAction.EDIT);

  const selectedProfile = profilesQuery.data?.find((profile) => profile.id === selectedId) ?? null;

  function handleCreateSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    createMutation.mutate();
  }

  return (
    <div className="fb-matrix-layout">
      <ul className="fb-role-list" style={{ listStyle: "none", margin: 0, padding: 0 }}>
        {profilesQuery.data?.map((profile) => (
          <li key={profile.id} style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <button
              type="button"
              className={`fb-role-item${selectedId === profile.id ? " active" : ""}`}
              style={{ flexGrow: 1 }}
              onClick={() => setSelectedId(profile.id)}
            >
              {profile.name}
              {!profile.isActive && " (inativo)"}
            </button>
            {!profile.isSystem && (
              <BlockedAction allowed={canEdit} reason="Você não tem permissão para alterar perfis.">
                {profile.isActive ? (
                  <button type="button" className="fb-row-btn" onClick={() => deactivateMutation.mutate(profile.id)}>
                    Desativar
                  </button>
                ) : (
                  <button type="button" className="fb-row-btn" onClick={() => activateMutation.mutate(profile.id)}>
                    Reativar
                  </button>
                )}
              </BlockedAction>
            )}
          </li>
        ))}

        <li>
          <BlockedAction allowed={canCreate} reason="Você não tem permissão para criar perfis.">
            <button type="button" className="fb-btn-dashed" onClick={() => setShowCreateForm((visible) => !visible)}>
              {showCreateForm ? "Cancelar" : "+ Novo perfil"}
            </button>
          </BlockedAction>
        </li>
      </ul>

      <div className="fb-matrix-content">
        {showCreateForm && (
          <form onSubmit={handleCreateSubmit} aria-label="Novo perfil de acesso" className="fb-form">
            <label htmlFor={`${formId}-name`}>Nome</label>
            <input
              id={`${formId}-name`}
              className="fb-field"
              value={newName}
              onChange={(event) => setNewName(event.target.value)}
              required
            />
            <label htmlFor={`${formId}-description`}>Descrição</label>
            <input
              id={`${formId}-description`}
              className="fb-field"
              value={newDescription}
              onChange={(event) => setNewDescription(event.target.value)}
            />
            <button type="submit" className="fb-btn-primary">
              Criar perfil
            </button>
          </form>
        )}

        {selectedProfile && catalogQuery.data && (
          <ProfileMatrix profile={selectedProfile} catalog={catalogQuery.data} onChanged={invalidateProfiles} />
        )}
      </div>
    </div>
  );
}
