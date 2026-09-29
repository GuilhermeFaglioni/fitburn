import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { WorkoutSheetStatus, type WorkoutExercise } from "@fitburn/contracts";
import { formatInstantDate } from "../lib/agenda/format";
import { errorMessage } from "../lib/auth/api";
import { getMyWorkoutSheet } from "../lib/workout-sheets/api";
import { statusBadge } from "./workout-sheets/status";

/** Os campos de um exercício, na ordem do artboard; os que o professor não preencheu ficam de fora. */
const CHIPS: Array<{ field: "sets" | "reps" | "load" | "duration" | "distance"; label: string }> = [
  { field: "sets", label: "Séries" },
  { field: "reps", label: "Repetições" },
  { field: "load", label: "Carga" },
  { field: "duration", label: "Tempo" },
  { field: "distance", label: "Distância" },
];

function ExerciseCard({ exercise }: { exercise: WorkoutExercise }) {
  const chips = CHIPS.filter(({ field }) => exercise[field]);
  return (
    <li className="fb-workout__exercise">
      <h3 className="fb-workout__exercise-name">{exercise.name}</h3>
      {chips.length > 0 && (
        <div className="fb-workout__chips">
          {chips.map(({ field, label }) => (
            <div key={field} className="fb-workout__chip">
              <span className="fb-workout__chip-label">{label}</span>
              <span className="fb-workout__chip-value">{exercise[field]}</span>
            </div>
          ))}
        </div>
      )}
      {exercise.notes && (
        <p className="fb-workout__exercise-notes">Obs. do professor: {exercise.notes}</p>
      )}
    </li>
  );
}

/**
 * Uma ficha de treino do cliente (FichaTreinoDesktop.dc.html / FichaTreinoMobile.dc.html):
 * status, quem montou, as observações gerais e os cartões de exercício, em
 * uma coluna no celular e duas no desktop. Somente leitura.
 */
export function ClientWorkoutSheetPage() {
  const { id = "" } = useParams();
  const sheetQuery = useQuery({
    queryKey: ["workout-sheets", "mine", id],
    queryFn: () => getMyWorkoutSheet(id),
  });
  const sheet = sheetQuery.data;

  return (
    <div className="fb-workout">
      <Link to="/ficha-treino" className="fb-workout__back">
        ← Fichas de treino
      </Link>

      {sheetQuery.isError && (
        <p role="alert" className="fb-workout__alert">
          {errorMessage(sheetQuery.error, "Não foi possível carregar a ficha.")}
        </p>
      )}

      {sheet && (
        <>
          <header className="fb-workout__header">
            <div className="fb-workout__title-row">
              <h1 className="fb-workout__sheet-title">{sheet.title}</h1>
              <span
                className={`fb-workout__badge${
                  sheet.status === WorkoutSheetStatus.ACTIVE ? "" : " fb-workout__badge--closed"
                }`}
              >
                {statusBadge(sheet.status)}
              </span>
            </div>
            <span className="fb-workout__meta">
              Montada por {sheet.authorName} · desde {formatInstantDate(sheet.createdAt)}
            </span>
          </header>

          {sheet.notes && <p className="fb-workout__notes">{sheet.notes}</p>}

          {sheet.exercises.length === 0 ? (
            <div className="fb-workout__empty">Esta ficha ainda não tem exercícios.</div>
          ) : (
            <ul className="fb-workout__exercises" aria-label="Exercícios">
              {sheet.exercises.map((exercise) => (
                <ExerciseCard key={exercise.id} exercise={exercise} />
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
