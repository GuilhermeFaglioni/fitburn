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
import { QueryBlockState } from "../components/QueryBlockState";
import { Button } from "../components/ui/Button";
import { EmptyState } from "../components/ui/States";
import { formatClassDay, formatInstantHour } from "../lib/agenda/format";
import { getAttendanceRoster } from "../lib/attendance/api";
import { ApiError } from "../lib/auth/api";
import { useAuth } from "../lib/auth/AuthContext";
import { listWorkoutSheets } from "../lib/workout-sheets/api";
import { ClientSheetView } from "./workout-sheets/ClientSheetView";
import { PreviousSheetItem } from "./workout-sheets/PreviousSheetItem";

function sheetsErrorMessage(error: unknown): string {
  if (error instanceof ApiError && error.code === ErrorCode.OUT_OF_SCOPE) {
    return "Este aluno está fora do seu escopo.";
  }
  return "Não foi possível carregar a ficha de treino.";
}

/**
 * Ficha de treino de um aluno, aberta a partir da lista de alunos de uma aula
 * (Presença). Somente leitura: mostra a ficha ativa e, abaixo, as anteriores,
 * no mesmo visual da ficha do próprio aluno.
 * Tela extrapolada da base (#156, D-038); a casca é a da Presença (tela cheia, sem a sidebar).
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
    <main id="conteudo" tabIndex={-1} className="fb-ui-att fb-ui-att--wide">
      <header className="fb-ui-att__head">
        <Button
          size="sm"
          className="fb-ui-btn--icon"
          aria-label="Voltar"
          onClick={() => navigate(`/presenca/${occurrenceId}`, { state: { from } })}
        >
          <BackIcon />
        </Button>
        <div className="fb-ui-att__heading">
          <h1 className="fb-ui-att__title">{studentName ?? "Ficha de treino"}</h1>
          <span className="fb-ui-att__subtitle">
            Ficha de treino
            {roster &&
              ` · ${roster.class.name}, ${formatClassDay(roster.class.startsAt)} ${formatInstantHour(roster.class.startsAt)}`}
          </span>
        </div>
      </header>

      <QueryBlockState
        query={sheetsQuery}
        hasData={sheetsQuery.data !== undefined}
        loading="Carregando a ficha de treino…"
        error={sheetsErrorMessage(sheetsQuery.error)}
      />

      {sheetsQuery.isSuccess && sheets.length === 0 && (
        <EmptyState title="Este aluno ainda não tem ficha de treino." />
      )}
      {sheetsQuery.isSuccess && sheets.length > 0 && shown.length === 0 && (
        <EmptyState title="Nenhuma ficha ativa no momento." />
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
                  <PreviousSheetItem
                    sheet={sheet}
                    to={`?ficha=${sheet.id}`}
                    state={{ from }}
                    replace
                  />
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </main>
  );
}
