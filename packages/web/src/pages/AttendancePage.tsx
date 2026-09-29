import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AttendanceStatus,
  ErrorCode,
  type AttendanceEntry,
  type AttendanceMark,
  type AttendanceRoster,
} from "@fitburn/contracts";
import { ApiError } from "../lib/auth/api";
import { getAttendanceRoster, markAttendance } from "../lib/attendance/api";
import { formatClassDay, formatInstantHour } from "../lib/agenda/format";

function BackIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
      <path
        d="M11 3.5L5 9L11 14.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function InfoIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle cx="8" cy="8" r="7" stroke="rgba(255,255,255,0.35)" strokeWidth="1.3" />
      <path
        d="M8 7.2V11.2"
        stroke="rgba(255,255,255,0.35)"
        strokeWidth="1.3"
        strokeLinecap="round"
      />
      <circle cx="8" cy="5" r="0.9" fill="rgba(255,255,255,0.35)" />
    </svg>
  );
}

/**
 * A aula já começou? Reavalia enquanto a tela está aberta, para a presença
 * abrir sem recarregar: agenda uma nova checagem para o início da aula, no
 * máximo a cada minuto (o limite de setTimeout não aguenta aulas distantes).
 */
function useHasStarted(startsAt: string | undefined): boolean {
  const [now, setNow] = useState(() => Date.now());
  const startTime = startsAt ? Date.parse(startsAt) : undefined;
  const started = startTime !== undefined && startTime <= now;

  useEffect(() => {
    if (startTime === undefined || started) return;
    const timer = setTimeout(() => setNow(Date.now()), Math.min(startTime - now, 60_000));
    return () => clearTimeout(timer);
  }, [startTime, started, now]);

  return started;
}

function failureMessage(error: unknown, entry: AttendanceEntry): string {
  const name = entry.client.fullName;
  if (error instanceof ApiError) {
    if (error.code === ErrorCode.RESERVATION_NOT_ATTENDABLE) {
      return `A presença de ${name} já foi registrada ou a reserva foi cancelada.`;
    }
    if (error.code === ErrorCode.ATTENDANCE_NOT_OPEN) {
      return "A presença só abre a partir do início da aula.";
    }
    if (error.code === ErrorCode.OUT_OF_SCOPE || error.code === ErrorCode.FORBIDDEN) {
      return "Você não pode registrar presença nesta aula.";
    }
  }
  return `Não foi possível registrar a presença de ${name}. Tente novamente.`;
}

interface MarkVariables {
  entry: AttendanceEntry;
  status: AttendanceMark;
}

/**
 * Presença (PresencaMobile.dc.html): o professor marca cada cliente com
 * reserva confirmada como presente ou faltou, com um toque. A linha muda na
 * hora e o pedido segue em segundo plano — não há botão "salvar"; se o
 * servidor recusar, a linha volta a pendente e a tela explica o motivo.
 */
export function AttendancePage() {
  const { occurrenceId = "" } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const rosterKey = ["attendance-roster", occurrenceId];
  const [failure, setFailure] = useState<string | null>(null);

  const rosterQuery = useQuery({
    queryKey: rosterKey,
    queryFn: () => getAttendanceRoster(occurrenceId),
  });
  const roster = rosterQuery.data;
  const started = useHasStarted(roster?.class.startsAt);

  function setEntry(reservationId: string, update: (entry: AttendanceEntry) => AttendanceEntry) {
    queryClient.setQueryData<AttendanceRoster>(
      rosterKey,
      (current) =>
        current && {
          ...current,
          entries: current.entries.map((item) =>
            item.reservationId === reservationId ? update(item) : item,
          ),
        },
    );
  }

  const markMutation = useMutation({
    mutationFn: ({ entry, status }: MarkVariables) => markAttendance(entry.reservationId, status),
    onMutate: ({ entry, status }) => {
      setFailure(null);
      setEntry(entry.reservationId, (item) => ({ ...item, status }));
    },
    onSuccess: (saved) => {
      setEntry(saved.reservationId, () => saved);
      void queryClient.invalidateQueries({ queryKey: ["attendance-classes"] });
    },
    onError: (error, { entry }) => {
      setEntry(entry.reservationId, (item) => ({ ...item, status: AttendanceStatus.PENDING }));
      setFailure(failureMessage(error, entry));
      // A recusa costuma significar que a lista mudou (outra pessoa registrou, reserva cancelada).
      void queryClient.invalidateQueries({ queryKey: rosterKey });
    },
  });

  const entries = roster?.entries ?? [];
  const registered = entries.filter((entry) => entry.status !== AttendanceStatus.PENDING).length;

  return (
    <div className="fb-att">
      <div className="fb-att__header">
        <button
          type="button"
          className="fb-att__back"
          aria-label="Voltar"
          onClick={() => navigate("/minhas-aulas")}
        >
          <BackIcon />
        </button>
        <div className="fb-att__heading">
          <h1 className="fb-att__title">Presença</h1>
          {roster && (
            <span className="fb-att__subtitle">
              {roster.class.name} · {formatClassDay(roster.class.startsAt)},{" "}
              {formatInstantHour(roster.class.startsAt)}
            </span>
          )}
        </div>
      </div>

      {rosterQuery.isError && (
        <p role="alert" className="fb-att__alert">
          Não foi possível carregar a lista de presença.
        </p>
      )}

      {roster && (
        <>
          <div className="fb-att__progress">
            <span className="fb-att__progress-count">
              {registered} de {entries.length} registrados
            </span>
            <span className="fb-att__progress-hint">Toque para marcar</span>
          </div>

          <div className="fb-att__note">
            <InfoIcon />
            <span className="fb-att__note-text">
              Somente o professor atribuído a esta aula pode registrar presença.
            </span>
          </div>

          {!started && (
            <p className="fb-att__notice">
              A presença abre no início da aula, às {formatInstantHour(roster.class.startsAt)}.
            </p>
          )}

          {failure && (
            <p role="alert" className="fb-att__alert">
              {failure}
            </p>
          )}

          {entries.length === 0 ? (
            <div className="fb-att__empty">Nenhum cliente com reserva nesta aula.</div>
          ) : (
            <ul className="fb-att__list">
              {entries.map((entry) => {
                const pending = entry.status === AttendanceStatus.PENDING;
                const locked = !started || !pending;
                return (
                  <li key={entry.reservationId} className="fb-att__row">
                    <div className="fb-att__who">
                      <span className="fb-att__name">{entry.client.fullName}</span>
                      {pending && <span className="fb-att__pending">PENDENTE</span>}
                    </div>
                    <div className="fb-att__marks" role="group" aria-label={entry.client.fullName}>
                      <button
                        type="button"
                        className="fb-seg-btn fb-seg-btn--present"
                        aria-pressed={entry.status === AttendanceStatus.PRESENT}
                        disabled={locked}
                        onClick={() =>
                          markMutation.mutate({ entry, status: AttendanceStatus.PRESENT })
                        }
                      >
                        Presente
                      </button>
                      <button
                        type="button"
                        className="fb-seg-btn fb-seg-btn--absent"
                        aria-pressed={entry.status === AttendanceStatus.ABSENT}
                        disabled={locked}
                        onClick={() =>
                          markMutation.mutate({ entry, status: AttendanceStatus.ABSENT })
                        }
                      >
                        Faltou
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
