import { useQuery } from "@tanstack/react-query";
import {
  ReservationStatus,
  type ClientDetail,
  type MyReservationsQuery,
  type ReservationDetail,
  type ReservationStatusName,
  type WorkoutExercise,
} from "@fitburn/contracts";
import {
  formatClassDay,
  formatInstantDate,
  formatInstantHour,
  formatLocalDate,
} from "../../lib/agenda/format";
import {
  getClientGamification,
  getClientPlan,
  listClientReservations,
  listClientWorkoutSheets,
} from "../../lib/clients/api";
import { describeEntry, formatHistoryWhen, formatPoints } from "../../lib/gamification/format";
import { PlanHistoryList } from "../plans/PlanHistoryList";
import { statusBadge } from "../workout-sheets/status";

const EMPTY = "—";

function LoadError({ children }: { children: string }) {
  return (
    <p role="alert" className="fb-error-box">
      {children}
    </p>
  );
}

/** Dados pessoais e situação do cliente. */
export function ClientDataTab({ client }: { client: ClientDetail }) {
  const rows: Array<[string, string]> = [
    ["Nome completo", client.fullName],
    ["E-mail", client.email],
    ["Telefone", client.phone ?? EMPTY],
    ["Data de nascimento", client.birthDate ? formatLocalDate(client.birthDate) : EMPTY],
    ["Documento", client.document ?? EMPTY],
    ["Endereço", client.address ?? EMPTY],
    ["Plano ativo", client.activePlan?.name ?? "Sem plano ativo"],
    ["Cliente desde", formatInstantDate(client.createdAt)],
  ];
  return (
    <dl className="fb-client-data">
      {rows.map(([label, value]) => (
        <div key={label} className="fb-client-data__item">
          <dt>{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Plano ativo e histórico de planos. */
export function ClientPlanTab({ clientId }: { clientId: string }) {
  const planQuery = useQuery({
    queryKey: ["clients", clientId, "plan"],
    queryFn: () => getClientPlan(clientId),
  });
  if (planQuery.isError) return <LoadError>Não foi possível carregar o plano.</LoadError>;
  if (!planQuery.data) return <p className="fb-note">Carregando…</p>;

  const { active, history } = planQuery.data;
  return (
    <div className="fb-client-tab">
      <section aria-label="Plano ativo" className="fb-client-card">
        <h2 className="fb-client-card__title">Plano ativo</h2>
        {active ? (
          <>
            <span className="fb-client-card__value">{active.plan.name}</span>
            <span className="fb-note">
              {formatLocalDate(active.startDate)} – {formatLocalDate(active.endDate)}
            </span>
          </>
        ) : (
          <span className="fb-note">Sem plano ativo.</span>
        )}
      </section>
      <section aria-labelledby="client-plan-history" className="fb-client-section">
        <h2 id="client-plan-history" className="fb-client-card__title">
          Histórico de planos
        </h2>
        {history.length > 0 ? (
          <PlanHistoryList items={history} light />
        ) : (
          <span className="fb-note">Nenhum plano anterior.</span>
        )}
      </section>
    </div>
  );
}

const RESERVATION_BADGE: Record<ReservationStatusName, { label: string; className: string }> = {
  [ReservationStatus.CONFIRMED]: { label: "CONFIRMADA", className: "fb-badge--active" },
  [ReservationStatus.CANCELLED]: { label: "CANCELADA", className: "fb-badge--inactive" },
  [ReservationStatus.COMPLETED]: { label: "CONCLUÍDA", className: "fb-badge--neutral" },
  [ReservationStatus.NO_SHOW]: { label: "NÃO COMPARECEU", className: "fb-badge--accent" },
};

const RESERVATION_SECTIONS: Array<{
  when: MyReservationsQuery["when"];
  title: string;
  empty: string;
}> = [
  { when: "upcoming", title: "Próximas reservas", empty: "Nenhuma reserva próxima." },
  { when: "past", title: "Reservas anteriores", empty: "Nenhuma reserva anterior." },
];

/**
 * Reservas do cliente, próximas e anteriores. Ponto de extensão (#44): as
 * ações de reservar, cancelar e remarcar em nome do cliente entram nesta aba
 * (o título de cada seção e cada linha já comportam botões).
 */
export function ClientReservationsTab({ clientId }: { clientId: string }) {
  return (
    <div className="fb-client-tab">
      {RESERVATION_SECTIONS.map((section) => (
        <ReservationsSection key={section.when} clientId={clientId} {...section} />
      ))}
    </div>
  );
}

function ReservationsSection({
  clientId,
  when,
  title,
  empty,
}: {
  clientId: string;
  when: MyReservationsQuery["when"];
  title: string;
  empty: string;
}) {
  const query = useQuery({
    queryKey: ["clients", clientId, "reservations", when],
    queryFn: () => listClientReservations(clientId, { when }),
  });

  return (
    <section aria-label={title} className="fb-client-section">
      <h2 className="fb-client-card__title">{title}</h2>
      {query.isError && <LoadError>Não foi possível carregar as reservas.</LoadError>}
      {query.isLoading && <p className="fb-note">Carregando…</p>}
      {query.data &&
        (query.data.length === 0 ? (
          <span className="fb-note">{empty}</span>
        ) : (
          <ul className="fb-client-list">
            {query.data.map((reservation) => (
              <ReservationRow key={reservation.id} reservation={reservation} />
            ))}
          </ul>
        ))}
    </section>
  );
}

function ReservationRow({ reservation }: { reservation: ReservationDetail }) {
  const { occurrence } = reservation;
  const badge = RESERVATION_BADGE[reservation.status];
  const meta = [
    `${formatClassDay(occurrence.startsAt)} às ${formatInstantHour(occurrence.startsAt)}`,
    occurrence.modality.name,
    occurrence.instructor?.fullName,
  ].filter(Boolean);

  return (
    <li className="fb-client-list__item">
      <div className="fb-client-list__info">
        <span className="fb-client-list__title">{occurrence.name}</span>
        <span className="fb-note">{meta.join(" · ")}</span>
      </div>
      <span className={`fb-badge ${badge.className}`}>{badge.label}</span>
    </li>
  );
}

/** Pontos, streak, marcos e histórico recente do cliente. */
export function ClientGamificationTab({ clientId }: { clientId: string }) {
  const query = useQuery({
    queryKey: ["clients", clientId, "gamification"],
    queryFn: () => getClientGamification(clientId),
  });
  if (query.isError) return <LoadError>Não foi possível carregar a gamificação.</LoadError>;
  if (!query.data) return <p className="fb-note">Carregando…</p>;

  const { totalPoints, streak, badges, history } = query.data;
  return (
    <div className="fb-client-tab">
      <div className="fb-client-stats">
        <section aria-label="Pontos" className="fb-client-card">
          <span className="fb-client-card__big">{totalPoints.toLocaleString("pt-BR")}</span>
          <span className="fb-note">pontos totais</span>
        </section>
        <section aria-label="Streak" className="fb-client-card">
          <span className="fb-client-card__big">{streak.current}</span>
          <span className="fb-note">{streak.current} dias seguidos</span>
          <span className="fb-note">
            {streak.next
              ? `Próximo marco: ${streak.next.threshold} dias (+${streak.next.bonusPoints} pontos)`
              : "Todos os marcos atingidos."}
          </span>
        </section>
      </div>

      {badges.length > 0 && (
        <section aria-labelledby="client-badges" className="fb-client-section">
          <h2 id="client-badges" className="fb-client-card__title">
            Conquistas
          </h2>
          <ul className="fb-client-badges">
            {badges.map(({ milestone, earned, awardedAt }) => (
              <li
                key={milestone}
                aria-label={`Streak de ${milestone}, ${earned ? "conquistado" : "bloqueado"}`}
                className={`fb-badge ${earned ? "fb-badge--accent" : "fb-badge--inactive"}`}
              >
                {earned && awardedAt
                  ? `Streak de ${milestone} · ${formatInstantDate(awardedAt)}`
                  : `Streak de ${milestone}`}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby="client-points-history" className="fb-client-section">
        <h2 id="client-points-history" className="fb-client-card__title">
          Histórico recente
        </h2>
        {history.length === 0 ? (
          <span className="fb-note">Nenhum ganho de pontos ainda.</span>
        ) : (
          <ul className="fb-client-list">
            {history.map((item) => (
              <li key={item.id} className="fb-client-list__item">
                <div className="fb-client-list__info">
                  <span className="fb-client-list__title">{describeEntry(item)}</span>
                  <span className="fb-note">{formatHistoryWhen(item.occurredAt)}</span>
                </div>
                <span
                  className={`fb-client-list__points${item.points < 0 ? " fb-client-list__points--negative" : ""}`}
                >
                  {formatPoints(item.points)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function exerciseDetail(exercise: WorkoutExercise): string {
  const setsAndReps = [exercise.sets, exercise.reps].filter(Boolean).join(" × ");
  return [setsAndReps, exercise.load, exercise.duration, exercise.distance]
    .filter(Boolean)
    .join(" · ");
}

/** Fichas de treino do cliente (só leitura: quem as edita é o professor, em Fichas de treino). */
export function ClientSheetsTab({ clientId }: { clientId: string }) {
  const query = useQuery({
    queryKey: ["clients", clientId, "workout-sheets"],
    queryFn: () => listClientWorkoutSheets(clientId),
  });
  if (query.isError) return <LoadError>Não foi possível carregar as fichas.</LoadError>;
  if (!query.data) return <p className="fb-note">Carregando…</p>;
  if (query.data.length === 0) {
    return <span className="fb-note">Nenhuma ficha de treino para este cliente.</span>;
  }

  return (
    <ul className="fb-client-list fb-client-list--cards">
      {query.data.map((sheet) => (
        <li key={sheet.id} className="fb-client-list__item fb-client-list__item--stacked">
          <div className="fb-client-list__row">
            <div className="fb-client-list__info">
              <span className="fb-client-list__title">{sheet.title}</span>
              <span className="fb-note">
                Montada por {sheet.authorName} · atualizada em {formatInstantDate(sheet.updatedAt)}
              </span>
            </div>
            <span className="fb-badge fb-badge--neutral">{statusBadge(sheet.status)}</span>
          </div>
          {sheet.notes && <p className="fb-modal__text">{sheet.notes}</p>}
          {sheet.exercises.length > 0 && (
            <ol className="fb-client-exercises">
              {sheet.exercises.map((exercise) => (
                <li key={exercise.id}>
                  <span className="fb-client-exercises__name">{exercise.name}</span>
                  <span className="fb-note">{exerciseDetail(exercise)}</span>
                </li>
              ))}
            </ol>
          )}
        </li>
      ))}
    </ul>
  );
}
