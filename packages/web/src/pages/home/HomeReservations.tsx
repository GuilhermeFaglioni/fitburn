import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ReservationStatus, type ReservationDetail } from "@fitburn/contracts";
import { getClientAgendaItem } from "../../lib/agenda/client-api";
import { firstName } from "../../lib/names";
import { formatUpcomingMoment } from "./format";
import { errorMessage } from "../../lib/auth/api";
import { cancelReservation, listMyReservations } from "../../lib/reservations/api";
import { Feedback } from "../../components/states";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { RequiresNetwork } from "../../components/RequiresNetwork";
import { HomeBlockState, HomeEmpty } from "./HomeBlockState";

/** Quantas reservas cabem na Home. */
const MAX_RESERVATIONS = 3;

/**
 * "Próximas aulas" da Home: as próximas
 * reservas confirmadas, com atalho para a agenda e as ações Remarcar e
 * Cancelar. O cancelamento pede confirmação; remarcar abre a agenda já no
 * modo de remarcação, onde se escolhe a nova aula.
 */
export function HomeReservations() {
  const reservationsQuery = useQuery({
    queryKey: ["my-reservations", "upcoming", ReservationStatus.CONFIRMED],
    queryFn: () => listMyReservations({ when: "upcoming", status: ReservationStatus.CONFIRMED }),
  });
  const reservations = reservationsQuery.data?.slice(0, MAX_RESERVATIONS);

  return (
    <section className="fb-home__block" aria-label="Próximas aulas">
      <div className="fb-home__row">
        <h2 className="fb-home__title">Próximas aulas</h2>
        <Link to="/agenda" className="fb-home__link">
          Ver agenda completa<span aria-hidden="true"> →</span>
        </Link>
      </div>

      <HomeBlockState
        query={reservationsQuery}
        loading="Carregando suas aulas…"
        error="Não foi possível carregar suas reservas."
        hasData={reservations !== undefined}
      />

      {reservations &&
        (reservations.length === 0 ? (
          <HomeEmpty
            title="Você não tem aulas reservadas."
            action={
              <Link to="/agenda" className="fb-home__link">
                Reservar uma aula
              </Link>
            }
          />
        ) : (
          <ul className="fb-home__reservations">
            {reservations.map((reservation) => (
              <li key={reservation.id} className="fb-home__reservation">
                <HomeReservation reservation={reservation} />
              </li>
            ))}
          </ul>
        ))}
    </section>
  );
}

function HomeReservation({ reservation }: { reservation: ReservationDetail }) {
  const { occurrence } = reservation;
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cancelMutation = useMutation({
    mutationFn: () => cancelReservation(reservation.id),
    onError: (failure) =>
      setError(errorMessage(failure, "Não foi possível cancelar a reserva. Tente novamente.")),
    onSettled: () => {
      setConfirming(false);
      return Promise.all([
        queryClient.invalidateQueries({ queryKey: ["my-reservations"] }),
        queryClient.invalidateQueries({ queryKey: ["client-agenda"] }),
      ]);
    },
  });

  const rescheduleMutation = useMutation({
    mutationFn: () => getClientAgendaItem(occurrence.id),
    onSuccess: (from) =>
      navigate("/agenda", { state: { rescheduling: { reservationId: reservation.id, from } } }),
    onError: () =>
      setError("Esta aula não está mais disponível na agenda (foi cancelada ou já começou)."),
  });

  const pending = cancelMutation.isPending || rescheduleMutation.isPending;

  return (
    <>
      <div className="fb-home__reservation-info">
        <div className="fb-home__reservation-head">
          <span className="fb-home__reservation-title">{occurrence.name}</span>
          <Badge tone="ok" dot>
            Confirmada
          </Badge>
        </div>
        <span className="fb-home__reservation-when">
          {formatUpcomingMoment(occurrence.startsAt)}
          {occurrence.instructor ? ` · Prof. ${firstName(occurrence.instructor.fullName)}` : ""}
        </span>
      </div>

      {error && <Feedback tone="error">{error}</Feedback>}

      <div className="fb-home__reservation-actions">
        {confirming ? (
          <>
            <Button size="sm" variant="ghost" disabled={pending} onClick={() => setConfirming(false)}>
              Voltar
            </Button>
            <RequiresNetwork>
              <Button
                size="sm"
                variant="danger"
                disabled={pending}
                onClick={() => {
                  setError(null);
                  cancelMutation.mutate();
                }}
              >
                Confirmar cancelamento
              </Button>
            </RequiresNetwork>
          </>
        ) : (
          <>
            <RequiresNetwork>
              <Button
                size="sm"
                variant="secondary"
                disabled={pending}
                onClick={() => {
                  setError(null);
                  rescheduleMutation.mutate();
                }}
              >
                Remarcar
              </Button>
            </RequiresNetwork>
            <Button
              size="sm"
              variant="ghost"
              disabled={pending}
              onClick={() => {
                setError(null);
                setConfirming(true);
              }}
            >
              Cancelar
            </Button>
          </>
        )}
      </div>
    </>
  );
}
