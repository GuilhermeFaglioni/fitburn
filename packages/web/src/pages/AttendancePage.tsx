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
import { BackIcon } from "../components/icons/BackIcon";
import { ApiError } from "../lib/auth/api";
import { getAttendanceRoster, markAttendance } from "../lib/attendance/api";
import { formatClassDay, formatInstantHour } from "../lib/agenda/format";
import { EmptyState, ErrorState, Feedback, LoadingState } from "../components/states";

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
      return `A reserva de ${name} foi cancelada e não aceita presença.`;
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
 * reserva confirmada como presente ou faltou, com um toque; um toque no outro
 * botão corrige uma marcação errada (o servidor estorna os pontos e recalcula
 * streak e bônus). A linha muda na hora e o pedido segue em segundo plano —
 * não há botão "salvar"; se o servidor recusar, a linha volta ao que era e a
 * tela explica o motivo.
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
    // A linha já mostra a marcação (otimista): a resposta não a sobrescreve, para
    // uma resposta atrasada não desfazer um toque mais novo na mesma linha.
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["attendance-classes"] });
    },
    onError: (error, { entry }) => {
      // Volta à marcação anterior: pendente numa primeira marcação, a outra opção numa correção.
      setEntry(entry.reservationId, (item) => ({ ...item, status: entry.status }));
      setFailure(failureMessage(error, entry));
      // A recusa costuma significar que a lista mudou (outra pessoa registrou, reserva cancelada).
      void queryClient.invalidateQueries({ queryKey: rosterKey });
    },
  });

  /** Marca ou corrige; tocar no que já está marcado não muda nada. */
  function mark(entry: AttendanceEntry, status: AttendanceMark) {
    if (entry.status !== status) markMutation.mutate({ entry, status });
  }

  const entries = roster?.entries ?? [];
  const registered = entries.filter((entry) => entry.status !== AttendanceStatus.PENDING).length;

  return (
    <main id="conteudo" tabIndex={-1} className="fb-att">
      <div className="fb-att__header">
        <button
          type="button"
          className="fb-back-btn"
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

      {rosterQuery.isLoading && <LoadingState surface="dark" />}
      {rosterQuery.isError && (
        <ErrorState
          surface="dark"
          message="Não foi possível carregar a lista de presença."
          onRetry={() => void rosterQuery.refetch()}
        />
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
            <Feedback tone="error" surface="dark">
              {failure}
            </Feedback>
          )}

          {entries.length === 0 ? (
            <EmptyState surface="dark" message="Nenhum cliente com reserva nesta aula." />
          ) : (
            <ul className="fb-att__list">
              {entries.map((entry) => {
                const pending = entry.status === AttendanceStatus.PENDING;
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
                        disabled={!started}
                        onClick={() => mark(entry, AttendanceStatus.PRESENT)}
                      >
                        Presente
                      </button>
                      <button
                        type="button"
                        className="fb-seg-btn fb-seg-btn--absent"
                        aria-pressed={entry.status === AttendanceStatus.ABSENT}
                        disabled={!started}
                        onClick={() => mark(entry, AttendanceStatus.ABSENT)}
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
    </main>
  );
}
