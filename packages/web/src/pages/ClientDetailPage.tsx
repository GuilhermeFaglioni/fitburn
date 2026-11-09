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
import { QueryBlockState } from "../components/QueryBlockState";
import { Alert } from "../components/ui/Alert";
import { Badge, type BadgeTone } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { DescriptionList } from "../components/ui/DescriptionList";
import { PageHeader } from "../components/ui/PageHeader";
import { Segmented } from "../components/ui/Segmented";
import { EmptyState } from "../components/ui/States";
import { formatClassDay, formatInstantDate, formatLocalDate } from "../lib/agenda/format";
import { ApiError } from "../lib/auth/api";
import { useAuth } from "../lib/auth/AuthContext";
import { deleteClientRecord, getClientOverview, setClientActive } from "../lib/clients/api";
import { formatHistoryWhen } from "../lib/gamification/format";
import { invalidateAfterDeletion } from "../lib/invalidate-after-deletion";
import { PlanHistoryList } from "./plans/PlanHistoryList";
import { statusBadge } from "./workout-sheets/status";
import { ClientEditForm } from "./clients/ClientEditForm";

type Tab = "dados" | "plano" | "reservas" | "gamificacao" | "fichas";

const TABS: Array<{ id: Tab; label: string }> = [
  { id: "dados", label: "Dados pessoais" },
  { id: "plano", label: "Plano e histórico" },
  { id: "reservas", label: "Reservas" },
  { id: "gamificacao", label: "FitPoints" },
  { id: "fichas", label: "Fichas" },
];

const TABS_OPTIONS = TABS.map((item) => ({ value: item.id, label: item.label }));

const STATUS_BADGE: Record<UserDetail["status"], { label: string; tone: BadgeTone }> = {
  ACTIVE: { label: "ATIVO", tone: "ok" },
  INACTIVE: { label: "INATIVO", tone: "neutral" },
  DELETED: { label: "EXCLUÍDO", tone: "neutral" },
};

const RESERVATION_LABEL: Record<ReservationDetail["status"], string> = {
  CONFIRMED: "CONFIRMADA",
  CANCELLED: "CANCELADA",
  COMPLETED: "CONCLUÍDA",
  NO_SHOW: "NÃO COMPARECEU",
};

function valueOrDash(value: string | null | undefined): string {
  return value || "—";
}

