import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  addDays,
  gymToday,
  Module,
  PermissionAction,
  ReservationStatus,
  startOfWeek,
  UserStatus,
  type AdminReservationDetail,
  type AdminReservationsQuery,
  type ReservationActor,
  type ReservationStatusName,
} from "@fitburn/contracts";
import { BlockedAction } from "../components/BlockedAction";
import { ExportCsvButton } from "../components/ExportCsvButton";
import { QueryBlockState } from "../components/QueryBlockState";
import { RequiresNetwork } from "../components/RequiresNetwork";
import { Alert } from "../components/ui/Alert";
import { Badge, type BadgeTone } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { Dialog } from "../components/ui/Dialog";
import { Field } from "../components/ui/Field";
import { PageHeader } from "../components/ui/PageHeader";
import { Select } from "../components/ui/Select";
import { EmptyState } from "../components/ui/States";
import { Table, type TableColumn } from "../components/ui/Table";
import { Toolbar } from "../components/ui/Toolbar";
import { formatClassDay, formatClassMoment, formatInstantHour } from "../lib/agenda/format";
import { errorMessage } from "../lib/auth/api";
import { useAuth } from "../lib/auth/AuthContext";
import {
  cancelAdminReservation,
  exportReservationsCsv,
  listAdminReservations,
} from "../lib/reservations/admin-api";
import {
  ReservationFormModal,
  type ReservationFormMode,
} from "./reservations-admin/ReservationFormModal";

type Period = "today" | "week" | "all";

const PERIODS: Array<{ value: Period; label: string }> = [
  { value: "today", label: "Data: hoje" },
  { value: "week", label: "Esta semana" },
  { value: "all", label: "Todas" },
];

const STATUSES: Array<{
  status: ReservationStatusName;
  option: string;
  badge: string;
  tone: BadgeTone;
}> = [
  {
    status: ReservationStatus.CONFIRMED,
    option: "Confirmada",
    badge: "CONFIRMADA",
    tone: "ok",
  },
  { status: ReservationStatus.CANCELLED, option: "Cancelada", badge: "CANCELADA", tone: "err" },
  { status: ReservationStatus.COMPLETED, option: "Concluída", badge: "CONCLUÍDA", tone: "neutral" },
  {
    status: ReservationStatus.NO_SHOW,
    option: "Não compareceu",
    badge: "NÃO COMPARECEU",
    tone: "warn",
  },
];

function periodRange(period: Period): Pick<AdminReservationsQuery, "from" | "to"> {
  const today = gymToday();
  if (period === "today") return { from: today, to: today };
  if (period === "week") {
    const weekStart = startOfWeek(today);
    return { from: weekStart, to: addDays(weekStart, 6) };
  }
  return {};
}

function actorText(actor: ReservationActor | null): string {
  if (!actor) return "não registrado";
  return `${actor.fullName} (${actor.kind === "CLIENT" ? "cliente" : "equipe"})`;
}

/** Reserva de quem foi excluído (anonimizado): fica no histórico, mas não se remarca. */
function isDeletedClient(reservation: AdminReservationDetail): boolean {
  return reservation.client.status === UserStatus.DELETED;
}

/** Só uma reserva confirmada de uma aula que ainda não começou pode ser cancelada ou remarcada. */
function isChangeable(reservation: AdminReservationDetail): boolean {
  return (
    reservation.status === ReservationStatus.CONFIRMED &&
    new Date(reservation.occurrence.startsAt) > new Date()
  );
}

/**
 * Reservas administrativas (D-038, #156): a equipe consulta as
 * reservas e reserva, cancela ou remarca em nome do cliente. As regras são as
 * do cliente; o servidor decide e registra quem executou.
 */
