import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AttendanceStatus,
  ErrorCode,
  Module,
  PermissionAction,
  type AttendanceEntry,
  type AttendanceMark,
  type AttendanceRoster,
} from "@fitburn/contracts";
import { BackIcon } from "../components/icons/BackIcon";
import { QueryBlockState } from "../components/QueryBlockState";
import { RequiresNetwork } from "../components/RequiresNetwork";
import { Alert } from "../components/ui/Alert";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { EmptyState } from "../components/ui/States";
import { ApiError } from "../lib/auth/api";
import { useAuth } from "../lib/auth/AuthContext";
import { getAttendanceRoster, markAttendance } from "../lib/attendance/api";
import { formatClassDay, formatInstantHour } from "../lib/agenda/format";
import { useNetworkRequired } from "../lib/connectivity/useNetworkRequired";

const NO_EXECUTE_REASON = "Você não tem permissão para registrar presença.";

/** Ícone da nota: traço e preenchimento na cor do texto (`currentColor`), então segue o tema. */
function InfoIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true" focusable="false">
      <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.3" />
      <path d="M8 7.2V11.2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      <circle cx="8" cy="5" r="0.9" fill="currentColor" />
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
 * Presença: o professor marca cada cliente com
 * reserva confirmada como presente ou faltou, com um toque; um toque no outro
 * botão corrige uma marcação errada (o servidor estorna os pontos e recalcula
 * streak e bônus). A linha muda na hora e o pedido segue em segundo plano —
 * não há botão "salvar" (cada toque já grava, como no desenho da tela), então
 * não existe marcação por salvar e nada se perde ao sair; enquanto o pedido de
 * uma linha não volta, o grupo dela fica `aria-busy`. Se o servidor recusar, a
 * linha volta ao que era e a tela explica o motivo. Sem conexão os botões ficam
 * desabilitados (RequiresNetwork) e o que está na tela continua lá.
 */
