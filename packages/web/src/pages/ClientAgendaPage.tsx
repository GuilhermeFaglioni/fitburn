import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  addDays,
  AvailabilityLevel,
  availabilityLevel,
  gymToday,
  startOfWeek,
  utcToGymDateTime,
  weekdayOf,
  type ClientAgendaItem,
} from "@fitburn/contracts";
import { listClientAgenda } from "../lib/agenda/client-api";
import {
  formatDayHeading,
  formatDayLabel,
  formatHour,
  formatClassMoment,
  formatInstantHour,
  formatWeekRange,
  formatWeekShort,
  WEEKDAYS_SHORT,
} from "../lib/agenda/format";
import { ClassDetailSheet, type Rescheduling } from "./client/ClassDetailSheet";
import { ClassItem } from "./client/ClassItem";
import { MyReservationsList } from "./client/MyReservationsList";
import { ReservationHistory } from "./client/ReservationHistory";
import { QueryBlockState } from "../components/QueryBlockState";
import { Badge, type BadgeTone } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { Chip } from "../components/ui/Chip";
import { Pill } from "../components/ui/Pill";
import { Segmented } from "../components/ui/Segmented";
import { EmptyState } from "../components/ui/States";
import { firstName } from "../lib/names";

type AgendaTab = "suas" | "todas";

/** Controle "Suas aulas | Todas"; a aba vive na URL (`?aba=todas`), e sem `aba` abre em Suas aulas. */
const AGENDA_TABS: Array<{ value: AgendaTab; label: string }> = [
  { value: "suas", label: "Suas aulas" },
  { value: "todas", label: "Todas" },
];

/** Selo de vagas: o texto diz o nível (lotada, quase lotada), então a cor é só reforço. */
function availabilityBadge(item: ClientAgendaItem): { tone: BadgeTone; text: string } {
  const ratio = `${item.available}/${item.capacity}`;
  switch (availabilityLevel(item.available, item.capacity)) {
    case AvailabilityLevel.FULL:
      return { tone: "err", text: `${ratio} vagas · lotada` };
    case AvailabilityLevel.ALMOST_FULL:
      return { tone: "warn", text: `${ratio} vagas · quase lotada` };
    default:
      return { tone: "brand", text: `${ratio} vagas` };
  }
}

/** Texto curto de vagas da grade do desktop (a célula é estreita). */
function availabilityChipText(item: ClientAgendaItem): string {
  const ratio = `${item.available}/${item.capacity}`;
  switch (availabilityLevel(item.available, item.capacity)) {
    case AvailabilityLevel.FULL:
      return `${ratio} · lotada`;
    case AvailabilityLevel.ALMOST_FULL:
      return `${ratio} · quase lotada`;
    default:
      return `${ratio} vagas`;
  }
}

const RESERVED_BADGE = (
  <Badge tone="ok" dot>
    Reservada
  </Badge>
);

/** Navegação entre semanas: botões nas pontas e a semana no meio (como no preview). */
function WeekNav({ weekStart, onGo }: { weekStart: string; onGo: (offset: number) => void }) {
  return (
    <div className="fb-agenda__weeknav" role="group" aria-label={`Semana de ${formatWeekRange(weekStart)}`}>
      <Button size="sm" aria-label="Semana anterior" onClick={() => onGo(-1)}>
        <span aria-hidden="true">←</span>
      </Button>
      <b className="fb-agenda__weeklabel">{formatWeekShort(weekStart)}</b>
      <Button size="sm" aria-label="Próxima semana" onClick={() => onGo(1)}>
        <span aria-hidden="true">→</span>
      </Button>
    </div>
  );
}

