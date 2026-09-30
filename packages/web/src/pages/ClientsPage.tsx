import { useMemo, useState } from "react";
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
import { EmptyState, ErrorState, Feedback, LoadingState } from "../components/states";

const NO_PLAN = "__sem_plano__";

/** Clientes: busca, filtro de status, plano ativo e ações rápidas da equipe. */
export function ClientsPage() {
  const { can } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState("");
  const [status, setStatus] = useState<ClientsQuery["status"]>(undefined);
  // Filtro por plano ativo: a API filtra só por busca e status; o plano é filtrado na tela.
  const [planFilter, setPlanFilter] = useState("");
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
  const loaded = clientsQuery.data;
  const planOptions = useMemo(() => {
    const names = new Set<string>();
    for (const client of loaded ?? []) if (client.activePlan) names.add(client.activePlan.name);
    if (planFilter && planFilter !== NO_PLAN) names.add(planFilter);
    return [...names].sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [loaded, planFilter]);
  const clients = useMemo(
    () =>
      loaded?.filter((client) => {
        if (!planFilter) return true;
        if (planFilter === NO_PLAN) return !client.activePlan;
        return client.activePlan?.name === planFilter;
      }),
    [loaded, planFilter],
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18, height: "100%" }}>
      <div className="fb-page-header">
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span className="fb-page-eyebrow">Clientes</span>
          <h1 className="fb-page-title">Clientes</h1>
        </div>
        <BlockedAction allowed={canCreate} reason="Você não tem permissão para cadastrar clientes.">
          <button
            type="button"
            className="fb-btn-primary fb-btn-primary--sans"
            onClick={() => navigate("/clientes/novo")}
          >
            + Novo cliente
          </button>
        </BlockedAction>
      </div>

      <div className="fb-toolbar fb-toolbar--filters">
        <input
          type="search"
          className="fb-field"
          style={{ width: 280 }}
          placeholder="Buscar por nome, e-mail ou documento"
          aria-label="Buscar por nome, e-mail ou documento"
          value={searchTerm}
          onChange={(event) => setSearchTerm(event.target.value)}
        />
        <select
          className="fb-field"
          aria-label="Status"
          value={status ?? ""}
          onChange={(event) =>
            setStatus((event.target.value || undefined) as ClientsQuery["status"])
          }
        >
          <option value="">Status: todos</option>
          <option value="ACTIVE">Ativo</option>
          <option value="INACTIVE">Inativo</option>
        </select>
        <select
          className="fb-field"
          aria-label="Plano"
          value={planFilter}
          onChange={(event) => setPlanFilter(event.target.value)}
        >
          <option value="">Plano: todos</option>
          {planOptions.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
          <option value={NO_PLAN}>Sem plano ativo</option>
        </select>
        {clients && (
          <span className="fb-count">
            {clients.length} {clients.length === 1 ? "cliente" : "clientes"}
          </span>
        )}
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
                <th className="fb-th">E-mail</th>
                <th className="fb-th">Telefone</th>
                <th className="fb-th">Plano</th>
                <th className="fb-th">Status</th>
                <th className="fb-th" style={{ textAlign: "right" }}>
                  Ações
                </th>
              </tr>
            </thead>
            <tbody>
              {clients.map((client) => {
                const inactive = client.status !== "ACTIVE";
                return (
                  <tr key={client.id} className={inactive ? "fb-row--inactive" : undefined}>
                    <td className="fb-td fb-td--name">
                      <Link to={`/clientes/${client.id}`} className="fb-name-link">
                        {client.fullName}
                      </Link>
                    </td>
                    <td className="fb-td fb-td--soft">{client.email}</td>
                    <td className="fb-td fb-td--soft">{client.phone ?? "—"}</td>
                    <td className="fb-td">
                      {client.activePlan ? client.activePlan.name : "Sem plano ativo"}
                    </td>
                    <td className="fb-td">
                      <span
                        className={`fb-badge fb-badge--spaced ${inactive ? "fb-badge--inactive" : "fb-badge--active"}`}
                      >
                        {inactive ? "INATIVO" : "ATIVO"}
                      </span>
                    </td>
                    <td className="fb-td" style={{ textAlign: "right" }}>
                      <button
                        type="button"
                        className="fb-row-btn"
                        aria-label={`Editar ${client.fullName}`}
                        onClick={() => navigate(`/clientes/${client.id}`)}
                      >
                        Editar
                      </button>{" "}
                      <BlockedAction
                        allowed={canEdit}
                        reason="Você não tem permissão para alterar clientes."
                      >
                        <button
                          type="button"
                          className="fb-row-btn"
                          aria-label={`${inactive ? "Reativar" : "Desativar"} ${client.fullName}`}
                          onClick={() =>
                            toggleMutation.mutate({
                              id: client.id,
                              active: inactive,
                            })
                          }
                        >
                          {inactive ? "Reativar" : "Desativar"}
                        </button>
                      </BlockedAction>{" "}
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
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
