import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Module,
  PermissionAction,
  PermissionScope,
  SystemProfileName,
  type UserDetail,
  type UserResponse,
} from "@fitburn/contracts";
import { BlockedAction } from "../components/BlockedAction";
import { DeleteUserDialog } from "../components/DeleteUserDialog";
import { QueryBlockState } from "../components/QueryBlockState";
import { ResetUserPasswordDialog } from "../components/ResetUserPasswordDialog";
import { Alert } from "../components/ui/Alert";
import { Badge, type BadgeTone } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { Field } from "../components/ui/Field";
import { Table, type TableColumn } from "../components/ui/Table";
import { EmptyState } from "../components/ui/States";
import { Toolbar } from "../components/ui/Toolbar";
import { useAuth } from "../lib/auth/AuthContext";
import { invalidateAfterDeletion } from "../lib/invalidate-after-deletion";
import { deactivateUser, deleteUser, listUsers, reactivateUser } from "../lib/users/api";
import { StaffFormModal } from "./StaffFormModal";

/** Selo do perfil de acesso: o Administrador em destaque de marca, os demais (inclusive os criados depois) neutros. */
function profileBadgeTone(profileName: string): BadgeTone {
  return profileName === SystemProfileName.ADMIN ? "brand" : "neutral";
}

function isStaffUser(user: UserResponse): user is UserDetail {
  return user.profile !== undefined && user.profile.name !== SystemProfileName.CLIENT;
}

export function UsersPage() {
  const { can, scopeOf, user: currentUser } = useAuth();
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState("");
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [userToEdit, setUserToEdit] = useState<UserDetail | null>(null);
  const [userToDelete, setUserToDelete] = useState<UserDetail | null>(null);
  const [userToResetPassword, setUserToResetPassword] = useState<UserDetail | null>(null);
  const [passwordResetFeedback, setPasswordResetFeedback] = useState<string | null>(null);

  const usersQuery = useQuery({
    queryKey: ["users", {}],
    queryFn: () => listUsers(),
  });

  const normalizedSearch = searchTerm.trim().toLowerCase();
  // Como no design, a lista é só da equipe; os clientes ficam em Clientes.
  const filteredUsers = usersQuery.data
    ?.filter(isStaffUser)
    .filter(
      (user) =>
        normalizedSearch === "" ||
        user.fullName.toLowerCase().includes(normalizedSearch) ||
        user.email.toLowerCase().includes(normalizedSearch),
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
  const canResetOtherUsers = canEdit && scopeOf(Module.USUARIOS) === PermissionScope.ALL;
  const canDelete = can(Module.USUARIOS, PermissionAction.DELETE);

  const columns: TableColumn<UserDetail>[] = [
    { key: "name", header: "Nome", className: "fb-ui-table__name", cell: (user) => user.fullName },
    { key: "email", header: "E-mail", className: "fb-ui-table__muted", cell: (user) => user.email },
    {
      key: "profile",
      header: "Perfil de acesso",
      cell: (user) => (
        <Badge tone={profileBadgeTone(user.profile.name)}>{user.profile.name.toUpperCase()}</Badge>
      ),
    },
    {
      key: "status",
      header: "Situação",
      cell: (user) =>
        user.status === "ACTIVE" ? (
          <Badge tone="ok" dot>
            ATIVO
          </Badge>
        ) : (
          <Badge dot>INATIVO</Badge>
        ),
    },
    {
      key: "actions",
      header: "Ações",
      actions: true,
      cell: (user) => {
        const inactive = user.status !== "ACTIVE";
        const others = user.id !== currentUser?.id;
        return (
          <div className="fb-ui-row-actions">
            <BlockedAction allowed={canEdit} reason="Você não tem permissão para alterar usuários.">
              <Button
                size="sm"
                aria-label={`Editar usuário ${user.fullName}`}
                onClick={() => setUserToEdit(user)}
              >
                Editar
              </Button>
            </BlockedAction>
            <BlockedAction allowed={canEdit} reason="Você não tem permissão para alterar usuários.">
              {inactive ? (
                <Button
                  size="sm"
                  aria-label={`Reativar usuário ${user.fullName}`}
                  onClick={() => reactivateMutation.mutate(user.id)}
                >
                  Reativar
                </Button>
              ) : (
                <Button
                  size="sm"
                  aria-label={`Desativar usuário ${user.fullName}`}
                  onClick={() => deactivateMutation.mutate(user.id)}
                >
                  Desativar
                </Button>
              )}
            </BlockedAction>
            {others && canResetOtherUsers && (
              <Button
                size="sm"
                aria-label={`Redefinir senha de ${user.fullName}`}
                onClick={() => {
                  setPasswordResetFeedback(null);
                  setUserToResetPassword(user);
                }}
              >
                Redefinir senha
              </Button>
            )}
            {others && (
              <BlockedAction
                allowed={canDelete}
                reason="Você não tem permissão para excluir usuários."
              >
                <Button
                  size="sm"
                  variant="ghost-danger"
                  aria-label={`Excluir usuário ${user.fullName}`}
                  onClick={() => setUserToDelete(user)}
                >
                  Excluir
                </Button>
              </BlockedAction>
            )}
          </div>
        );
      },
    },
  ];

  return (
    <div className="fb-ui-page">
      <Toolbar>
        <Field
          type="text"
          label="Buscar por nome ou e-mail"
          hideLabel
          placeholder="Buscar por nome ou e-mail"
          value={searchTerm}
          onChange={(event) => setSearchTerm(event.target.value)}
        />
        <div className="fb-ui-toolbar__end">
          <BlockedAction
            allowed={canCreate}
            reason="Você não tem permissão para cadastrar usuários."
          >
            <Button variant="primary" size="sm" onClick={() => setShowCreateForm(true)}>
              + Novo usuário
            </Button>
          </BlockedAction>
        </div>
      </Toolbar>

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

      {userToResetPassword && (
        <ResetUserPasswordDialog
          user={userToResetPassword}
          onReset={() => {
            setUserToResetPassword(null);
            setPasswordResetFeedback(`Senha de ${userToResetPassword.fullName} redefinida.`);
          }}
          onClose={() => setUserToResetPassword(null)}
        />
      )}

      {passwordResetFeedback && <Alert tone="ok">{passwordResetFeedback}</Alert>}

      <QueryBlockState
        query={usersQuery}
        hasData={usersQuery.data !== undefined}
        loading="Carregando usuários…"
        error="Não foi possível carregar os usuários."
      />

      {filteredUsers && filteredUsers.length === 0 && (
        <EmptyState title="Nenhum usuário encontrado." />
      )}

      {filteredUsers && filteredUsers.length > 0 && (
        <Table
          label="Usuários da equipe"
          columns={columns}
          rows={filteredUsers}
          rowKey={(user) => user.id}
        />
      )}
      <p className="fb-ui-note">Cada usuário possui exatamente um perfil de acesso.</p>
    </div>
  );
}
