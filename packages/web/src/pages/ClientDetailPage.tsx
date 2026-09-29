import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  Module,
  PermissionAction,
  type ClientOverview,
  type ReservationDetail,
  type UserDetail,
} from "@fitburn/contracts";
import { BlockedAction } from "../components/BlockedAction";
import { DeleteUserDialog } from "../components/DeleteUserDialog";
import { formatClassDay, formatInstantDate, formatLocalDate } from "../lib/agenda/format";
import { ApiError } from "../lib/auth/api";
import { useAuth } from "../lib/auth/AuthContext";
import { deleteClientRecord, getClientOverview, setClientActive } from "../lib/clients/api";
import { formatHistoryWhen } from "../lib/gamification/format";
import { PlanHistoryList } from "./plans/PlanHistoryList";
import { statusBadge } from "./workout-sheets/status";
import { ClientEditForm } from "./clients/ClientEditForm";

type Tab = "dados" | "plano" | "reservas" | "gamificacao" | "fichas";

const TABS: Array<{ id: Tab; label: string }> = [
  { id: "dados", label: "Dados pessoais" },
  { id: "plano", label: "Plano e histórico" },
  { id: "reservas", label: "Reservas" },
  { id: "gamificacao", label: "Gamificação" },
  { id: "fichas", label: "Fichas" },
];

const STATUS_BADGE: Record<UserDetail["status"], { label: string; className: string }> = {
  ACTIVE: { label: "ATIVO", className: "fb-badge--active" },
  INACTIVE: { label: "INATIVO", className: "fb-badge--inactive" },
  DELETED: { label: "EXCLUÍDO", className: "fb-badge--neutral" },
};

const RESERVATION_LABEL: Record<ReservationDetail["status"], string> = {
  CONFIRMED: "CONFIRMADA",
  CANCELLED: "CANCELADA",
  COMPLETED: "CONCLUÍDA",
  NO_SHOW: "NÃO COMPARECEU",
};

function valueOrDash(value: string | null): string {
  return value || "—";
}

function ReservationRows({ items, empty }: { items: ReservationDetail[]; empty: string }) {
  if (items.length === 0) return <p className="fb-note">{empty}</p>;
  return (
    <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 8 }}>
      {items.map((reservation) => (
        <li key={reservation.id} style={{ display: "flex", justifyContent: "space-between" }}>
          <span>
            <strong>{reservation.occurrence.name}</strong> ·{" "}
            {formatClassDay(reservation.occurrence.startsAt)}
          </span>
          <span className="fb-badge fb-badge--neutral">
            {RESERVATION_LABEL[reservation.status]}
          </span>
        </li>
      ))}
    </ul>
  );
}

function TabContent({
  tab,
  overview,
  canEdit,
}: {
  tab: Tab;
  overview: ClientOverview;
  canEdit: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const { client, plan, gamification } = overview;

  switch (tab) {
    case "dados":
      if (editing) return <ClientEditForm client={client} onDone={() => setEditing(false)} />;
      return (
        <div style={{ display: "grid", gap: 10 }}>
          <dl style={{ display: "grid", gridTemplateColumns: "180px 1fr", gap: 8, margin: 0 }}>
            <dt>E-mail</dt>
            <dd>{client.email}</dd>
            <dt>Telefone</dt>
            <dd>{valueOrDash(client.phone)}</dd>
            <dt>Data de nascimento</dt>
            <dd>{client.birthDate ? formatLocalDate(client.birthDate) : "—"}</dd>
            <dt>Documento</dt>
            <dd>{valueOrDash(client.document)}</dd>
            <dt>Endereço</dt>
            <dd>{valueOrDash(client.address)}</dd>
          </dl>
          {client.status !== "DELETED" && (
            <div>
              <BlockedAction
                allowed={canEdit}
                reason="Você não tem permissão para editar clientes."
              >
                <button type="button" className="fb-row-btn" onClick={() => setEditing(true)}>
                  Editar dados
                </button>
              </BlockedAction>
            </div>
          )}
        </div>
      );
    case "plano":
      return (
        <div style={{ display: "grid", gap: 14 }}>
          {plan.active ? (
            <PlanHistoryList items={[plan.active]} light />
          ) : (
            <p className="fb-note">Sem plano ativo.</p>
          )}
          {plan.history.length > 0 && (
            <>
              <h3>Histórico</h3>
              <PlanHistoryList items={plan.history} light />
            </>
          )}
        </div>
      );
    case "reservas":
      return (
        <div style={{ display: "grid", gap: 14 }}>
          <h3>Próximas reservas</h3>
          <ReservationRows items={overview.upcomingReservations} empty="Nenhuma reserva próxima." />
          <h3>Histórico de reservas</h3>
          <ReservationRows items={overview.pastReservations} empty="Nenhuma reserva anterior." />
        </div>
      );
    case "gamificacao":
      return (
        <div style={{ display: "grid", gap: 10 }}>
          <p>
            <strong>{gamification.totalPoints} pontos</strong> · sequência de{" "}
            {gamification.streak.current} presenças
          </p>
          <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", gap: 8 }}>
            {gamification.badges.map((badge) => (
              <li
                key={badge.milestone}
                className={`fb-badge ${badge.earned ? "fb-badge--active" : "fb-badge--neutral"}`}
              >
                {badge.milestone} presenças {badge.earned ? "✓" : "🔒"}
              </li>
            ))}
          </ul>
          {gamification.history.length === 0 ? (
            <p className="fb-note">Nenhum ponto ainda.</p>
          ) : (
            <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 6 }}>
              {gamification.history.map((item) => (
                <li key={item.id} style={{ display: "flex", justifyContent: "space-between" }}>
                  <span>
                    {item.subject ?? "Pontos"} · {formatHistoryWhen(item.occurredAt)}
                  </span>
                  <strong>
                    {item.points > 0 ? "+" : ""}
                    {item.points}
                  </strong>
                </li>
              ))}
            </ul>
          )}
        </div>
      );
    case "fichas":
      return overview.workoutSheets.length === 0 ? (
        <p className="fb-note">Nenhuma ficha de treino.</p>
      ) : (
        <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 8 }}>
          {overview.workoutSheets.map((sheet) => (
            <li key={sheet.id} style={{ display: "flex", justifyContent: "space-between" }}>
              <span>
                <strong>{sheet.title}</strong> · {sheet.exercises.length} exercícios · por{" "}
                {sheet.authorName} · {formatInstantDate(sheet.updatedAt)}
              </span>
              <span className="fb-badge fb-badge--neutral">{statusBadge(sheet.status)}</span>
            </li>
          ))}
        </ul>
      );
  }
}

