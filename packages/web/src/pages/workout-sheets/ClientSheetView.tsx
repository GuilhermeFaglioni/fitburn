import { WorkoutSheetStatus, type WorkoutExercise, type WorkoutSheet } from "@fitburn/contracts";
import { formatInstantDate } from "../../lib/agenda/format";
import { statusBadge } from "./status";
import { EmptyState } from "../../components/states";

/** Os campos de um exercício, na ordem do artboard; os que o professor não preencheu ficam de fora. */
const CHIPS: Array<{ field: "sets" | "reps" | "load" | "duration" | "distance"; label: string }> = [
  { field: "sets", label: "Séries" },
  { field: "reps", label: "Repetições" },
  { field: "load", label: "Carga" },
  { field: "duration", label: "Tempo" },
  { field: "distance", label: "Distância" },
];

/** "Rafael Andrade" -> "Prof. Rafael" (o artboard cita só o primeiro nome do professor). */
function professorLabel(authorName: string): string {
  const first = authorName.trim().split(/\s+/)[0] ?? "";
  return first ? `Prof. ${first}` : "";
}

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
 * Uma ficha de treino do cliente por inteiro (FichaTreinoDesktop.dc.html /
 * FichaTreinoMobile.dc.html): título da tela (`showPageTitle`), nome e status
 * da ficha, quem montou e desde quando, e os cartões de exercício, em uma
 * coluna no celular e duas no desktop. Somente leitura.
 */
export function ClientSheetView({
  sheet,
  showPageTitle,
}: {
  sheet: WorkoutSheet;
  showPageTitle: boolean;
}) {
  return (
    <>
      <header className="fb-workout__header">
        {showPageTitle && <h1 className="fb-workout__title">Ficha de treino</h1>}
        <div className="fb-workout__title-row">
          <h2 className="fb-workout__sheet-title">{sheet.title}</h2>
          <span
            className={`fb-workout__badge${
              sheet.status === WorkoutSheetStatus.ACTIVE ? "" : " fb-workout__badge--closed"
            }`}
          >
            {statusBadge(sheet.status)}
          </span>
        </div>
        <span className="fb-workout__meta">
          Montada por {professorLabel(sheet.authorName)} · desde{" "}
          {formatInstantDate(sheet.createdAt)}
        </span>
      </header>

      {sheet.exercises.length === 0 ? (
        <EmptyState surface="dark" message="Esta ficha ainda não tem exercícios." />
      ) : (
        <ul className="fb-workout__exercises" aria-label="Exercícios">
          {sheet.exercises.map((exercise) => (
            <ExerciseCard key={exercise.id} exercise={exercise} />
          ))}
        </ul>
      )}

      {/* O artboard não tem lugar para a observação geral; fica discreta, depois dos exercícios. */}
      {sheet.notes && <p className="fb-workout__notes">{sheet.notes}</p>}
    </>
  );
}