export function ReservasAdminPage() {
  const { can } = useAuth();
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState("");
  const [status, setStatus] = useState<ReservationStatusName | "">("");
  const [period, setPeriod] = useState<Period>("today");
  const [form, setForm] = useState<ReservationFormMode | null>(null);
  const [cancelling, setCancelling] = useState<AdminReservationDetail | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  const range = periodRange(period);
  // "Todas" não tem intervalo, e a exportação exige from/to.
  const exportRange = range.from && range.to ? { from: range.from, to: range.to } : null;
  const query: AdminReservationsQuery = {
    ...(status ? { status } : {}),
    ...range,
  };
  const reservationsQuery = useQuery({
    queryKey: ["admin-reservations", query],
    queryFn: () => listAdminReservations(query),
  });

  const cancelMutation = useMutation({
    mutationFn: (reservationId: string) => cancelAdminReservation(reservationId),
    onSuccess: (cancelled) => {
      setCancelling(null);
      setFlash(`Reserva cancelada. A vaga de ${cancelled.client.fullName} foi liberada.`);
    },
    // Sucesso ou recusa: a lista e as vagas da agenda nunca ficam desatualizadas.
    onSettled: () => refreshViews(),
  });

  function refreshViews() {
    return Promise.all([
      queryClient.invalidateQueries({ queryKey: ["admin-reservations"] }),
      queryClient.invalidateQueries({ queryKey: ["client-agenda"] }),
    ]);
  }

  function finishForm(message: string) {
    setForm(null);
    setFlash(message);
    void refreshViews();
  }

  const canCreate = can(Module.RESERVAS, PermissionAction.CREATE);
  const canEdit = can(Module.RESERVAS, PermissionAction.EDIT);
  // A busca por cliente ou aula filtra a lista já carregada (a API filtra por período e status).
  const normalizedSearch = searchTerm.trim().toLowerCase();
  const reservations = reservationsQuery.data?.filter(
    (reservation) =>
      normalizedSearch === "" ||
      reservation.client.fullName.toLowerCase().includes(normalizedSearch) ||
      reservation.occurrence.name.toLowerCase().includes(normalizedSearch) ||
      reservation.occurrence.modality.name.toLowerCase().includes(normalizedSearch),
  );

  const columns: TableColumn<AdminReservationDetail>[] = [
    {
      key: "client",
      header: "Cliente",
      className: "fb-ui-table__name",
      cell: (reservation) => reservation.client.fullName,
    },
    {
      key: "class",
      header: "Aula",
      cell: (reservation) => reservation.occurrence.modality.name,
    },
    {
      key: "when",
      header: "Data / Horário",
      className: "fb-ui-table__muted",
      cell: (reservation) =>
        `${formatClassDay(reservation.occurrence.startsAt)}, ${formatInstantHour(reservation.occurrence.startsAt)}`,
    },
    {
      key: "status",
      header: "Status",
      cell: (reservation) => {
        const item = STATUSES.find((candidate) => candidate.status === reservation.status)!;
        const record = [
          `Criada por ${actorText(reservation.createdBy)}`,
          ...(reservation.status === ReservationStatus.CANCELLED
            ? [`Cancelada por ${actorText(reservation.cancelledBy)}`]
            : []),
        ];
        return (
          <>
            <Badge tone={item.tone} dot={item.tone === "ok"} title={record.join(". ")}>
              {item.badge}
            </Badge>
            {/* Quem criou e quem cancelou: dito aos leitores de tela e no title do selo. */}
            {record.map((line) => (
              <span key={line} className="fb-ui-sr-only">
                {line}
              </span>
            ))}
          </>
        );
      },
    },
    {
      key: "actions",
      header: "Ações",
      actions: true,
      cell: (reservation) => {
        if (!isChangeable(reservation)) return "—";
        const name = reservation.client.fullName;
        return (
          <div className="fb-ui-row-actions">
            {!isDeletedClient(reservation) && (
              <BlockedAction allowed={canEdit} reason="Você não tem permissão para alterar reservas.">
                <Button
                  size="sm"
                  aria-label={`Remarcar reserva de ${name}`}
                  onClick={() => {
                    setFlash(null);
                    setForm({ kind: "reschedule", reservation });
                  }}
                >
                  Remarcar
                </Button>
              </BlockedAction>
            )}
            <BlockedAction allowed={canEdit} reason="Você não tem permissão para alterar reservas.">
              <Button
                size="sm"
                variant="ghost-danger"
                aria-label={`Cancelar reserva de ${name}`}
                onClick={() => {
                  setFlash(null);
                  cancelMutation.reset();
                  setCancelling(reservation);
                }}
              >
                Cancelar
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
        kicker="Reservas"
        title="Reservas administrativas"
        actions={
          <>
            {/* Exporta o período do filtro; "Todas" não tem intervalo (a API exige from/to). */}
            <ExportCsvButton
              label="Exportar reservas (CSV)"
              onExport={() =>
                exportRange
                  ? exportReservationsCsv(exportRange.from, exportRange.to)
                  : Promise.resolve()
              }
              disabled={exportRange === null}
              hint={exportRange === null ? "Escolha Hoje ou Esta semana para exportar." : undefined}
            />
            <BlockedAction allowed={canCreate} reason="Você não tem permissão para criar reservas.">
              <Button
                variant="primary"
                size="sm"
                onClick={() => {
                  setFlash(null);
                  setForm({ kind: "create" });
                }}
              >
                + Nova reserva
              </Button>
            </BlockedAction>
          </>
        }
      />

      <Toolbar role="search" aria-label="Filtros das reservas">
        <Field
          type="search"
          label="Buscar por cliente ou aula"
          hideLabel
          placeholder="Buscar por cliente ou aula"
          value={searchTerm}
          onChange={(event) => setSearchTerm(event.target.value)}
        />
        <Select
          label="Status"
          hideLabel
          value={status}
          onChange={(event) => setStatus(event.target.value as ReservationStatusName | "")}
        >
          <option value="">Status: todas</option>
          {STATUSES.map((item) => (
            <option key={item.status} value={item.status}>
              {item.option}
            </option>
          ))}
        </Select>
        <Select
          label="Período"
          hideLabel
          value={period}
          onChange={(event) => setPeriod(event.target.value as Period)}
        >
          {PERIODS.map((item) => (
            <option key={item.value} value={item.value}>
              {item.label}
            </option>
          ))}
        </Select>
      </Toolbar>

      {flash && <Alert tone="ok">{flash}</Alert>}
      <QueryBlockState
        query={reservationsQuery}
        hasData={reservationsQuery.data !== undefined}
        loading="Carregando reservas…"
        error={errorMessage(reservationsQuery.error, "Não foi possível carregar as reservas.")}
      />
      {reservations && reservations.length === 0 && (
        <EmptyState title="Nenhuma reserva encontrada." />
      )}
      {reservations && reservations.length > 0 && (
        <Table
          label="Reservas"
          columns={columns}
          rows={reservations}
          rowKey={(reservation) => reservation.id}
        />
      )}

      {form && (
        <ReservationFormModal mode={form} onClose={() => setForm(null)} onDone={finishForm} />
      )}

      {cancelling && (
        <Dialog
          title="Cancelar reserva"
          onClose={() => setCancelling(null)}
          description={
            <>
              Cancelar a reserva de <strong>{cancelling.client.fullName}</strong> em{" "}
              {cancelling.occurrence.name}, {formatClassMoment(cancelling.occurrence.startsAt)}? A
              vaga será liberada para outros clientes.
            </>
          }
          actions={
            <>
              <Button onClick={() => setCancelling(null)}>Voltar</Button>
              <RequiresNetwork>
                <Button
                  variant="danger"
                  busy={cancelMutation.isPending}
                  onClick={() => cancelMutation.mutate(cancelling.id)}
                >
                  Confirmar cancelamento
                </Button>
              </RequiresNetwork>
            </>
          }
        >
          {cancelMutation.isError && (
            <Alert>{errorMessage(cancelMutation.error, "Não foi possível cancelar a reserva.")}</Alert>
          )}
        </Dialog>
      )}
    </div>
  );
}
