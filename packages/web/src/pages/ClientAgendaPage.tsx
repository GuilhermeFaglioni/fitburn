import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  addDays,
  gymToday,
  startOfWeek,
  weekdayOf,
  type ClientAgendaItem,
} from "@fitburn/contracts";
import { listClientAgenda } from "../lib/agenda/client-api";
import { filterUpcoming, groupByHour } from "../lib/agenda/group-by-hour";
import {
  formatDayHeading,
  formatDayLabel,
  formatHour,
  formatClassMoment,
  formatWeekRange,
  formatWeekShort,
  WEEKDAYS_SHORT,
} from "../lib/agenda/format";
import { ClassDetailSheet, type Rescheduling } from "./client/ClassDetailSheet";
import { HourGroup } from "./client/HourGroup";
import { WeekCell } from "./client/WeekCell";
import { MyReservationsList } from "./client/MyReservationsList";
import { ReservationHistory } from "./client/ReservationHistory";
import { QueryBlockState } from "../components/QueryBlockState";
import { Button } from "../components/ui/Button";
import { Chip } from "../components/ui/Chip";
import { Pill } from "../components/ui/Pill";
import { Segmented } from "../components/ui/Segmented";
import { EmptyState } from "../components/ui/States";

type AgendaTab = "suas" | "todas";

/** Controle "Suas aulas | Todas"; a aba vive na URL (`?aba=todas`), e sem `aba` abre em Suas aulas. */
const AGENDA_TABS: Array<{ value: AgendaTab; label: string }> = [
  { value: "suas", label: "Suas aulas" },
  { value: "todas", label: "Todas" },
];

/** Navegação entre semanas: botões nas pontas e a semana no meio (como no preview). */
function WeekNav({
  weekStart,
  canGoBack,
  onGo,
}: {
  weekStart: string;
  canGoBack: boolean;
  onGo: (offset: number) => void;
}) {
  return (
    <div className="fb-agenda__weeknav" role="group" aria-label={`Semana de ${formatWeekRange(weekStart)}`}>
      <Button size="sm" aria-label="Semana anterior" disabled={!canGoBack} onClick={() => onGo(-1)}>
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

  const currentWeekStart = startOfWeek(today);
  const days = Array.from({ length: 7 }, (_, index) => addDays(weekStart, index));
  // Na semana atual os chips começam em hoje; semanas seguintes mostram os sete dias.
  const mobileDays = days.filter((date) => date >= today);

  // Modalidades que existem na semana (os filtros nascem dos dados); a escolhida some junto com a semana, e volta "Todas".
  const modalities = [
    ...new Map((agendaQuery.data ?? []).map((item) => [item.modality.id, item.modality.name])),
  ]
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  const activeModality = modalities.find((modality) => modality.id === modalityId) ?? null;

  // Só daqui para frente: aulas já iniciadas ficam de fora (as duas visões partilham esta lista) e o filtro de
  // modalidade age antes de qualquer agrupamento.
  const now = new Date();
  const visibleItems = filterUpcoming(agendaQuery.data ?? [], now).filter(
    (item) => !activeModality || item.modality.id === activeModality.id,
  );
  const hourGroups = groupByHour(visibleItems);
  // Grade: um bloco por (dia, horário). Os dias passados da semana atual ficam como colunas vazias.
  const cellGroups = new Map(hourGroups.map((group) => [`${group.date} ${group.time}`, group]));
  const sortedHours = [...new Set(hourGroups.map((group) => group.time))].sort();
  const dayGroups = hourGroups.filter((group) => group.date === selectedDay);

  function goToWeek(offset: number) {
    const next = addDays(weekStart, offset * 7);
    setWeekStart(next);
    setSelectedDay(next === startOfWeek(today) ? today : next);
  }

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

          <WeekNav weekStart={weekStart} canGoBack={weekStart > currentWeekStart} onGo={goToWeek} />

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
              {mobileDays.map((date) => (
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

            {agendaQuery.data && dayGroups.length === 0 && (
              <EmptyState title={`Nenhuma aula${filterNote} agendada para este dia.`} />
            )}

            {dayGroups.length > 0 && (
              <div className="fb-agenda__day">
                <h2 className="fb-agenda__day-title">
                  {formatDayHeading(selectedDay, weekdayOf(selectedDay), today)}
                </h2>
                <ul className="fb-agenda__list">
                  {dayGroups.map((group) => (
                    <li key={`${group.date} ${group.time}`}>
                      <HourGroup group={group} onOpenClass={openClass} />
                    </li>
                  ))}
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
                        {cellGroups.get(`${date} ${hour}`) && (
                          <WeekCell
                            group={cellGroups.get(`${date} ${hour}`)!}
                            weekday={weekdayOf(date)}
                            onOpenClass={openClass}
                          />
                        )}
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
