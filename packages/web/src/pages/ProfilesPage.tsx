import { useId, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Module, PermissionAction, SystemProfileName } from "@fitburn/contracts";
import { BlockedAction } from "../components/BlockedAction";
import { EmptyState, ErrorState, Feedback, LoadingState } from "../components/states";
import { errorMessage } from "../lib/auth/api";
import { useAuth } from "../lib/auth/AuthContext";
import {
  activateProfile,
  createProfile,
  deactivateProfile,
  getCatalog,
  listProfiles,
} from "../lib/profiles/api";
import { ProfileMatrix } from "./ProfileMatrix";

function profileRank(profile: { name: string; isSystem: boolean }): number {
  if (profile.isSystem && profile.name === SystemProfileName.ADMIN) return 0;
  if (profile.isSystem && profile.name === SystemProfileName.CLIENT) return 2;
  return 1;
}

export function ProfilesPage() {
  const { can } = useAuth();
  const queryClient = useQueryClient();
  const formId = useId();

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [mutationError, setMutationError] = useState<string | null>(null);

  const profilesQuery = useQuery({ queryKey: ["profiles"], queryFn: listProfiles });
  const catalogQuery = useQuery({ queryKey: ["profiles", "catalog"], queryFn: getCatalog });

  function invalidateProfiles() {
    return queryClient.invalidateQueries({ queryKey: ["profiles"] });
  }

  const createMutation = useMutation({
    mutationFn: () => createProfile({ name: newName, description: newDescription || undefined }),
    onMutate: () => setMutationError(null),
    onError: (error) => setMutationError(errorMessage(error, "Não foi possível criar o perfil.")),
    onSuccess: () => {
      setShowCreateForm(false);
      setNewName("");
      setNewDescription("");
      void invalidateProfiles();
    },
  });

  const deactivateMutation = useMutation({
    mutationFn: deactivateProfile,
    onMutate: () => setMutationError(null),
    onError: (error) =>
      setMutationError(errorMessage(error, "Não foi possível desativar o perfil.")),
    onSuccess: invalidateProfiles,
  });
  const activateMutation = useMutation({
    mutationFn: activateProfile,
    onMutate: () => setMutationError(null),
    onError: (error) =>
      setMutationError(errorMessage(error, "Não foi possível reativar o perfil.")),
    onSuccess: invalidateProfiles,
  });

  const canCreate = can(Module.PERFIS_DE_ACESSO, PermissionAction.CREATE);
  const canEdit = can(Module.PERFIS_DE_ACESSO, PermissionAction.EDIT);

  // Ordem do design: Administrador primeiro, Cliente por último; o primeiro já vem selecionado.
  const profiles = [...(profilesQuery.data ?? [])].sort(
    (a, b) => profileRank(a) - profileRank(b) || a.name.localeCompare(b.name, "pt-BR"),
  );
  const selectedProfile =
    profiles.find((profile) => profile.id === selectedId) ?? profiles[0] ?? null;

  function handleCreateSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    createMutation.mutate();
  }

  return (
    <div className="fb-matrix-layout">
      <ul className="fb-role-list" style={{ listStyle: "none", margin: 0, padding: 0 }}>
        {profilesQuery.isLoading && (
          <li>
            <LoadingState />
          </li>
        )}
        {profilesQuery.isError && (
          <li>
            <ErrorState
              message="Não foi possível carregar os perfis."
              onRetry={() => void profilesQuery.refetch()}
            />
          </li>
        )}
        {profilesQuery.data?.length === 0 && (
          <li>
            <EmptyState message="Nenhum perfil cadastrado." />
          </li>
        )}
        {profilesQuery.data?.map((profile) => (
          <li key={profile.id} style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <button
              type="button"
              className={`fb-role-item${selectedProfile?.id === profile.id ? " active" : ""}`}
              style={{ flexGrow: 1 }}
              onClick={() => setSelectedId(profile.id)}
            >
              {profile.name}
              {!profile.isActive && " (inativo)"}
            </button>
            {!profile.isSystem && (
              <BlockedAction allowed={canEdit} reason="Você não tem permissão para alterar perfis.">
                {profile.isActive ? (
                  <button
                    type="button"
                    className="fb-row-btn"
                    disabled={deactivateMutation.isPending}
                    onClick={() => deactivateMutation.mutate(profile.id)}
                  >
                    Desativar
                  </button>
                ) : (
                  <button
                    type="button"
                    className="fb-row-btn"
                    disabled={activateMutation.isPending}
                    onClick={() => activateMutation.mutate(profile.id)}
                  >
                    Reativar
                  </button>
                )}
              </BlockedAction>
            )}
          </li>
        ))}

        <li style={{ marginTop: 10 }}>
          <BlockedAction allowed={canCreate} reason="Você não tem permissão para criar perfis.">
            <button
              type="button"
              className="fb-btn-dashed"
              onClick={() => setShowCreateForm((visible) => !visible)}
            >
              {showCreateForm ? "Cancelar" : "+ Novo perfil"}
            </button>
          </BlockedAction>
        </li>
      </ul>

      <div className="fb-matrix-content">
        {mutationError && <Feedback tone="error">{mutationError}</Feedback>}

        {showCreateForm && (
          <form
            onSubmit={handleCreateSubmit}
            aria-label="Novo perfil de acesso"
            className="fb-form"
          >
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
            <button type="submit" className="fb-btn-primary" disabled={createMutation.isPending}>
              Criar perfil
            </button>
          </form>
        )}

        {catalogQuery.isLoading && <LoadingState />}
        {catalogQuery.isError && (
          <ErrorState
            message="Não foi possível carregar o catálogo de perfis."
            onRetry={() => void catalogQuery.refetch()}
          />
        )}

        {selectedProfile && catalogQuery.data && (
          <ProfileMatrix
            profile={selectedProfile}
            catalog={catalogQuery.data}
            onChanged={invalidateProfiles}
          />
        )}
      </div>
    </div>
  );
}
