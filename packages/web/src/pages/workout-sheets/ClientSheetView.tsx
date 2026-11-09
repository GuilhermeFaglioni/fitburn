import { type WorkoutExercise, type WorkoutSheet } from "@fitburn/contracts";
import { formatInstantDate } from "../../lib/agenda/format";
import { firstName } from "../../lib/names";
import { Badge } from "../../components/ui/Badge";
import { Card } from "../../components/ui/Card";
import { EmptyState } from "../../components/ui/States";
import { STATUS_TONE, statusBadge } from "./status";

/** Os campos de um exercício, na ordem da tela de referência; os que o professor não preencheu ficam de fora. */
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
    <Card as="li" className="fb-workout__exercise">
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
    </Card>
  );
}

/**
 * Uma ficha de treino do cliente por inteiro (D-038): título da tela (`showPageTitle`), nome e status da ficha,
 * quem montou e desde quando, os cartões de exercício (uma coluna no celular, duas no desktop) e, no fim, a
 * observação geral. Somente leitura. A tela é extrapolada da base (não há desenho dela na proposta).
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
          <Badge tone={STATUS_TONE[sheet.status]} dot={sheet.status === "ACTIVE"}>
            {statusBadge(sheet.status)}
          </Badge>
        </div>
        <span className="fb-workout__meta">
          Montada por {firstName(sheet.authorName)} · desde {formatInstantDate(sheet.createdAt)}
        </span>
      </header>

      {sheet.exercises.length === 0 ? (
        <EmptyState title="Esta ficha ainda não tem exercícios." />
      ) : (
        <ul className="fb-workout__exercises" aria-label="Exercícios">
          {sheet.exercises.map((exercise) => (
            <ExerciseCard key={exercise.id} exercise={exercise} />
          ))}
        </ul>
      )}

      {/* A proposta não tem lugar para a observação geral; fica discreta, depois dos exercícios. */}
      {sheet.notes && <p className="fb-workout__notes">{sheet.notes}</p>}
    </>
  );
}
