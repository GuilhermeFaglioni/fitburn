import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Module, PermissionAction, SystemProfileName, type UserDetail } from "@fitburn/contracts";
import { BlockedAction } from "../components/BlockedAction";
import { DeleteUserDialog } from "../components/DeleteUserDialog";
import { useAuth } from "../lib/auth/AuthContext";
import { invalidateAfterDeletion } from "../lib/invalidate-after-deletion";
import { deactivateUser, deleteUser, listUsers, reactivateUser } from "../lib/users/api";
import { StaffFormModal } from "./StaffFormModal";
import { LoadingState, ErrorState, EmptyState } from "../components/states";

/** Selo do perfil de acesso, com as cores do design (perfis criados depois usam o cinza neutro). */
function profileBadgeClass(profileName: string): string {
  switch (profileName) {
    case SystemProfileName.ADMIN:
      return "fb-badge--accent";
    case "Professor":
      return "fb-badge--blue";
    case "Recepção":
      return "fb-badge--brown";
    default:
      return "fb-badge--neutral";
  }
}

export function UsersPage() {
  const { can, user: currentUser } = useAuth();
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState("");
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [userToEdit, setUserToEdit] = useState<UserDetail | null>(null);
  const [userToDelete, setUserToDelete] = useState<UserDetail | null>(null);

  const usersQuery = useQuery({
    queryKey: ["users", {}],
    queryFn: () => listUsers(),
  });

  const normalizedSearch = searchTerm.trim().toLowerCase();
  // Como no design, a lista é só da equipe; os clientes ficam em Clientes.
  const filteredUsers = usersQuery.data?.filter(
    (user) =>
      user.profile.name !== SystemProfileName.CLIENT &&
      (normalizedSearch === "" ||
        user.fullName.toLowerCase().includes(normalizedSearch) ||
        user.email.toLowerCase().includes(normalizedSearch)),
  );

  function invalidateUsers() {
    return queryClient.invalidateQueries({ queryKey: ["users"] });
  }

  const deactivateMutation = useMutation({
    mutationFn: deactivateUser,
    onSuccess: invalidateUsers,
  });
  const reactivateMutation = useMutation({
    mutationFn: reactivateUser,
    onSuccess: invalidateUsers,
  });

  const canCreate = can(Module.USUARIOS, PermissionAction.CREATE);
  const canEdit = can(Module.USUARIOS, PermissionAction.EDIT);
  const canDelete = can(Module.USUARIOS, PermissionAction.DELETE);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14, flexGrow: 1, minHeight: 0 }}>
      <div className="fb-toolbar">
        <input
          type="text"
          className="fb-field"
          style={{ width: 280 }}
          placeholder="Buscar por nome ou e-mail"
          aria-label="Buscar por nome ou e-mail"
          value={searchTerm}
          onChange={(event) => setSearchTerm(event.target.value)}
        />
        <BlockedAction allowed={canCreate} reason="Você não tem permissão para cadastrar usuários.">
          <button type="button" className="fb-btn-primary" onClick={() => setShowCreateForm(true)}>
            + Novo usuário
          </button>
        </BlockedAction>
      </div>

      {showCreateForm && (
        <StaffFormModal
          onClose={() => setShowCreateForm(false)}
          onSaved={() => {
            setShowCreateForm(false);
            void invalidateUsers();
          }}
        />
      )}

      {userToEdit && (
        <StaffFormModal
          user={userToEdit}
          onClose={() => setUserToEdit(null)}
          onSaved={() => {
            setUserToEdit(null);
            void invalidateUsers();
          }}
        />
      )}

      {userToDelete && (
        <DeleteUserDialog
          kind="usuário"
          name={userToDelete.fullName}
          onConfirm={() => deleteUser(userToDelete.id)}
          onDeleted={() => {
            setUserToDelete(null);
            void invalidateAfterDeletion(queryClient);
          }}
          onClose={() => setUserToDelete(null)}
        />
      )}

      {usersQuery.isLoading && <LoadingState />}
      {usersQuery.isError && (
        <ErrorState
          message="Não foi possível carregar os usuários."
          onRetry={() => void usersQuery.refetch()}
        />
      )}

      {filteredUsers && filteredUsers.length === 0 && (
        <EmptyState message="Nenhum usuário encontrado." />
      )}

      {filteredUsers && filteredUsers.length > 0 && (
        <div className="fb-table-wrap">
          <table>
            <thead>
              <tr>
                <th className="fb-th">Nome</th>
                <th className="fb-th">E-mail</th>
                <th className="fb-th">Perfil de acesso</th>
                <th className="fb-th">Status</th>
                <th className="fb-th" style={{ textAlign: "right" }}>
                  Ações
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredUsers.map((user) => {
                const inactive = user.status !== "ACTIVE";
                return (
                  <tr key={user.id} className={inactive ? "fb-row--inactive" : undefined}>
                    <td className="fb-td fb-td--name">{user.fullName}</td>
                    <td className="fb-td fb-td--soft">{user.email}</td>
                    <td className="fb-td">
                      <span className={`fb-badge ${profileBadgeClass(user.profile.name)}`}>
                        {user.profile.name.toUpperCase()}
                      </span>
                    </td>
                    <td className="fb-td">
                      <span
                        className={`fb-badge ${inactive ? "fb-badge--inactive" : "fb-badge--active"}`}
                      >
                        {inactive ? "INATIVO" : "ATIVO"}
                      </span>
                    </td>
                    <td className="fb-td" style={{ textAlign: "right" }}>
                      <BlockedAction
                        allowed={canEdit}
                        reason="Você não tem permissão para alterar usuários."
                      >
                        <button
                          type="button"
                          className="fb-row-btn"
                          aria-label={`Editar ${user.fullName}`}
                          onClick={() => setUserToEdit(user)}
                        >
                          Editar
                        </button>
                      </BlockedAction>{" "}
                      <BlockedAction
                        allowed={canEdit}
                        reason="Você não tem permissão para alterar usuários."
                      >
                        {inactive ? (
                          <button
                            type="button"
                            className="fb-row-btn"
                            onClick={() => reactivateMutation.mutate(user.id)}
                          >
                            Reativar
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="fb-row-btn"
                            onClick={() => deactivateMutation.mutate(user.id)}
                          >
                            Desativar
                          </button>
                        )}
                      </BlockedAction>
                      {user.id !== currentUser?.id && (
                        <>
                          {" "}
                          <BlockedAction
                            allowed={canDelete}
                            reason="Você não tem permissão para excluir usuários."
                          >
                            <button
                              type="button"
                              className="fb-row-btn fb-row-btn--danger"
                              onClick={() => setUserToDelete(user)}
                            >
                              Excluir
                            </button>
                          </BlockedAction>
                        </>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <span className="fb-note">Cada usuário possui exatamente um perfil de acesso.</span>
    </div>
  );
}
