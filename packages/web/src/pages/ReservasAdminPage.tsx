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
import { Modal } from "../components/Modal";
import { formatClassDay, formatClassMoment, formatInstantHour } from "../lib/agenda/format";
import { errorMessage } from "../lib/auth/api";
import { useAuth } from "../lib/auth/AuthContext";
import { cancelAdminReservation, listAdminReservations } from "../lib/reservations/admin-api";
import {
  ReservationFormModal,
  type ReservationFormMode,
} from "./reservations-admin/ReservationFormModal";
import { EmptyState, ErrorState, Feedback, LoadingState } from "../components/states";
import { RequiresNetwork } from "../components/RequiresNetwork";

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
  tone: string;
}> = [
  {
    status: ReservationStatus.CONFIRMED,
    option: "Confirmada",
    badge: "CONFIRMADA",
    tone: "active",
  },
  { status: ReservationStatus.CANCELLED, option: "Cancelada", badge: "CANCELADA", tone: "danger" },
  { status: ReservationStatus.COMPLETED, option: "Concluída", badge: "CONCLUÍDA", tone: "neutral" },
  {
    status: ReservationStatus.NO_SHOW,
    option: "Não compareceu",
    badge: "NÃO COMPARECEU",
    tone: "danger",
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
 * Reservas administrativas (ReservasAdmin.dc.html): a equipe consulta as
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

  const query: AdminReservationsQuery = {
    ...(status ? { status } : {}),
    ...periodRange(period),
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

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18, height: "100%" }}>
      <div className="fb-page-header">
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span className="fb-page-eyebrow">Reservas</span>
          <h1 className="fb-page-title">Reservas administrativas</h1>
        </div>
        <BlockedAction allowed={canCreate} reason="Você não tem permissão para criar reservas.">
          <button
            type="button"
            className="fb-btn-primary"
            onClick={() => {
              setFlash(null);
              setForm({ kind: "create" });
            }}
          >
            + Nova reserva
          </button>
        </BlockedAction>
      </div>

      <div className="fb-toolbar fb-toolbar--filters">
        <input
          type="search"
          className="fb-field"
          style={{ width: 260 }}
          placeholder="Buscar por cliente ou aula"
          aria-label="Buscar por cliente ou aula"
          value={searchTerm}
          onChange={(event) => setSearchTerm(event.target.value)}
        />
        <select
          className="fb-field"
          style={{ width: 180 }}
          aria-label="Status"
          value={status}
          onChange={(event) => setStatus(event.target.value as ReservationStatusName | "")}
        >
          <option value="">Status: todas</option>
          {STATUSES.map((item) => (
            <option key={item.status} value={item.status}>
              {item.option}
            </option>
          ))}
        </select>
        <select
          className="fb-field"
          style={{ width: 180 }}
          aria-label="Período"
          value={period}
          onChange={(event) => setPeriod(event.target.value as Period)}
        >
          {PERIODS.map((item) => (
            <option key={item.value} value={item.value}>
              {item.label}
            </option>
          ))}
        </select>
      </div>

      {flash && <Feedback tone="success">{flash}</Feedback>}
      {reservationsQuery.isLoading && <LoadingState />}
      {reservationsQuery.isError && (
        <ErrorState
          message={errorMessage(reservationsQuery.error, "Não foi possível carregar as reservas.")}
          onRetry={() => void reservationsQuery.refetch()}
        />
      )}
      {reservations && reservations.length === 0 && (
        <EmptyState message="Nenhuma reserva encontrada." />
      )}

      {reservations && reservations.length > 0 && (
        <div className="fb-table-wrap">
          <table>
            <thead>
              <tr>
                <th className="fb-th">Cliente</th>
                <th className="fb-th">Aula</th>
                <th className="fb-th">Data / Horário</th>
                <th className="fb-th">Status</th>
                <th className="fb-th" style={{ textAlign: "right" }}>
                  Ações
                </th>
              </tr>
            </thead>
            <tbody>
              {reservations.map((reservation) => {
                const badge = STATUSES.find((item) => item.status === reservation.status)!;
                const changeable = isChangeable(reservation);
                const muted = reservation.status !== ReservationStatus.CONFIRMED;
                const name = reservation.client.fullName;
                const record = [
                  `Criada por ${actorText(reservation.createdBy)}`,
                  ...(reservation.status === ReservationStatus.CANCELLED
                    ? [`Cancelada por ${actorText(reservation.cancelledBy)}`]
                    : []),
                ];
                return (
                  <tr key={reservation.id} className={muted ? "fb-row--inactive" : undefined}>
                    <td className="fb-td fb-td--name">{name}</td>
                    <td className="fb-td">{reservation.occurrence.modality.name}</td>
                    <td className="fb-td fb-td--soft">
                      {formatClassDay(reservation.occurrence.startsAt)},{" "}
                      {formatInstantHour(reservation.occurrence.startsAt)}
                    </td>
                    <td className="fb-td">
                      <span
                        className={`fb-badge fb-badge--${badge.tone}`}
                        title={record.join(". ")}
                      >
                        {badge.badge}
                      </span>
                      {/* Quem criou e quem cancelou: fora do quadro do design, dito aos leitores de tela e no title do selo. */}
                      {record.map((line) => (
                        <span key={line} className="fb-visually-hidden">
                          {line}
                        </span>
                      ))}
                    </td>
                    <td className="fb-td fb-td--actions" style={{ textAlign: "right" }}>
                      {changeable ? (
                        <>
                          {!isDeletedClient(reservation) && (
                            <BlockedAction
                              allowed={canEdit}
                              reason="Você não tem permissão para alterar reservas."
                            >
                              <button
                                type="button"
                                className="fb-row-btn"
                                aria-label={`Remarcar reserva de ${name}`}
                                onClick={() => {
                                  setFlash(null);
                                  setForm({ kind: "reschedule", reservation });
                                }}
                              >
                                Remarcar
                              </button>
                            </BlockedAction>
                          )}
                          <BlockedAction
                            allowed={canEdit}
                            reason="Você não tem permissão para alterar reservas."
                          >
                            <button
                              type="button"
                              className="fb-row-btn fb-row-btn--danger"
                              aria-label={`Cancelar reserva de ${name}`}
                              onClick={() => {
                                setFlash(null);
                                cancelMutation.reset();
                                setCancelling(reservation);
                              }}
                            >
                              Cancelar
                            </button>
                          </BlockedAction>
                        </>
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {form && (
        <ReservationFormModal mode={form} onClose={() => setForm(null)} onDone={finishForm} />
      )}

      {cancelling && (
        <Modal title="Cancelar reserva" onClose={() => setCancelling(null)}>
          <p className="fb-modal__text">
            Cancelar a reserva de <strong>{cancelling.client.fullName}</strong> em{" "}
            {cancelling.occurrence.name}, {formatClassMoment(cancelling.occurrence.startsAt)}? A
            vaga será liberada para outros clientes.
          </p>
          {cancelMutation.isError && (
            <div role="alert" className="fb-error-box">
              {errorMessage(cancelMutation.error, "Não foi possível cancelar a reserva.")}
            </div>
          )}
          <div className="fb-modal__footer fb-modal__footer--end fb-modal__footer--tight">
            <button type="button" className="fb-btn-secondary" onClick={() => setCancelling(null)}>
              Voltar
            </button>
            <RequiresNetwork>
              <button
                type="button"
                className="fb-btn-danger"
                disabled={cancelMutation.isPending}
                onClick={() => cancelMutation.mutate(cancelling.id)}
              >
                Confirmar cancelamento
              </button>
            </RequiresNetwork>
          </div>
        </Modal>
      )}
    </div>
  );
}
