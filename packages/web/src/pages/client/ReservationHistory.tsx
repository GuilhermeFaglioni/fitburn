import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ReservationStatus,
  type ClientAgendaItem,
  type MyReservationsQuery,
  type ReservationDetail,
  type ReservationStatusName,
} from "@fitburn/contracts";
import { getClientAgendaItem } from "../../lib/agenda/client-api";
import { formatClassDay, formatInstantHour } from "../../lib/agenda/format";
import { listMyReservations } from "../../lib/reservations/api";

/** Rótulos de cada estado: o selo do cartão e a pílula do filtro. */
const STATUSES: Array<{
  status: ReservationStatusName;
  badge: string;
  filter: string;
  tone: string;
}> = [
  { status: ReservationStatus.CONFIRMED, badge: "CONFIRMADA", filter: "Confirmadas", tone: "" },
  {
    status: ReservationStatus.CANCELLED,
    badge: "CANCELADA",
    filter: "Canceladas",
    tone: " fb-sheet-badge--muted",
  },
  {
    status: ReservationStatus.COMPLETED,
    badge: "CONCLUÍDA",
    filter: "Concluídas",
    tone: " fb-sheet-badge--muted",
  },
  {
    status: ReservationStatus.NO_SHOW,
    badge: "NÃO COMPARECEU",
    filter: "Não compareceu",
    tone: " fb-sheet-badge--flame",
  },
];

const SECTIONS: Array<{ when: MyReservationsQuery["when"]; title: string; empty: string }> = [
  { when: "upcoming", title: "Próximas reservas", empty: "Nenhuma reserva próxima." },
  { when: "past", title: "Anteriores", empty: "Nenhuma reserva anterior." },
];

/**
 * Aba "Histórico" da agenda (AgendaMobile/AgendaDesktop.dc.html): as minhas
 * reservas, próximas e anteriores, com filtro de estado. Os cartões seguem
 * os de "Próximas aulas" de HomeMobile.dc.html; uma aula que ainda não
 * começou abre o detalhe, com as ações de cancelar e remarcar.
 */
export function ReservationHistory({
  onOpenClass,
}: {
  onOpenClass: (item: ClientAgendaItem) => void;
}) {
  const [status, setStatus] = useState<ReservationStatusName | undefined>(undefined);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div className="fb-filter-chips" role="group" aria-label="Filtrar por estado">
        <button
          type="button"
          className="fb-filter-chip"
          aria-pressed={status === undefined}
          onClick={() => setStatus(undefined)}
        >
          Todas
        </button>
        {STATUSES.map((option) => (
          <button
            key={option.status}
            type="button"
            className="fb-filter-chip"
            aria-pressed={status === option.status}
            onClick={() => setStatus(option.status)}
          >
            {option.filter}
          </button>
        ))}
      </div>

      {SECTIONS.map((section) => (
        <ReservationSection
          key={section.when}
          {...section}
          status={status}
          onOpenClass={onOpenClass}
        />
      ))}
    </div>
  );
}

function ReservationSection({
  when,
  title,
  empty,
  status,
  onOpenClass,
}: {
  when: MyReservationsQuery["when"];
  title: string;
  empty: string;
  status: ReservationStatusName | undefined;
  onOpenClass: (item: ClientAgendaItem) => void;
}) {
  const queryClient = useQueryClient();
  const [unavailable, setUnavailable] = useState(false);
  const reservationsQuery = useQuery({
    queryKey: ["my-reservations", when, status ?? "all"],
    queryFn: () => listMyReservations({ when, status }),
  });

  async function openClass(occurrenceId: string) {
    setUnavailable(false);
    try {
      onOpenClass(
        await queryClient.fetchQuery({
          queryKey: ["client-agenda", "item", occurrenceId],
          queryFn: () => getClientAgendaItem(occurrenceId),
        }),
      );
    } catch {
      setUnavailable(true);
    }
  }

  return (
    <section className="fb-reservation-section" aria-label={title}>
      <h2 className="fb-reservation-section__title">{title}</h2>

      {reservationsQuery.isError && <p role="alert">Não foi possível carregar suas reservas.</p>}
      {unavailable && (
        <p role="alert" className="fb-reservation-section__notice">
          Esta aula não está mais disponível na agenda (foi cancelada ou já começou).
        </p>
      )}

      {reservationsQuery.isSuccess &&
        (reservationsQuery.data.length === 0 ? (
          <div className="fb-client-empty">{empty}</div>
        ) : (
          <ul className="fb-reservation-list">
            {reservationsQuery.data.map((reservation) => (
              <li key={reservation.id}>
                {new Date(reservation.occurrence.startsAt) > new Date() ? (
                  <button
                    type="button"
                    className="fb-reservation-card fb-reservation-card--link"
                    onClick={() => openClass(reservation.occurrence.id)}
                  >
                    <ReservationCardBody reservation={reservation} />
                  </button>
                ) : (
                  <div className="fb-reservation-card">
                    <ReservationCardBody reservation={reservation} />
                  </div>
                )}
              </li>
            ))}
          </ul>
        ))}
    </section>
  );
}

function ReservationCardBody({ reservation }: { reservation: ReservationDetail }) {
  const { occurrence } = reservation;
  const label = STATUSES.find((option) => option.status === reservation.status)!;
  return (
    <>
      <span className="fb-reservation-card__info">
        <span className="fb-reservation-card__title">{occurrence.name}</span>
        <span className="fb-reservation-card__when">
          {formatClassDay(occurrence.startsAt)}, {formatInstantHour(occurrence.startsAt)}
          {occurrence.instructor ? ` · Prof. ${occurrence.instructor.fullName}` : ""}
        </span>
      </span>
      <span className={`fb-sheet-badge${label.tone}`}>{label.badge}</span>
    </>
  );
}
