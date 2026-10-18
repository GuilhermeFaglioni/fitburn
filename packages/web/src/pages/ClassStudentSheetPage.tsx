import { Link, useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  ErrorCode,
  Module,
  PermissionAction,
  WorkoutSheetStatus,
  type WorkoutSheet,
} from "@fitburn/contracts";
import { BackIcon } from "../components/icons/BackIcon";
import { EmptyState, ErrorState, LoadingState } from "../components/states";
import { formatClassDay, formatInstantDate, formatInstantHour } from "../lib/agenda/format";
import { getAttendanceRoster } from "../lib/attendance/api";
import { ApiError } from "../lib/auth/api";
import { useAuth } from "../lib/auth/AuthContext";
import { listWorkoutSheets } from "../lib/workout-sheets/api";
import { ClientSheetView } from "./workout-sheets/ClientSheetView";
import { statusBadge } from "./workout-sheets/status";

function sheetsErrorMessage(error: unknown): string {
  if (error instanceof ApiError && error.code === ErrorCode.OUT_OF_SCOPE) {
    return "Este aluno está fora do seu escopo.";
  }
  return "Não foi possível carregar a ficha de treino.";
}

/**
 * Ficha de treino de um aluno, aberta a partir da lista de alunos de uma aula
 * (Presença). Somente leitura: mostra a ficha ativa e, abaixo, as anteriores,
 * no mesmo visual da ficha do próprio aluno (FichaTreinoDesktop/Mobile.dc.html).
 * Não há artboard para esta rota; a casca é a da Presença.
 */
export function ClassStudentSheetPage() {
  const { occurrenceId = "", clientId = "" } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from;
  const [searchParams] = useSearchParams();
  const { can } = useAuth();
  const canEdit = can(Module.FICHAS_DE_TREINO, PermissionAction.EDIT);

  // A lista da aula costuma já estar em cache (a pessoa vem dela) e dá o nome do aluno.
  const rosterQuery = useQuery({
    queryKey: ["attendance-roster", occurrenceId],
    queryFn: () => getAttendanceRoster(occurrenceId),
  });
  const sheetsQuery = useQuery({
    queryKey: ["workout-sheets", clientId],
    queryFn: () => listWorkoutSheets(clientId),
  });

  const roster = rosterQuery.data;
  const studentName = roster?.entries.find((entry) => entry.client.id === clientId)?.client
    .fullName;
  const sheets = sheetsQuery.data ?? [];
  const active = sheets.filter((sheet) => sheet.status === WorkoutSheetStatus.ACTIVE);
  const previous = sheets.filter((sheet) => sheet.status !== WorkoutSheetStatus.ACTIVE);
  const chosen = sheets.find((sheet) => sheet.id === searchParams.get("ficha"));
  const shown: WorkoutSheet[] = chosen ? [chosen] : active;

  return (
    <main id="conteudo" tabIndex={-1} className="fb-att fb-att--wide">
      <div className="fb-att__header">
        <button
          type="button"
          className="fb-back-btn"
          aria-label="Voltar"
          onClick={() => navigate(`/presenca/${occurrenceId}`, { state: { from } })}
        >
          <BackIcon />
        </button>
        <div className="fb-att__heading">
          <h1 className="fb-att__title">{studentName ?? "Ficha de treino"}</h1>
          <span className="fb-att__subtitle">
            Ficha de treino
            {roster &&
              ` · ${roster.class.name}, ${formatClassDay(roster.class.startsAt)} ${formatInstantHour(roster.class.startsAt)}`}
          </span>
        </div>
      </div>

      {sheetsQuery.isLoading && <LoadingState surface="dark" />}
      {sheetsQuery.isError && (
        <ErrorState
          surface="dark"
          message={sheetsErrorMessage(sheetsQuery.error)}
          onRetry={() => void sheetsQuery.refetch()}
        />
      )}

      {sheetsQuery.isSuccess && sheets.length === 0 && (
        <EmptyState surface="dark" message="Este aluno ainda não tem ficha de treino." />
      )}
      {sheetsQuery.isSuccess && sheets.length > 0 && shown.length === 0 && (
        <EmptyState surface="dark" message="Nenhuma ficha ativa no momento." />
      )}

      <div className="fb-workout">
        {chosen && (
          <Link
            to={`/presenca/${occurrenceId}/alunos/${clientId}`}
            state={{ from }}
            replace
            className="fb-workout__back"
          >
            ← Ficha ativa
          </Link>
        )}

        {shown.map((sheet) => (
          <ClientSheetView key={sheet.id} sheet={sheet} showPageTitle={false} />
        ))}

        {sheetsQuery.isSuccess && canEdit && (
          <Link to={`/fichas?cliente=${clientId}`} className="fb-workout__back">
            Editar ficha
          </Link>
        )}

        {previous.length > 0 && (
          <section className="fb-workout__section" aria-labelledby="fb-class-student-previous">
            <h2 id="fb-class-student-previous" className="fb-workout__section-title">
              Fichas anteriores
            </h2>
            <ul className="fb-workout__previous">
              {previous.map((sheet) => (
                <li key={sheet.id}>
                  <Link
                    to={`?ficha=${sheet.id}`}
                    state={{ from }}
                    replace
                    className={`fb-workout__row${
                      sheet.status === WorkoutSheetStatus.ARCHIVED
                        ? " fb-workout__row--archived"
                        : ""
                    }`}
                  >
                    <span className="fb-workout__row-text">
                      <span className="fb-workout__row-title">{sheet.title}</span>
                      <span className="fb-workout__row-date">
                        {formatInstantDate(sheet.createdAt)}
                      </span>
                    </span>
                    <span className="fb-workout__row-status">{statusBadge(sheet.status)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </main>
  );
}
