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
import {
  cancelAdminReservation,
  listAdminReservations,
  searchReservationClients,
} from "../lib/reservations/admin-api";
import {
  ReservationFormModal,
  type ReservationFormMode,
} from "./reservations-admin/ReservationFormModal";

type Period = "today" | "week" | "all";

const PERIODS: Array<{ value: Period; label: string }> = [
  { value: "today", label: "Hoje" },
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
  const [clientId, setClientId] = useState("");
  const [status, setStatus] = useState<ReservationStatusName | "">("");
  const [period, setPeriod] = useState<Period>("today");
  const [form, setForm] = useState<ReservationFormMode | null>(null);
  const [cancelling, setCancelling] = useState<AdminReservationDetail | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  const query: AdminReservationsQuery = {
    ...(clientId ? { clientId } : {}),
    ...(status ? { status } : {}),
    ...periodRange(period),
  };
  const reservationsQuery = useQuery({
    queryKey: ["admin-reservations", query],
    queryFn: () => listAdminReservations(query),
  });
  const clientsQuery = useQuery({
    queryKey: ["clients", "reservation-filter"],
    queryFn: () => searchReservationClients(),
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
  const reservations = reservationsQuery.data;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18, height: "100%" }}>
      <div className="fb-toolbar">
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

      <div className="fb-toolbar" style={{ justifyContent: "flex-start", gap: 10 }}>
        <label className="fb-filter">
          Cliente
          <select
            className="fb-field"
            value={clientId}
            onChange={(event) => setClientId(event.target.value)}
          >
            <option value="">Todos</option>
            {(clientsQuery.data ?? []).map((client) => (
              <option key={client.id} value={client.id}>
                {client.fullName}
              </option>
            ))}
          </select>
        </label>
        <label className="fb-filter">
          Status
          <select
            className="fb-field"
            value={status}
            onChange={(event) => setStatus(event.target.value as ReservationStatusName | "")}
          >
            <option value="">Todas</option>
            {STATUSES.map((item) => (
              <option key={item.status} value={item.status}>
                {item.option}
              </option>
            ))}
          </select>
        </label>
        <label className="fb-filter">
          Período
          <select
            className="fb-field"
            value={period}
            onChange={(event) => setPeriod(event.target.value as Period)}
          >
            {PERIODS.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {flash && (
        <div role="status" className="fb-success-box">
          {flash}
        </div>
      )}
      {reservationsQuery.isLoading && <p className="fb-note">Carregando…</p>}
      {reservationsQuery.isError && (
        <p role="alert">
          {errorMessage(reservationsQuery.error, "Não foi possível carregar as reservas.")}
        </p>
      )}
      {reservations && reservations.length === 0 && (
        <p className="fb-note">Nenhuma reserva encontrada.</p>
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
                <th className="fb-th">Registro</th>
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
                return (
                  <tr key={reservation.id}>
                    <td
                      className="fb-td"
                      style={{ fontWeight: 500, color: muted ? "#8a8a8a" : undefined }}
                    >
                      {name}
                    </td>
                    <td className="fb-td" style={{ color: muted ? "#b0b0b0" : undefined }}>
                      {reservation.occurrence.name}
                    </td>
                    <td className="fb-td" style={{ color: muted ? "#b0b0b0" : "#5a5a5a" }}>
                      {formatClassDay(reservation.occurrence.startsAt)},{" "}
                      {formatInstantHour(reservation.occurrence.startsAt)}
                    </td>
                    <td className="fb-td">
                      <span className={`fb-badge fb-badge--${badge.tone}`}>{badge.badge}</span>
                    </td>
                    <td className="fb-td" style={{ fontSize: 12, color: "#5a5a5a" }}>
                      <div>Criada por {actorText(reservation.createdBy)}</div>
                      {reservation.status === ReservationStatus.CANCELLED && (
                        <div>Cancelada por {actorText(reservation.cancelledBy)}</div>
                      )}
                    </td>
                    <td className="fb-td" style={{ textAlign: "right" }}>
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
                        <span style={{ color: "#c8c8c8", fontSize: 12 }}>—</span>
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
          <div className="fb-modal__footer" style={{ justifyContent: "flex-end" }}>
            <button type="button" className="fb-btn-secondary" onClick={() => setCancelling(null)}>
              Voltar
            </button>
            <button
              type="button"
              className="fb-btn-danger"
              disabled={cancelMutation.isPending}
              onClick={() => cancelMutation.mutate(cancelling.id)}
            >
              Confirmar cancelamento
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
