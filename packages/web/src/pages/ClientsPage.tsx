import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import {
  Module,
  PermissionAction,
  type ClientListItem,
  type ClientsQuery,
} from "@fitburn/contracts";
import { BlockedAction } from "../components/BlockedAction";
import { DeleteUserDialog } from "../components/DeleteUserDialog";
import { useAuth } from "../lib/auth/AuthContext";
import { invalidateAfterDeletion } from "../lib/invalidate-after-deletion";
import { deleteClientRecord, listClients, setClientActive } from "../lib/clients/api";
import { formatLocalDate } from "../lib/agenda/format";
import { EmptyState, ErrorState, Feedback, LoadingState } from "../components/states";

/** Clientes: busca, filtro de status, plano ativo e ações rápidas da equipe. */
export function ClientsPage() {
  const { can } = useAuth();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState("");
  const [status, setStatus] = useState<ClientsQuery["status"]>(undefined);
  const [clientToDelete, setClientToDelete] = useState<ClientListItem | null>(null);

  const search = searchTerm.trim();
  const clientsQuery = useQuery({
    queryKey: ["clients", { search, status }],
    queryFn: () => listClients({ search: search || undefined, status }),
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) => setClientActive(id, active),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["clients"] }),
  });

  const canCreate = can(Module.CLIENTES, PermissionAction.CREATE);
  const canEdit = can(Module.CLIENTES, PermissionAction.EDIT);
  const canDelete = can(Module.CLIENTES, PermissionAction.DELETE);
  const clients = clientsQuery.data;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18, height: "100%" }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <span className="fb-page-eyebrow">Clientes</span>
        <h1 className="fb-page-title">Clientes</h1>
      </div>

      <div className="fb-toolbar">
        <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
          <input
            type="search"
            className="fb-field"
            style={{ width: 300 }}
            placeholder="Buscar por nome, e-mail ou documento"
            aria-label="Buscar por nome, e-mail ou documento"
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
          />
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}>
            Status
            <select
              className="fb-field"
              value={status ?? ""}
              onChange={(event) =>
                setStatus((event.target.value || undefined) as ClientsQuery["status"])
              }
            >
              <option value="">Todos</option>
              <option value="ACTIVE">Ativo</option>
              <option value="INACTIVE">Inativo</option>
            </select>
          </label>
        </div>
        <BlockedAction allowed={canCreate} reason="Você não tem permissão para cadastrar clientes.">
          <button
            type="button"
            className="fb-btn-primary"
            onClick={() => navigate("/clientes/novo")}
          >
            + Novo cliente
          </button>
        </BlockedAction>
      </div>

      {clientToDelete && (
        <DeleteUserDialog
          kind="cliente"
          name={clientToDelete.fullName}
          onConfirm={() => deleteClientRecord(clientToDelete.id)}
          onDeleted={() => {
            setClientToDelete(null);
            void invalidateAfterDeletion(queryClient);
          }}
          onClose={() => setClientToDelete(null)}
        />
      )}

      {clientsQuery.isLoading && <LoadingState />}
      {clientsQuery.isError && (
        <ErrorState
          message="Não foi possível carregar os clientes."
          onRetry={() => void clientsQuery.refetch()}
        />
      )}
      {toggleMutation.isError && (
        <Feedback tone="error">Não foi possível alterar o cliente.</Feedback>
      )}
      {clients && clients.length === 0 && <EmptyState message="Nenhum cliente encontrado." />}

      {clients && clients.length > 0 && (
        <div className="fb-table-wrap">
          <table>
            <thead>
              <tr>
                <th className="fb-th">Nome</th>
                <th className="fb-th">Contato</th>
                <th className="fb-th">Plano ativo</th>
                <th className="fb-th">Status</th>
                <th className="fb-th" style={{ textAlign: "right" }}>
                  Ações
                </th>
              </tr>
            </thead>
            <tbody>
              {clients.map((client) => (
                <tr key={client.id}>
                  <td className="fb-td" style={{ fontWeight: 500 }}>
                    <Link to={`/clientes/${client.id}`}>{client.fullName}</Link>
                  </td>
                  <td className="fb-td" style={{ color: "#5a5a5a" }}>
                    {client.email}
                    {client.phone && <div>{client.phone}</div>}
                  </td>
                  <td className="fb-td">
                    {client.activePlan
                      ? `${client.activePlan.name} · até ${formatLocalDate(client.activePlan.endDate)}`
                      : "Sem plano"}
                  </td>
                  <td className="fb-td">
                    <span
                      className={`fb-badge ${client.status === "ACTIVE" ? "fb-badge--active" : "fb-badge--inactive"}`}
                    >
                      {client.status === "ACTIVE" ? "ATIVO" : "INATIVO"}
                    </span>
                  </td>
                  <td className="fb-td" style={{ textAlign: "right" }}>
                    <BlockedAction
                      allowed={canEdit}
                      reason="Você não tem permissão para alterar clientes."
                    >
                      <button
                        type="button"
                        className="fb-row-btn"
                        aria-label={`${client.status === "ACTIVE" ? "Desativar" : "Reativar"} ${client.fullName}`}
                        onClick={() =>
                          toggleMutation.mutate({
                            id: client.id,
                            active: client.status !== "ACTIVE",
                          })
                        }
                      >
                        {client.status === "ACTIVE" ? "Desativar" : "Reativar"}
                      </button>
                    </BlockedAction>
                    <BlockedAction
                      allowed={canDelete}
                      reason="Você não tem permissão para excluir clientes."
                    >
                      <button
                        type="button"
                        className="fb-row-btn fb-row-btn--danger"
                        aria-label={`Excluir ${client.fullName}`}
                        onClick={() => setClientToDelete(client)}
                      >
                        Excluir
                      </button>
                    </BlockedAction>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
