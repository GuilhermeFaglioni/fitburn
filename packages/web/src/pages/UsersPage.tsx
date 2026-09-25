import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Module, PermissionAction } from "@fitburn/contracts";
import { BlockedAction } from "../components/BlockedAction";
import { useAuth } from "../lib/auth/AuthContext";
import { deactivateUser, listUsers, reactivateUser } from "../lib/users/api";
import { ClientCreateForm } from "./ClientCreateForm";

export function UsersPage() {
  const { can } = useAuth();
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState("");
  const [showCreateForm, setShowCreateForm] = useState(false);

  const usersQuery = useQuery({
    queryKey: ["users", { status: statusFilter }],
    queryFn: () => listUsers({ status: statusFilter || undefined }),
  });

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

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h1>Usuários</h1>
        <BlockedAction allowed={canCreate} reason="Você não tem permissão para cadastrar usuários.">
          <button type="button" onClick={() => setShowCreateForm((visible) => !visible)}>
            {showCreateForm ? "Cancelar" : "Novo cliente"}
          </button>
        </BlockedAction>
      </div>

      {showCreateForm && (
        <ClientCreateForm
          onCreated={() => {
            setShowCreateForm(false);
            void invalidateUsers();
          }}
        />
      )}

      <label>
        Status
        <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
          <option value="">Todos</option>
          <option value="ACTIVE">Ativo</option>
          <option value="INACTIVE">Inativo</option>
        </select>
      </label>

      {usersQuery.isLoading && <p>Carregando…</p>}
      {usersQuery.isError && <p role="alert">Não foi possível carregar os usuários.</p>}

      {usersQuery.data && usersQuery.data.length === 0 && <p>Nenhum usuário encontrado.</p>}

      {usersQuery.data && usersQuery.data.length > 0 && (
        <table>
          <thead>
            <tr>
              <th>Nome</th>
              <th>E-mail</th>
              <th>Perfil</th>
              <th>Status</th>
              <th>Ações</th>
            </tr>
          </thead>
          <tbody>
            {usersQuery.data.map((user) => (
              <tr key={user.id}>
                <td>{user.fullName}</td>
                <td>{user.email}</td>
                <td>{user.profile.name}</td>
                <td>{user.status === "ACTIVE" ? "Ativo" : "Inativo"}</td>
                <td>
                  <BlockedAction
                    allowed={canEdit}
                    reason="Você não tem permissão para alterar usuários."
                  >
                    {user.status === "ACTIVE" ? (
                      <button type="button" onClick={() => deactivateMutation.mutate(user.id)}>
                        Desativar
                      </button>
                    ) : (
                      <button type="button" onClick={() => reactivateMutation.mutate(user.id)}>
                        Reativar
                      </button>
                    )}
                  </BlockedAction>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