export function ClientAgendaPage() {
  const today = gymToday();
  const [weekStart, setWeekStart] = useState(() => startOfWeek(today));
  const [selectedDay, setSelectedDay] = useState(today);
  const [modalityId, setModalityId] = useState<string | null>(null);
  const [openItem, setOpenItem] = useState<ClientAgendaItem | null>(null);
  const [cancelling, setCancelling] = useState(false);
  // A Home leva à agenda já em remarcação (state.rescheduling).
  // O state é consumido uma vez e limpo, para não reabrir a remarcação em back/reload.
  const location = useLocation();
  const navigate = useNavigate();
  const [rescheduling, setRescheduling] = useState<Rescheduling | null>(
    () => (location.state as { rescheduling?: Rescheduling } | null)?.rescheduling ?? null,
  );
  const hasRouteRescheduling =
    (location.state as { rescheduling?: Rescheduling } | null)?.rescheduling !== undefined;

  // A aba vem da URL. A remarcação que chega da Home só acontece em Todas, então ela abre nessa aba.
  const [searchParams, setSearchParams] = useSearchParams();
  const tab: AgendaTab = searchParams.get("aba") === "todas" || hasRouteRescheduling ? "todas" : "suas";
  // `?aba=suas&ver=historico` abre o histórico dentro de Suas aulas. Trocar de aba limpa o `ver`, então
  // iniciar uma remarcação (que vai para Todas) nunca deixa o histórico preso na URL.
  const view: "lista" | "historico" =
    tab === "suas" && searchParams.get("ver") === "historico" ? "historico" : "lista";
  const setTab = (next: AgendaTab) => setSearchParams(next === "todas" ? { aba: "todas" } : {});

  // O foco acompanha a troca de visão: o histórico recebe o foco no título; ao voltar, o link que o abriu.
  // A troca é só de query string, então `useFocusOnNavigation` (por rota) não cobre.
  const historyHeadingRef = useRef<HTMLHeadingElement>(null);
  const historyLinkRef = useRef<HTMLAnchorElement>(null);
  const previousView = useRef(view);
  useEffect(() => {
    if (previousView.current === view) return;
    previousView.current = view;
    if (view === "historico") historyHeadingRef.current?.focus({ preventScroll: true });
    else historyLinkRef.current?.focus({ preventScroll: true });
  }, [view]);

  useEffect(() => {
    if (hasRouteRescheduling) navigate({ pathname: location.pathname, search: "?aba=todas" }, { replace: true });
  }, [hasRouteRescheduling, navigate, location.pathname]);

  /** Abre o detalhe da aula; `startCancelling` o abre direto na confirmação de cancelamento. */
  function openClass(item: ClientAgendaItem, startCancelling = false) {
    setCancelling(startCancelling);
    setOpenItem(item);
  }

  const weekEnd = addDays(weekStart, 6);
  const agendaQuery = useQuery({
    queryKey: ["client-agenda", weekStart],
    queryFn: () => listClientAgenda(weekStart, weekEnd),
    // Suas aulas não usa a agenda da semana: só busca quando a aba Todas está aberta.
    enabled: tab === "todas",
  });

  const days = Array.from({ length: 7 }, (_, index) => addDays(weekStart, index));

  // Modalidades que existem na semana (os filtros nascem dos dados); a escolhida some junto com a semana, e volta "Todas".
  const modalities = [
    ...new Map((agendaQuery.data ?? []).map((item) => [item.modality.id, item.modality.name])),
  ]
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  const activeModality = modalities.find((modality) => modality.id === modalityId) ?? null;

  const visibleItems = (agendaQuery.data ?? []).filter(
    (item) => !activeModality || item.modality.id === activeModality.id,
  );
  const byDay = new Map<string, ClientAgendaItem[]>();
  const hours = new Set<string>();
  for (const item of visibleItems) {
    const { date, time } = utcToGymDateTime(item.startsAt);
    byDay.set(date, [...(byDay.get(date) ?? []), item]);
    hours.add(time);
  }
  const sortedHours = [...hours].sort();

  function goToWeek(offset: number) {
    const next = addDays(weekStart, offset * 7);
    setWeekStart(next);
    setSelectedDay(next === startOfWeek(today) ? today : next);
  }

  const dayItems = byDay.get(selectedDay) ?? [];
  const filterNote = activeModality ? ` de ${activeModality.name}` : "";

  return (
    <div className="fb-agenda">
      <header className="fb-agenda__head">
        <div>
          <p className="fb-kicker fb-agenda__kicker">
            {tab === "todas"
              ? `Semana de ${formatWeekRange(weekStart)}`
              : view === "historico"
                ? "Suas aulas"
                : "Reservas"}
          </p>
          <h1 className="fb-agenda__title">Agenda</h1>
        </div>
        <Segmented
          label="Visão"
          className="fb-agenda__view"
          options={AGENDA_TABS}
          value={tab}
          onChange={setTab}
        />
      </header>

      {view === "historico" ? (
        <>
          <Link to={{ search: "" }} className="fb-agenda__back">
            <span aria-hidden="true">←</span> Suas aulas
          </Link>
          <h2 ref={historyHeadingRef} tabIndex={-1} className="fb-agenda__subtitle">
            Histórico
          </h2>
          <ReservationHistory onOpenClass={openClass} />
        </>
      ) : tab === "suas" ? (
        <MyReservationsList
          historyLinkRef={historyLinkRef}
          onReschedule={(item) => {
            if (!item.myReservationId) return;
            setRescheduling({ reservationId: item.myReservationId, from: item });
            setTab("todas");
          }}
          onCancel={(item) => openClass(item, true)}
          onSeeAll={() => setTab("todas")}
        />
      ) : (
        <>
          {rescheduling && (
            <div className="fb-agenda__banner" role="status">
              <span>
                Remarcando {rescheduling.from.name} ({formatClassMoment(rescheduling.from.startsAt)}
                ). Escolha a nova aula na agenda.
              </span>
              <Button variant="ghost" size="sm" onClick={() => setRescheduling(null)}>
                Desistir
              </Button>
            </div>
          )}

          <WeekNav weekStart={weekStart} onGo={goToWeek} />

          {modalities.length > 1 && (
            <div className="fb-agenda__scroller" role="group" aria-label="Modalidade">
              <Pill pressed={activeModality === null} onClick={() => setModalityId(null)}>
                Todas
              </Pill>
              {modalities.map((modality) => (
                <Pill
                  key={modality.id}
                  pressed={activeModality?.id === modality.id}
                  onClick={() => setModalityId(modality.id)}
                >
                  {modality.name}
                </Pill>
              ))}
            </div>
          )}

          <QueryBlockState
            className="fb-agenda__state"
            query={agendaQuery}
            loading="Carregando…"
            error="Não foi possível carregar a agenda."
            hasData={agendaQuery.data !== undefined}
          />

          <section className="fb-agenda__mobile" aria-label="Aulas do dia">
            <div className="fb-agenda__scroller" role="group" aria-label="Dia">
              {days.map((date) => (
                <Chip
                  key={date}
                  label={WEEKDAYS_SHORT[weekdayOf(date)]}
                  value={String(Number(date.slice(8)))}
                  aria-label={formatDayLabel(date, weekdayOf(date))}
                  pressed={date === selectedDay}
                  onClick={() => setSelectedDay(date)}
                />
              ))}
            </div>

            {agendaQuery.data && dayItems.length === 0 && (
              <EmptyState title={`Nenhuma aula${filterNote} agendada para este dia.`} />
            )}

            {dayItems.length > 0 && (
              <div className="fb-agenda__day">
                <h2 className="fb-agenda__day-title">
                  {formatDayHeading(selectedDay, weekdayOf(selectedDay), today)}
                </h2>
                <ul className="fb-agenda__list">
                  {dayItems.map((item) => {
                    const badge = availabilityBadge(item);
                    return (
                      <li key={item.id}>
                        <ClassItem
                          time={formatInstantHour(item.startsAt)}
                          timeNote={`${item.durationMinutes} min`}
                          title={item.modality.name}
                          instructor={
                            item.instructor ? `Prof. ${firstName(item.instructor.fullName)}` : undefined
                          }
                          booked={Boolean(item.myReservationId)}
                          end={
                            item.myReservationId ? (
                              RESERVED_BADGE
                            ) : (
                              <Badge tone={badge.tone}>{badge.text}</Badge>
                            )
                          }
                          onClick={() => openClass(item)}
                        />
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
          </section>

          <section className="fb-agenda__desktop" aria-label="Grade da semana">
            {agendaQuery.data && visibleItems.length === 0 ? (
              <EmptyState title={`Nenhuma aula${filterNote} agendada para esta semana.`} />
            ) : (
              <div className="fb-agenda__grid">
                <div className="fb-agenda__cell fb-agenda__cell--head" />
                {days.map((date) => (
                  <div
                    key={date}
                    className={`fb-agenda__cell fb-agenda__cell--head${date === today ? " fb-agenda__cell--today" : ""}`}
                  >
                    <span className="fb-agenda__weekday">{WEEKDAYS_SHORT[weekdayOf(date)]}</span>
                    <span className="fb-agenda__daynum">{Number(date.slice(8))}</span>
                  </div>
                ))}
                {sortedHours.map((hour) => (
                  <div key={hour} className="fb-agenda__row">
                    <div className="fb-agenda__cell">
                      <span className="fb-agenda__hour">{formatHour(hour)}</span>
                    </div>
                    {days.map((date) => (
                      <div
                        key={date}
                        className={`fb-agenda__cell${date === today ? " fb-agenda__cell--today" : ""}`}
                      >
                        {(byDay.get(date) ?? [])
                          .filter((item) => utcToGymDateTime(item.startsAt).time === hour)
                          .map((item) => (
                            <button
                              key={item.id}
                              type="button"
                              className={`fb-agenda__slot${item.myReservationId ? " fb-agenda__slot--booked" : ""}`}
                              onClick={() => openClass(item)}
                            >
                              <span className="fb-agenda__slot-title">{item.modality.name}</span>
                              <span
                                className={`fb-agenda__slot-sub fb-agenda__slot-sub--${availabilityLevel(item.available, item.capacity)}`}
                              >
                                {availabilityChipText(item)}
                              </span>
                              {item.myReservationId && RESERVED_BADGE}
                            </button>
                          ))}
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </section>

          <p className="fb-agenda__note">
            Disponibilidade sujeita a confirmação no momento da reserva.
          </p>
        </>
      )}

      {openItem && (
        <ClassDetailSheet
          key={openItem.id}
          item={openItem}
          rescheduling={rescheduling}
          startCancelling={cancelling}
          onStartRescheduling={(next) => {
            setRescheduling(next);
            setOpenItem(null);
            setTab("todas");
          }}
          onRescheduled={() => setRescheduling(null)}
          onClose={() => {
            setOpenItem(null);
            setCancelling(false);
          }}
        />
      )}
    </div>
  );
}
