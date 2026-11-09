import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Module, PermissionAction, SystemProfileName } from "@fitburn/contracts";
import { BlockedAction } from "../components/BlockedAction";
import { QueryBlockState } from "../components/QueryBlockState";
import { Alert } from "../components/ui/Alert";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { Field } from "../components/ui/Field";
import { EmptyState } from "../components/ui/States";
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

  function handleCreateSubmit(event: FormEvent) {
    event.preventDefault();
    createMutation.mutate();
  }

  return (
    <div className="fb-ui-split">
      <ul className="fb-ui-split__list" aria-label="Perfis de acesso">
        {profilesQuery.data?.length === 0 && (
          <li>
            <EmptyState title="Nenhum perfil cadastrado." />
          </li>
        )}
        {profilesQuery.data?.map((profile) => (
          <li key={profile.id}>
            <button
              type="button"
              className="fb-ui-profile-item"
              aria-pressed={selectedProfile?.id === profile.id}
              onClick={() => setSelectedId(profile.id)}
            >
              {profile.name}
              {!profile.isActive && " (inativo)"}
            </button>
            {!profile.isSystem && (
              <BlockedAction allowed={canEdit} reason="Você não tem permissão para alterar perfis.">
                {profile.isActive ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    aria-label={`Desativar perfil ${profile.name}`}
                    disabled={deactivateMutation.isPending}
                    onClick={() => deactivateMutation.mutate(profile.id)}
                  >
                    Desativar
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    variant="ghost"
                    aria-label={`Reativar perfil ${profile.name}`}
                    disabled={activateMutation.isPending}
                    onClick={() => activateMutation.mutate(profile.id)}
                  >
                    Reativar
                  </Button>
                )}
              </BlockedAction>
            )}
          </li>
        ))}

        <li>
          <BlockedAction allowed={canCreate} reason="Você não tem permissão para criar perfis.">
            <Button block onClick={() => setShowCreateForm((visible) => !visible)}>
              {showCreateForm ? "Cancelar" : "+ Novo perfil"}
            </Button>
          </BlockedAction>
        </li>
      </ul>

      <div className="fb-ui-split__main">
        <QueryBlockState
          query={profilesQuery}
          hasData={profilesQuery.data !== undefined}
          loading="Carregando perfis…"
          error="Não foi possível carregar os perfis."
        />
        {mutationError && <Alert>{mutationError}</Alert>}

        {showCreateForm && (
          <Card
            as="form"
            className="fb-ui-card--form fb-ui-stack"
            onSubmit={handleCreateSubmit}
            aria-label="Novo perfil de acesso"
          >
            <Field
              label="Nome"
              value={newName}
              onChange={(event) => setNewName(event.target.value)}
              required
            />
            <Field
              label="Descrição"
              value={newDescription}
              onChange={(event) => setNewDescription(event.target.value)}
            />
            <div className="fb-ui-form-actions">
              <Button type="submit" variant="primary" size="sm" busy={createMutation.isPending}>
                Criar perfil
              </Button>
            </div>
          </Card>
        )}

        <QueryBlockState
          query={catalogQuery}
          hasData={catalogQuery.data !== undefined}
          loading="Carregando catálogo de perfis…"
          error="Não foi possível carregar o catálogo de perfis."
        />

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
