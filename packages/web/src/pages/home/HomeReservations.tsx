import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ReservationStatus, type ReservationDetail } from "@fitburn/contracts";
import { getClientAgendaItem } from "../../lib/agenda/client-api";
import { formatClassDay, formatInstantHour } from "../../lib/agenda/format";
import { errorMessage } from "../../lib/auth/api";
import { cancelReservation, listMyReservations } from "../../lib/reservations/api";

/** Quantas reservas cabem na Home (HomeDesktop.dc.html mostra três). */
const MAX_RESERVATIONS = 3;

/**
 * "Próximas aulas" da Home (HomeMobile/HomeDesktop.dc.html): as próximas
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
          Ver agenda
        </Link>
      </div>

      {reservationsQuery.isError && (
        <p role="alert" className="fb-home__alert">
          Não foi possível carregar suas reservas.
        </p>
      )}

      {reservations &&
        (reservations.length === 0 ? (
          <div className="fb-client-empty">
            <p className="fb-home__empty-text">Você não tem aulas reservadas.</p>
            <Link to="/agenda" className="fb-home__link">
              Reservar uma aula
            </Link>
          </div>
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
        <span className="fb-home__reservation-title">{occurrence.name}</span>
        <span className="fb-home__reservation-when">
          {formatClassDay(occurrence.startsAt)}, {formatInstantHour(occurrence.startsAt)}
          {occurrence.instructor ? ` · Prof. ${occurrence.instructor.fullName}` : ""}
        </span>
      </div>

      {error && (
        <p role="alert" className="fb-home__alert">
          {error}
        </p>
      )}

      <div className="fb-home__reservation-actions">
        {confirming ? (
          <>
            <button
              type="button"
              className="fb-home__ghost-btn"
              disabled={pending}
              onClick={() => setConfirming(false)}
            >
              Voltar
            </button>
            <button
              type="button"
              className="fb-home__ghost-btn fb-home__ghost-btn--danger"
              disabled={pending}
              onClick={() => {
                setError(null);
                cancelMutation.mutate();
              }}
            >
              Confirmar cancelamento
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              className="fb-home__ghost-btn"
              disabled={pending}
              onClick={() => {
                setError(null);
                rescheduleMutation.mutate();
              }}
            >
              Remarcar
            </button>
            <button
              type="button"
              className="fb-home__ghost-btn"
              disabled={pending}
              onClick={() => {
                setError(null);
                setConfirming(true);
              }}
            >
              Cancelar
            </button>
          </>
        )}
      </div>
    </>
  );
}
