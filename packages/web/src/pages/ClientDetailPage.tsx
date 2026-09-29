import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { UserStatus } from "@fitburn/contracts";
import { errorMessage } from "../lib/auth/api";
import { getClient } from "../lib/clients/api";
import { ClientActions } from "./clients/ClientActions";
import {
  ClientDataTab,
  ClientGamificationTab,
  ClientPlanTab,
  ClientReservationsTab,
  ClientSheetsTab,
} from "./clients/ClientDetailTabs";

const TABS = [
  { id: "dados", label: "Dados pessoais" },
  { id: "plano", label: "Plano e histórico" },
  { id: "reservas", label: "Reservas" },
  { id: "gamificacao", label: "Gamificação" },
  { id: "fichas", label: "Fichas" },
] as const;

type TabId = (typeof TABS)[number]["id"];

/**
 * Detalhe do cliente em abas (visão consolidada): dados pessoais, plano e
 * histórico, reservas, gamificação e fichas. Cada aba só carrega seus dados
 * quando é aberta. As ações (editar, desativar, reativar) ficam no cabeçalho.
 * O artboard ClientesAdmin.dc.html só traz a lista; o detalhe segue a casca e
 * as abas das demais telas administrativas.
 */
export function ClientDetailPage() {
  const { id = "" } = useParams();
  const [tab, setTab] = useState<TabId>("dados");
  const clientQuery = useQuery({
    queryKey: ["clients", "detail", id],
    queryFn: () => getClient(id),
  });
  const client = clientQuery.data;

  if (clientQuery.isError) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <p role="alert" className="fb-error-box">
          {errorMessage(clientQuery.error, "Não foi possível carregar o cliente.")}
        </p>
        <Link to="/clientes" className="fb-clients__name">
          Voltar para Clientes
        </Link>
      </div>
    );
  }
  if (!client) return <p className="fb-note">Carregando…</p>;

  const inactive = client.status === UserStatus.INACTIVE;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18, height: "100%" }}>
      <div className="fb-toolbar">
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span className="fb-page-eyebrow">
            <Link to="/clientes" className="fb-clients__crumb">
              Clientes
            </Link>{" "}
            / {client.fullName}
          </span>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <h1 className="fb-page-title">{client.fullName}</h1>
            <span className={`fb-badge ${inactive ? "fb-badge--inactive" : "fb-badge--active"}`}>
              {inactive ? "INATIVO" : "ATIVO"}
            </span>
          </div>
        </div>
        <div className="fb-clients__header-actions">
          <ClientActions client={client} buttonClassName="fb-btn-secondary" />
        </div>
      </div>

      <div className="fb-tabs" role="tablist" aria-label="Seções do cliente">
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            id={`client-tab-${item.id}`}
            aria-selected={tab === item.id}
            aria-controls="client-tabpanel"
            className={`fb-tab-btn${tab === item.id ? " active" : ""}`}
            onClick={() => setTab(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div role="tabpanel" id="client-tabpanel" aria-labelledby={`client-tab-${tab}`}>
        {tab === "dados" && <ClientDataTab client={client} />}
        {tab === "plano" && <ClientPlanTab clientId={client.id} />}
        {tab === "reservas" && <ClientReservationsTab clientId={client.id} />}
        {tab === "gamificacao" && <ClientGamificationTab clientId={client.id} />}
        {tab === "fichas" && <ClientSheetsTab clientId={client.id} />}
      </div>
    </div>
  );
}
