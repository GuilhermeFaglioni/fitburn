import { useState, type Ref } from "react";
import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  gymToday,
  ReservationStatus,
  utcToGymDateTime,
  type ClientAgendaItem,
  type ReservationDetail,
} from "@fitburn/contracts";
import { getClientAgendaItem } from "../../lib/agenda/client-api";
import {
  formatClassMoment,
  formatInstantHour,
  formatReservationDayHeading,
} from "../../lib/agenda/format";
import { firstName } from "../../lib/names";
import { listMyReservations } from "../../lib/reservations/api";
import { QueryBlockState } from "../../components/QueryBlockState";
import { Button } from "../../components/ui/Button";
import { EmptyState } from "../../components/ui/States";
import { ClassItem } from "./ClassItem";

/** Query string da subvisão de histórico; a aba entra explícita para a URL dizer onde o histórico mora. */
export const HISTORY_SEARCH = "?aba=suas&ver=historico";

/** As reservas agrupadas por dia da academia (a lista já vem em ordem de horário; aqui só se garante). */
function groupByDay(reservations: ReservationDetail[]) {
  const sorted = [...reservations].sort((a, b) =>
    a.occurrence.startsAt.localeCompare(b.occurrence.startsAt),
  );
  const groups = new Map<string, ReservationDetail[]>();
  for (const reservation of sorted) {
    const { date } = utcToGymDateTime(reservation.occurrence.startsAt);
    groups.set(date, [...(groups.get(date) ?? []), reservation]);
  }
  return [...groups];
}

/**
 * Aba "Suas aulas" da agenda: as reservas confirmadas e futuras do cliente, agrupadas por dia, cada uma com
 * Remarcar e Cancelar. As duas ações são as do detalhe da aula (`ClassDetailSheet`): a página recebe a aula da
 * agenda e abre a remarcação ou a confirmação de cancelamento. Sem reservas, o vazio leva para "Todas". No fim
 * (também no vazio), o link "Histórico" abre as aulas anteriores (`?aba=suas&ver=historico`).
 */
export function MyReservationsList({
  onReschedule,
  onCancel,
  onSeeAll,
  historyLinkRef,
}: {
  onReschedule: (item: ClientAgendaItem) => void;
  onCancel: (item: ClientAgendaItem) => void;
  onSeeAll: () => void;
  /** Ref do link do histórico: a página devolve o foco a ele quando o histórico fecha. */
  historyLinkRef?: Ref<HTMLAnchorElement>;
}) {
  const queryClient = useQueryClient();
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const reservationsQuery = useQuery({
    queryKey: ["my-reservations", "upcoming", ReservationStatus.CONFIRMED],
    queryFn: () => listMyReservations({ when: "upcoming", status: ReservationStatus.CONFIRMED }),
  });

  async function run(
    action: "reschedule" | "cancel",
    reservation: ReservationDetail,
    handler: (item: ClientAgendaItem) => void,
  ) {
    const occurrenceId = reservation.occurrence.id;
    setUnavailable(false);
    setPendingAction(`${action}:${reservation.id}`);
    try {
      handler(
        await queryClient.fetchQuery({
          queryKey: ["client-agenda", "item", occurrenceId],
          queryFn: () => getClientAgendaItem(occurrenceId),
        }),
      );
    } catch {
      setUnavailable(true);
    } finally {
      setPendingAction(null);
    }
  }

  const today = gymToday();
  const reservations = reservationsQuery.data;

  return (
    <section className="fb-agenda__section" aria-label="Suas reservas">
      <QueryBlockState
        className="fb-agenda__state"
        query={reservationsQuery}
        loading="Carregando…"
        error="Não foi possível carregar suas reservas."
        hasData={reservations !== undefined}
      />
      {unavailable && (
        <p role="alert" className="fb-agenda__notice">
          Esta aula não está mais disponível na agenda (foi cancelada ou já começou).
        </p>
      )}

      {reservations && reservations.length === 0 && (
        <EmptyState
          title="Você não tem aulas reservadas daqui para frente."
          action={
            <Button variant="primary" block onClick={onSeeAll}>
              Ver todas as aulas
            </Button>
          }
        />
      )}

      {reservations &&
        groupByDay(reservations).map(([date, dayReservations]) => (
          <div key={date} className="fb-agenda__day">
            <h2 className="fb-agenda__day-title">{formatReservationDayHeading(date, today)}</h2>
            <ul className="fb-agenda__list">
              {dayReservations.map((reservation) => {
                const { occurrence } = reservation;
                const moment = `${occurrence.name}, ${formatClassMoment(occurrence.startsAt)}`;
                return (
                  <li key={reservation.id} className="fb-agenda__resv">
                    <ClassItem
                      time={formatInstantHour(occurrence.startsAt)}
                      timeNote={`${occurrence.durationMinutes} min`}
                      title={occurrence.name}
                      instructor={
                        occurrence.instructor
                          ? `Prof. ${firstName(occurrence.instructor.fullName)}`
                          : undefined
                      }
                      end={null}
                    />
                    <div className="fb-agenda__resv-actions">
                      <Button
                        size="sm"
                        aria-label={`Remarcar ${moment}`}
                        busy={pendingAction === `reschedule:${reservation.id}`}
                        onClick={() => run("reschedule", reservation, onReschedule)}
                      >
                        Remarcar
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        aria-label={`Cancelar ${moment}`}
                        busy={pendingAction === `cancel:${reservation.id}`}
                        onClick={() => run("cancel", reservation, onCancel)}
                      >
                        Cancelar
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}

      <HistoryLink linkRef={historyLinkRef} />
    </section>
  );
}

/** "1 aula anterior" / "N aulas anteriores". */
function previousClassesText(count: number): string {
  return count === 1 ? "1 aula anterior" : `${count} aulas anteriores`;
}

/**
 * Link do histórico, com a contagem das aulas anteriores. A contagem vem da mesma consulta do histórico (mesma
 * chave de cache, sem filtro de estado); enquanto ela carrega ou se falha, o link mostra só "Histórico".
 */
function HistoryLink({ linkRef }: { linkRef?: Ref<HTMLAnchorElement> }) {
  const pastQuery = useQuery({
    queryKey: ["my-reservations", "past", "all"],
    queryFn: () => listMyReservations({ when: "past" }),
  });
  const count = pastQuery.data ? previousClassesText(pastQuery.data.length) : null;
  return (
    <Link
      ref={linkRef}
      to={{ search: HISTORY_SEARCH }}
      className="fb-agenda__link-row"
      aria-label={count ? `Histórico · ${count}` : undefined}
    >
      <span>
        Histórico
        {count && <small>{count}</small>}
      </span>
      <span aria-hidden="true">→</span>
    </Link>
  );
}