function ReservationRows({ items, empty }: { items: ReservationDetail[]; empty: string }) {
  if (items.length === 0) return <EmptyState title={empty} />;
  return (
    <ul className="fb-ui-rows">
      {items.map((reservation) => (
        <li key={reservation.id}>
          <span>
            <strong>{reservation.occurrence.name}</strong> ·{" "}
            {formatClassDay(reservation.occurrence.startsAt)}
          </span>
          <Badge>{RESERVATION_LABEL[reservation.status]}</Badge>
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
        <Card className="fb-ui-stack">
          <h2 className="fb-ui-section-title">Dados pessoais</h2>
          <DescriptionList
            items={[
              { term: "E-mail", detail: client.email },
              { term: "Telefone", detail: valueOrDash(client.phone) },
              ...(client.birthDate !== undefined
                ? [
                    {
                      term: "Data de nascimento",
                      detail: client.birthDate ? formatLocalDate(client.birthDate) : "—",
                    },
                  ]
                : []),
              ...(client.document !== undefined
                ? [{ term: "Documento", detail: valueOrDash(client.document) }]
                : []),
              ...(client.address !== undefined
                ? [{ term: "Endereço", detail: valueOrDash(client.address) }]
                : []),
            ]}
          />
          {client.status !== "DELETED" && (
            <div>
              <BlockedAction
                allowed={canEdit}
                reason="Você não tem permissão para editar clientes."
              >
                <Button size="sm" onClick={() => setEditing(true)}>
                  Editar dados
                </Button>
              </BlockedAction>
            </div>
          )}
        </Card>
      );
    case "plano":
      return (
        <Card className="fb-ui-stack">
          <h2 className="fb-ui-section-title">Plano atual</h2>
          {plan.active ? (
            <PlanHistoryList items={[plan.active]} light />
          ) : (
            <EmptyState title="Sem plano ativo." />
          )}
          {plan.history.length > 0 && (
            <>
              <h2 className="fb-ui-section-title">Histórico</h2>
              <PlanHistoryList items={plan.history} light />
            </>
          )}
        </Card>
      );
    case "reservas":
      return (
        <Card className="fb-ui-stack">
          <h2 className="fb-ui-section-title">Próximas reservas</h2>
          <ReservationRows items={overview.upcomingReservations} empty="Nenhuma reserva próxima." />
          <h2 className="fb-ui-section-title">Histórico de reservas</h2>
          <ReservationRows items={overview.pastReservations} empty="Nenhuma reserva anterior." />
        </Card>
      );
    case "gamificacao":
      return (
        <Card className="fb-ui-stack">
          <h2 className="fb-ui-section-title">FitPoints</h2>
          <p className="fb-ui-note">
            <strong>{gamification.totalPoints} pontos</strong> · sequência de{" "}
            {gamification.streak.current} presenças
          </p>
          <ul className="fb-ui-badges" aria-label="Marcos de presença">
            {gamification.badges.map((badge) => (
              <li key={badge.milestone}>
                <Badge tone={badge.earned ? "ok" : "neutral"}>
                  {badge.milestone} presenças {badge.earned ? "✓" : "🔒"}
                </Badge>
              </li>
            ))}
          </ul>
          {gamification.history.length === 0 ? (
            <EmptyState title="Nenhum ponto ainda." />
          ) : (
            <ul className="fb-ui-rows">
              {gamification.history.map((item) => (
                <li key={item.id}>
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
        </Card>
      );
    case "fichas":
      return overview.workoutSheets.length === 0 ? (
        <Card>
          <EmptyState title="Nenhuma ficha de treino." />
        </Card>
      ) : (
        <Card>
          <ul className="fb-ui-rows">
            {overview.workoutSheets.map((sheet) => (
              <li key={sheet.id}>
                <span>
                  <strong>{sheet.title}</strong> · {sheet.exercises.length} exercícios · por{" "}
                  {sheet.authorName} · {formatInstantDate(sheet.updatedAt)}
                </span>
                <Badge>{statusBadge(sheet.status)}</Badge>
              </li>
            ))}
          </ul>
        </Card>
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

  const outOfScope =
    overviewQuery.error instanceof ApiError && overviewQuery.error.code === "OUT_OF_SCOPE";

  return (
    <div className="fb-ui-page">
      <QueryBlockState
        query={overviewQuery}
        hasData={overview !== undefined}
        loading="Carregando cliente…"
        error={
          outOfScope
            ? "Este cliente está fora do seu escopo."
            : "Não foi possível carregar o cliente."
        }
      />
      {(overviewQuery.isPending || overviewQuery.isError) && (
        <nav aria-label="Trilha de navegação" className="fb-ui-crumb">
          <Link to="/clientes" className="fb-ui-link">
            ← Clientes
          </Link>
        </nav>
      )}
      {toggleMutation.isError && <Alert>Não foi possível alterar o cliente.</Alert>}

      {overview && (
        <>
          <PageHeader
            crumb={
              <>
                <Link to="/clientes" className="fb-ui-link">
                  Clientes
                </Link>{" "}
                / {overview.client.fullName}
              </>
            }
            kicker="Cliente"
            title={overview.client.fullName}
            badge={
              <Badge tone={STATUS_BADGE[overview.client.status].tone} dot>
                {STATUS_BADGE[overview.client.status].label}
              </Badge>
            }
            actions={
              overview.client.status !== "DELETED" && (
                <>
                  <BlockedAction
                    allowed={canEdit}
                    reason="Você não tem permissão para alterar clientes."
                  >
                    <Button
                      size="sm"
                      busy={toggleMutation.isPending}
                      onClick={() => toggleMutation.mutate(overview.client.status !== "ACTIVE")}
                    >
                      {overview.client.status === "ACTIVE"
                        ? "Desativar cliente"
                        : "Reativar cliente"}
                    </Button>
                  </BlockedAction>
                  <BlockedAction
                    allowed={canDelete}
                    reason="Você não tem permissão para excluir clientes."
                  >
                    <Button variant="danger" size="sm" onClick={() => setConfirmingDelete(true)}>
                      Excluir cliente
                    </Button>
                  </BlockedAction>
                </>
              )
            }
          />

          {confirmingDelete && (
            <DeleteUserDialog
              kind="cliente"
              name={overview.client.fullName}
              onConfirm={() => deleteClientRecord(id)}
              onDeleted={() => {
                void invalidateAfterDeletion(queryClient);
                navigate("/clientes");
              }}
              onClose={() => setConfirmingDelete(false)}
            />
          )}

          <Segmented
            label="Seções do cliente"
            options={TABS_OPTIONS}
            value={tab}
            onChange={setTab}
          />

          <TabContent tab={tab} overview={overview} canEdit={canEdit} />
        </>
      )}
    </div>
  );
}
