import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { WorkoutSheetStatus } from "@fitburn/contracts";
import { formatInstantDate } from "../lib/agenda/format";
import { listMyWorkoutSheets } from "../lib/workout-sheets/api";
import { ClientSheetView } from "./workout-sheets/ClientSheetView";
import { statusBadge } from "./workout-sheets/status";
import { EmptyState, ErrorState, LoadingState } from "../components/states";

/**
 * Ficha de treino do cliente (FichaTreinoDesktop.dc.html / FichaTreinoMobile.dc.html):
 * numa página só, a ficha ativa com os exercícios e, abaixo, "Fichas
 * anteriores" (concluídas e arquivadas), que abrem no detalhe. Somente leitura.
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

      {sheetsQuery.isLoading && <LoadingState surface="dark" />}
      {sheetsQuery.isError && (
        <ErrorState
          surface="dark"
          message="Não foi possível carregar as suas fichas."
          onRetry={() => void sheetsQuery.refetch()}
        />
      )}

      {sheetsQuery.isSuccess && sheets.length === 0 && (
        <EmptyState
          surface="dark"
          message="Você ainda não tem fichas de treino. Fale com o seu professor para receber a sua."
        />
      )}

      {sheetsQuery.isSuccess && sheets.length > 0 && active.length === 0 && (
        <EmptyState surface="dark" message="Nenhuma ficha ativa no momento." />
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
                <Link
                  to={`/ficha-treino/${sheet.id}`}
                  className={`fb-workout__row${
                    sheet.status === WorkoutSheetStatus.ARCHIVED ? " fb-workout__row--archived" : ""
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
  );
}
