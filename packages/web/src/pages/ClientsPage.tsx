import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import {
  Module,
  PermissionAction,
  PermissionScope,
  type ClientListItem,
  type ClientsQuery,
} from "@fitburn/contracts";
import { BlockedAction } from "../components/BlockedAction";
import { DeleteUserDialog } from "../components/DeleteUserDialog";
import { QueryBlockState } from "../components/QueryBlockState";
import { Alert } from "../components/ui/Alert";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { Field } from "../components/ui/Field";
import { PageHeader } from "../components/ui/PageHeader";
import { Select } from "../components/ui/Select";
import { Table, type TableColumn } from "../components/ui/Table";
import { Toolbar } from "../components/ui/Toolbar";
import { EmptyState } from "../components/ui/States";
import { useAuth } from "../lib/auth/AuthContext";
import { invalidateAfterDeletion } from "../lib/invalidate-after-deletion";
import { deleteClientRecord, listClients, setClientActive } from "../lib/clients/api";

const NO_PLAN = "__sem_plano__";

/** Clientes: busca, filtro de status, plano ativo e ações rápidas da equipe. */
export function ClientsPage() {
  const { can, scopeOf } = useAuth();
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
  const hasFullClientData = scopeOf(Module.CLIENTES) === PermissionScope.ALL;
  const searchLabel = hasFullClientData
    ? "Buscar por nome, e-mail ou documento"
    : "Buscar por nome ou e-mail";
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

  const columns: TableColumn<ClientListItem>[] = [
    {
      key: "name",
      header: "Nome",
      className: "fb-ui-table__name",
      cell: (client) => (
        <Link to={`/clientes/${client.id}`} className="fb-ui-link">
          {client.fullName}
        </Link>
      ),
    },
    {
      key: "email",
      header: "E-mail",
      className: "fb-ui-table__muted",
      cell: (client) => client.email,
    },
    {
      key: "phone",
      header: "Telefone",
      className: "fb-ui-table__muted",
      cell: (client) => client.phone ?? "—",
    },
    ...(hasFullClientData
      ? [
          {
            key: "plan",
            header: "Plano",
            cell: (client: ClientListItem) => client.activePlan?.name ?? "Sem plano ativo",
          },
        ]
      : []),
    {
      key: "status",
      header: "Situação",
      cell: (client) =>
        client.status === "ACTIVE" ? (
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
      cell: (client) => {
        const inactive = client.status !== "ACTIVE";
        return (
          <div className="fb-ui-row-actions">
            <Button
              size="sm"
              aria-label={`Editar cliente ${client.fullName}`}
              onClick={() => navigate(`/clientes/${client.id}`)}
            >
              Editar
            </Button>
            <BlockedAction allowed={canEdit} reason="Você não tem permissão para alterar clientes.">
              <Button
                size="sm"
                aria-label={`${inactive ? "Reativar" : "Desativar"} cliente ${client.fullName}`}
                onClick={() => toggleMutation.mutate({ id: client.id, active: inactive })}
              >
                {inactive ? "Reativar" : "Desativar"}
              </Button>
            </BlockedAction>
            <BlockedAction
              allowed={canDelete}
              reason="Você não tem permissão para excluir clientes."
            >
              <Button
                size="sm"
                variant="ghost-danger"
                aria-label={`Excluir cliente ${client.fullName}`}
                onClick={() => setClientToDelete(client)}
              >
                Excluir
              </Button>
            </BlockedAction>
          </div>
        );
      },
    },
  ];

  return (
    <div className="fb-ui-page">
      <PageHeader
        kicker="Clientes"
        title="Clientes"
        actions={
          <BlockedAction
            allowed={canCreate}
            reason="Você não tem permissão para cadastrar clientes."
          >
            <Button variant="primary" size="sm" onClick={() => navigate("/clientes/novo")}>
              + Novo cliente
            </Button>
          </BlockedAction>
        }
      />

      <Toolbar>
        <Field
          type="search"
          label={searchLabel}
          hideLabel
          placeholder={searchLabel}
          value={searchTerm}
          onChange={(event) => setSearchTerm(event.target.value)}
        />
        <Select
          label="Status"
          hideLabel
          value={status ?? ""}
          onChange={(event) =>
            setStatus((event.target.value || undefined) as ClientsQuery["status"])
          }
        >
          <option value="">Status: todos</option>
          <option value="ACTIVE">Ativo</option>
          <option value="INACTIVE">Inativo</option>
        </Select>
        {hasFullClientData && (
          <Select
            label="Plano"
            hideLabel
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
          </Select>
        )}
        {clients && (
          <span className="fb-ui-toolbar__count" role="status">
            {clients.length} {clients.length === 1 ? "cliente" : "clientes"}
          </span>
        )}
      </Toolbar>

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

      <QueryBlockState
        query={clientsQuery}
        hasData={clientsQuery.data !== undefined}
        loading="Carregando clientes…"
        error="Não foi possível carregar os clientes."
      />
      {toggleMutation.isError && <Alert>Não foi possível alterar o cliente.</Alert>}

      {clients && clients.length === 0 && <EmptyState title="Nenhum cliente encontrado." />}
      {clients && clients.length > 0 && (
        <Table label="Clientes" columns={columns} rows={clients} rowKey={(client) => client.id} />
      )}
    </div>
  );
}
