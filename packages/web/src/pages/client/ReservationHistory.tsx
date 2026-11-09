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
import { QueryBlockState } from "../../components/QueryBlockState";
import { Badge, type BadgeTone } from "../../components/ui/Badge";
import { Pill } from "../../components/ui/Pill";
import { EmptyState } from "../../components/ui/States";
import { ClassItem } from "./ClassItem";

/** Rótulos de cada estado: o selo do item e a pílula do filtro. A situação vai no texto, a cor só reforça. */
const STATUSES: Array<{
  status: ReservationStatusName;
  badge: string;
  filter: string;
  tone: BadgeTone;
  dot?: boolean;
}> = [
  { status: ReservationStatus.CONFIRMED, badge: "CONFIRMADA", filter: "Confirmadas", tone: "ok", dot: true },
  { status: ReservationStatus.CANCELLED, badge: "CANCELADA", filter: "Canceladas", tone: "err" },
  { status: ReservationStatus.COMPLETED, badge: "CONCLUÍDA", filter: "Concluídas", tone: "neutral" },
  { status: ReservationStatus.NO_SHOW, badge: "NÃO COMPARECEU", filter: "Não compareceu", tone: "warn" },
];

const SECTIONS: Array<{ when: MyReservationsQuery["when"]; title: string; empty: string }> = [
  { when: "upcoming", title: "Próximas reservas", empty: "Nenhuma reserva próxima." },
  { when: "past", title: "Anteriores", empty: "Nenhuma reserva anterior." },
];

/**
 * Aba "Histórico" da agenda: as minhas reservas, próximas e anteriores, com filtro de situação. Os itens são os
 * mesmos da agenda; uma aula que ainda não começou abre o detalhe, com as ações de cancelar e remarcar. Cada
 * seção carrega, falha e fica sem conexão sozinha.
 */
export function ReservationHistory({
  onOpenClass,
}: {
  onOpenClass: (item: ClientAgendaItem) => void;
}) {
  const [status, setStatus] = useState<ReservationStatusName | undefined>(undefined);

  return (
    <div className="fb-agenda__history">
      <div className="fb-agenda__scroller" role="group" aria-label="Filtrar por estado">
        <Pill pressed={status === undefined} onClick={() => setStatus(undefined)}>
          Todas
        </Pill>
        {STATUSES.map((option) => (
          <Pill
            key={option.status}
            pressed={status === option.status}
            onClick={() => setStatus(option.status)}
          >
            {option.filter}
          </Pill>
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
    <section className="fb-agenda__section" aria-label={title}>
      <h2 className="fb-agenda__section-title">{title}</h2>

      <QueryBlockState
        className="fb-agenda__state"
        query={reservationsQuery}
        loading="Carregando…"
        error="Não foi possível carregar suas reservas."
        hasData={reservationsQuery.data !== undefined}
      />
      {unavailable && (
        <p role="alert" className="fb-agenda__notice">
          Esta aula não está mais disponível na agenda (foi cancelada ou já começou).
        </p>
      )}

      {reservationsQuery.data &&
        (reservationsQuery.data.length === 0 ? (
          <EmptyState title={empty} />
        ) : (
          <ul className="fb-agenda__list">
            {reservationsQuery.data.map((reservation) => (
              <li key={reservation.id}>
                <ReservationItem
                  reservation={reservation}
                  onOpen={
                    new Date(reservation.occurrence.startsAt) > new Date()
                      ? () => openClass(reservation.occurrence.id)
                      : undefined
                  }
                />
              </li>
            ))}
          </ul>
        ))}
    </section>
  );
}

function ReservationItem({
  reservation,
  onOpen,
}: {
  reservation: ReservationDetail;
  onOpen?: () => void;
}) {
  const { occurrence } = reservation;
  const label = STATUSES.find((option) => option.status === reservation.status)!;
  return (
    <ClassItem
      time={formatInstantHour(occurrence.startsAt)}
      timeNote={formatClassDay(occurrence.startsAt)}
      title={occurrence.name}
      instructor={occurrence.instructor ? `Prof. ${occurrence.instructor.fullName}` : undefined}
      end={
        <Badge tone={label.tone} dot={label.dot}>
          {label.badge}
        </Badge>
      }
      onClick={onOpen}
    />
  );
}