export function AttendancePage() {
  const { occurrenceId = "" } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  // De onde a pessoa veio (Agenda, Minhas aulas): o voltar devolve para lá.
  const from = (location.state as { from?: string } | null)?.from ?? "/minhas-aulas";
  const queryClient = useQueryClient();
  const { can } = useAuth();
  const canExecute = can(Module.PRESENCA, PermissionAction.EXECUTE);
  const canSeeSheets = can(Module.FICHAS_DE_TREINO, PermissionAction.VIEW);
  const rosterKey = ["attendance-roster", occurrenceId];
  const [failure, setFailure] = useState<string | null>(null);
  // Pedidos em andamento por linha (a contagem, porque dois toques seguidos na mesma linha geram dois pedidos).
  const [saving, setSaving] = useState<Record<string, number>>({});
  const { offline } = useNetworkRequired();

  function trackSaving(reservationId: string, delta: 1 | -1) {
    setSaving((current) => ({
      ...current,
      [reservationId]: Math.max(0, (current[reservationId] ?? 0) + delta),
    }));
  }

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
      trackSaving(entry.reservationId, 1);
      setEntry(entry.reservationId, (item) => ({ ...item, status }));
    },
    onSettled: (_data, _error, { entry }) => trackSaving(entry.reservationId, -1),
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
    if (canExecute && entry.status !== status) markMutation.mutate({ entry, status });
  }

  const entries = roster?.entries ?? [];
  const registered = entries.filter((entry) => entry.status !== AttendanceStatus.PENDING).length;

  return (
    <main id="conteudo" tabIndex={-1} className="fb-ui-att">
      <header className="fb-ui-att__head">
        <Button
          size="sm"
          className="fb-ui-btn--icon"
          aria-label="Voltar"
          onClick={() => navigate(from)}
        >
          <BackIcon />
        </Button>
        <div className="fb-ui-att__heading">
          <h1 className="fb-ui-att__title">Presença</h1>
          {roster && (
            <span className="fb-ui-att__subtitle">
              {roster.class.name} · {formatClassDay(roster.class.startsAt)},{" "}
              {formatInstantHour(roster.class.startsAt)}
            </span>
          )}
        </div>
      </header>

      <QueryBlockState
        query={rosterQuery}
        hasData={roster !== undefined}
        loading="Carregando a lista de presença…"
        error="Não foi possível carregar a lista de presença."
      />

      {roster && (
        <>
          <div className="fb-ui-att__progress">
            <span role="status" className="fb-ui-att__count">
              {registered} de {entries.length} registrados
            </span>
            <span className="fb-ui-att__hint">Toque para marcar</span>
          </div>

          <p className="fb-ui-att__note">
            <InfoIcon />
            <span>Somente o professor atribuído a esta aula pode registrar presença.</span>
          </p>

          {offline && (
            <p role="status" className="fb-ui-att__hint-card">
              Sem conexão: registrar presença volta a funcionar quando a rede voltar. As marcações já
              feitas continuam na tela.
            </p>
          )}

          {!started && (
            <p className="fb-ui-att__hint-card">
              A presença abre no início da aula, às {formatInstantHour(roster.class.startsAt)}.
            </p>
          )}

          {failure && <Alert>{failure}</Alert>}

          {entries.length === 0 ? (
            <EmptyState title="Nenhum cliente com reserva nesta aula." />
          ) : (
            <ul className="fb-ui-att__list">
              {entries.map((entry) => {
                const pending = entry.status === AttendanceStatus.PENDING;
                return (
                  <li key={entry.reservationId} className="fb-ui-att__row">
                    <div className="fb-ui-att__who">
                      {canSeeSheets ? (
                        <Link
                          className="fb-ui-att__name fb-ui-att__name--link"
                          to={`/presenca/${occurrenceId}/alunos/${entry.client.id}`}
                          state={{ from }}
                          aria-label={`Ficha de treino de ${entry.client.fullName}`}
                        >
                          {entry.client.fullName}
                          <span className="fb-ui-att__chevron" aria-hidden="true">
                            ›
                          </span>
                        </Link>
                      ) : (
                        <span className="fb-ui-att__name">{entry.client.fullName}</span>
                      )}
                      {pending && <Badge tone="warn">PENDENTE</Badge>}
                    </div>
                    {/* O grupo leva o nome do aluno; cada botão, o estado (aria-pressed). Dois bloqueios
                        independentes: sem EXECUTE o botão já nasce desabilitado, com o motivo no title, e o
                        RequiresNetwork só soma o bloqueio por rede (não reabilita). */}
                    <div
                      className="fb-ui-att__marks"
                      role="group"
                      aria-label={entry.client.fullName}
                      aria-busy={(saving[entry.reservationId] ?? 0) > 0 || undefined}
                    >
                      <RequiresNetwork>
                        <button
                          type="button"
                          className="fb-ui-att__mark fb-ui-att__mark--present"
                          aria-pressed={entry.status === AttendanceStatus.PRESENT}
                          disabled={!started || !canExecute}
                          aria-disabled={!canExecute ? true : undefined}
                          title={canExecute ? undefined : NO_EXECUTE_REASON}
                          onClick={() => mark(entry, AttendanceStatus.PRESENT)}
                        >
                          Presente
                        </button>
                      </RequiresNetwork>
                      <RequiresNetwork>
                        <button
                          type="button"
                          className="fb-ui-att__mark fb-ui-att__mark--absent"
                          aria-pressed={entry.status === AttendanceStatus.ABSENT}
                          disabled={!started || !canExecute}
                          aria-disabled={!canExecute ? true : undefined}
                          title={canExecute ? undefined : NO_EXECUTE_REASON}
                          onClick={() => mark(entry, AttendanceStatus.ABSENT)}
                        >
                          Faltou
                        </button>
                      </RequiresNetwork>
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
