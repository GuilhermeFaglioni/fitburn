import { useQuery } from "@tanstack/react-query";
import { WorkoutSheetStatus } from "@fitburn/contracts";
import { listMyWorkoutSheets } from "../lib/workout-sheets/api";
import { ClientSheetView } from "./workout-sheets/ClientSheetView";
import { PreviousSheetItem } from "./workout-sheets/PreviousSheetItem";
import { QueryBlockState } from "../components/QueryBlockState";
import { EmptyState } from "../components/ui/States";

/**
 * Ficha de treino do cliente (D-038):
 * numa página só, a ficha ativa com os exercícios e, abaixo, "Fichas
 * anteriores" (concluídas e arquivadas), que abrem no detalhe. Somente leitura.
 * Carregando, sem conexão e erro vêm de `QueryBlockState` (`ui/States`).
 */
export function ClientWorkoutSheetsPage() {
  const sheetsQuery = useQuery({
    queryKey: ["workout-sheets", "mine"],
    queryFn: listMyWorkoutSheets,
  });
  const sheets = sheetsQuery.data ?? [];
  const active = sheets.filter((sheet) => sheet.status === WorkoutSheetStatus.ACTIVE);
  const previous = sheets.filter((sheet) => sheet.status !== WorkoutSheetStatus.ACTIVE);

  return (
    <div className="fb-workout">
      {active.length === 0 && <h1 className="fb-workout__title">Ficha de treino</h1>}

      <QueryBlockState
        query={sheetsQuery}
        loading="Carregando…"
        error="Não foi possível carregar as suas fichas."
        hasData={sheetsQuery.data !== undefined}
      />

      {sheetsQuery.isSuccess && sheets.length === 0 && (
        <EmptyState
          title="Você ainda não tem fichas de treino."
          description="Fale com o seu professor para receber a sua."
        />
      )}

      {sheetsQuery.isSuccess && sheets.length > 0 && active.length === 0 && (
        <EmptyState title="Nenhuma ficha ativa no momento." />
      )}

      {active.map((sheet, index) => (
        <ClientSheetView key={sheet.id} sheet={sheet} showPageTitle={index === 0} />
      ))}

      {previous.length > 0 && (
        <section className="fb-workout__section" aria-labelledby="fb-workout-previous">
          <h2 id="fb-workout-previous" className="fb-workout__section-title">
            Fichas anteriores
          </h2>
          <ul className="fb-workout__previous">
            {previous.map((sheet) => (
              <li key={sheet.id}>
                <PreviousSheetItem sheet={sheet} to={`/ficha-treino/${sheet.id}`} />
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