/** Visão consolidada de um cliente, em abas, com desativar/reativar. */
export function ClientDetailPage() {
  const { id = "" } = useParams();
  const { can } = useAuth();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>("dados");
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const overviewQuery = useQuery({
    queryKey: ["clients", "overview", id],
    queryFn: () => getClientOverview(id),
  });
  const toggleMutation = useMutation({
    mutationFn: (active: boolean) => setClientActive(id, active),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["clients"] }),
  });

  const canEdit = can(Module.CLIENTES, PermissionAction.EDIT);
  const canDelete = can(Module.CLIENTES, PermissionAction.DELETE);
  const overview = overviewQuery.data;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18, height: "100%" }}>
      <Link to="/clientes">← Clientes</Link>

      {overviewQuery.isLoading && <p className="fb-note">Carregando…</p>}
      {overviewQuery.isError && (
        <p role="alert">
          {overviewQuery.error instanceof ApiError && overviewQuery.error.code === "OUT_OF_SCOPE"
            ? "Este cliente está fora do seu escopo."
            : "Não foi possível carregar o cliente."}
        </p>
      )}
      {toggleMutation.isError && <p role="alert">Não foi possível alterar o cliente.</p>}

      {overview && (
        <>
          <div className="fb-toolbar">
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <h1 className="fb-page-title">{overview.client.fullName}</h1>
              <span className={`fb-badge ${STATUS_BADGE[overview.client.status].className}`}>
                {STATUS_BADGE[overview.client.status].label}
              </span>
            </div>
            {overview.client.status !== "DELETED" && (
              <div style={{ display: "flex", gap: 8 }}>
                <BlockedAction
                  allowed={canEdit}
                  reason="Você não tem permissão para alterar clientes."
                >
                  <button
                    type="button"
                    className="fb-row-btn"
                    onClick={() => toggleMutation.mutate(overview.client.status !== "ACTIVE")}
                  >
                    {overview.client.status === "ACTIVE" ? "Desativar cliente" : "Reativar cliente"}
                  </button>
                </BlockedAction>
                <BlockedAction
                  allowed={canDelete}
                  reason="Você não tem permissão para excluir clientes."
                >
                  <button
                    type="button"
                    className="fb-row-btn fb-row-btn--danger"
                    onClick={() => setConfirmingDelete(true)}
                  >
                    Excluir cliente
                  </button>
                </BlockedAction>
              </div>
            )}
          </div>

          {confirmingDelete && (
            <DeleteUserDialog
              kind="cliente"
              name={overview.client.fullName}
              onConfirm={() => deleteClientRecord(id)}
              onDeleted={() => {
                void queryClient.invalidateQueries({ queryKey: ["clients"] });
                navigate("/clientes");
              }}
              onClose={() => setConfirmingDelete(false)}
            />
          )}

          <div className="fb-tabs" role="tablist">
            {TABS.map((item) => (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={tab === item.id}
                className={`fb-tab-btn${tab === item.id ? " active" : ""}`}
                onClick={() => setTab(item.id)}
              >
                {item.label}
              </button>
            ))}
          </div>

          <TabContent tab={tab} overview={overview} canEdit={canEdit} />
        </>
      )}
    </div>
  );
}
