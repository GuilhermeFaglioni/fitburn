import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Module, PermissionAction, UserStatus, type ClientsQuery } from "@fitburn/contracts";
import { BlockedAction } from "../components/BlockedAction";
import { useAuth } from "../lib/auth/AuthContext";
import { listClients } from "../lib/clients/api";
import { ClientActions } from "./clients/ClientActions";
import { ClientFormModal } from "./clients/ClientFormModal";

/** Espera o texto parar de mudar antes de consultar a API. */
function useDebounced<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}

/**
 * Clientes (ClientesAdmin.dc.html): a lista com busca por nome, e-mail ou
 * documento, filtro de status e o plano ativo de cada um; a equipe cadastra,
 * edita, desativa e reativa. O escopo do professor é aplicado pela API.
 * O detalhe em abas está em `/clientes/:id`.
 */
export function ClientsPage() {
  const { can } = useAuth();
  const [searchTerm, setSearchTerm] = useState("");
  const [status, setStatus] = useState<ClientsQuery["status"]>(undefined);
  const [creating, setCreating] = useState(false);
  const search = useDebounced(searchTerm.trim(), 300);

  const clientsQuery = useQuery({
    queryKey: ["clients", "list", { search, status }],
    queryFn: () => listClients({ search: search || undefined, status }),
    // Mantém a lista anterior na tela enquanto a nova busca carrega (sem piscar).
    placeholderData: (previous) => previous,
  });

  const clients = clientsQuery.data;
  const canCreate = can(Module.CLIENTES, PermissionAction.CREATE);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18, height: "100%" }}>
      <div className="fb-toolbar">
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span className="fb-page-eyebrow">Clientes</span>
          <h1 className="fb-page-title">Clientes</h1>
        </div>
        <BlockedAction allowed={canCreate} reason="Você não tem permissão para cadastrar clientes.">
          <button type="button" className="fb-btn-primary" onClick={() => setCreating(true)}>
            + Novo cliente
          </button>
        </BlockedAction>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <input
          type="text"
          className="fb-field"
          style={{ width: 300 }}
          placeholder="Buscar por nome, e-mail ou documento"
          aria-label="Buscar por nome, e-mail ou documento"
          value={searchTerm}
          onChange={(event) => setSearchTerm(event.target.value)}
        />
        <label
          style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: "#4a4a4a" }}
        >
          Status
          <select
            className="fb-field"
            value={status ?? ""}
            onChange={(event) =>
              setStatus((event.target.value || undefined) as ClientsQuery["status"])
            }
          >
            <option value="">Todos</option>
            <option value={UserStatus.ACTIVE}>Ativo</option>
            <option value={UserStatus.INACTIVE}>Inativo</option>
          </select>
        </label>
        {clients && (
          <span className="fb-note" style={{ marginLeft: "auto" }}>
            {clients.length === 1 ? "1 cliente" : `${clients.length} clientes`}
          </span>
        )}
      </div>

      {clientsQuery.isLoading && <p className="fb-note">Carregando…</p>}
      {clientsQuery.isError && <p role="alert">Não foi possível carregar os clientes.</p>}
      {clients && clients.length === 0 && <p className="fb-note">Nenhum cliente encontrado.</p>}

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
                const inactive = client.status === UserStatus.INACTIVE;
                return (
                  <tr
                    key={client.id}
                    className={inactive ? "fb-clients__row--inactive" : undefined}
                  >
                    <td className="fb-td" style={{ fontWeight: 500 }}>
                      <Link to={`/clientes/${client.id}`} className="fb-clients__name">
                        {client.fullName}
                      </Link>
                    </td>
                    <td className="fb-td fb-clients__muted">{client.email}</td>
                    <td className="fb-td fb-clients__muted">{client.phone ?? "—"}</td>
                    <td className="fb-td">{client.activePlan?.name ?? "Sem plano ativo"}</td>
                    <td className="fb-td">
                      <span
                        className={`fb-badge ${inactive ? "fb-badge--inactive" : "fb-badge--active"}`}
                      >
                        {inactive ? "INATIVO" : "ATIVO"}
                      </span>
                    </td>
                    <td className="fb-td" style={{ textAlign: "right" }}>
                      <ClientActions client={client} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {creating && <ClientFormModal onClose={() => setCreating(false)} />}
    </div>
  );
}
