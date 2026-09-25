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
  const [searchTerm, setSearchTerm] = useState("");
  const [showCreateForm, setShowCreateForm] = useState(false);

  const usersQuery = useQuery({
    queryKey: ["users", { status: statusFilter }],
    queryFn: () => listUsers({ status: statusFilter || undefined }),
  });

  const normalizedSearch = searchTerm.trim().toLowerCase();
  const filteredUsers = usersQuery.data?.filter(
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

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14, flexGrow: 1, minHeight: 0 }}>
      <div className="fb-toolbar">
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <input
            type="text"
            className="fb-field"
            style={{ width: 280 }}
            placeholder="Buscar por nome ou e-mail"
            aria-label="Buscar por nome ou e-mail"
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
          />
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: "#4a4a4a" }}>
            Status
            <select
              className="fb-field"
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
            >
              <option value="">Todos</option>
              <option value="ACTIVE">Ativo</option>
              <option value="INACTIVE">Inativo</option>
            </select>
          </label>
        </div>
        <BlockedAction allowed={canCreate} reason="Você não tem permissão para cadastrar usuários.">
          <button type="button" className="fb-btn-primary" onClick={() => setShowCreateForm((visible) => !visible)}>
            {showCreateForm ? "Cancelar" : "+ Novo cliente"}
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

      {usersQuery.isLoading && <p className="fb-note">Carregando…</p>}
      {usersQuery.isError && <p role="alert">Não foi possível carregar os usuários.</p>}

      {filteredUsers && filteredUsers.length === 0 && (
        <p className="fb-note">Nenhum usuário encontrado.</p>
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
              {filteredUsers.map((user) => (
                <tr key={user.id}>
                  <td className="fb-td" style={{ fontWeight: 500 }}>
                    {user.fullName}
                  </td>
                  <td className="fb-td" style={{ color: "#5a5a5a" }}>
                    {user.email}
                  </td>
                  <td className="fb-td">
                    <span
                      className={`fb-badge ${user.profile.name === "Administrador" ? "fb-badge--accent" : "fb-badge--neutral"}`}
                    >
                      {user.profile.name.toUpperCase()}
                    </span>
                  </td>
                  <td className="fb-td">
                    <span className={`fb-badge ${user.status === "ACTIVE" ? "fb-badge--active" : "fb-badge--inactive"}`}>
                      {user.status === "ACTIVE" ? "ATIVO" : "INATIVO"}
                    </span>
                  </td>
                  <td className="fb-td" style={{ textAlign: "right" }}>
                    <BlockedAction
                      allowed={canEdit}
                      reason="Você não tem permissão para alterar usuários."
                    >
                      {user.status === "ACTIVE" ? (
                        <button
                          type="button"
                          className="fb-row-btn"
                          onClick={() => deactivateMutation.mutate(user.id)}
                        >
                          Desativar
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="fb-row-btn"
                          onClick={() => reactivateMutation.mutate(user.id)}
                        >
                          Reativar
                        </button>
                      )}
                    </BlockedAction>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <span className="fb-note">Cada usuário possui exatamente um perfil de acesso.</span>
    </div>
  );
}
