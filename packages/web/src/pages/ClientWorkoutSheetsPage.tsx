import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { WorkoutSheetStatus, type WorkoutSheet } from "@fitburn/contracts";
import { formatInstantDate } from "../lib/agenda/format";
import { listMyWorkoutSheets } from "../lib/workout-sheets/api";
import { statusBadge } from "./workout-sheets/status";

function exerciseCount(sheet: WorkoutSheet): string {
  const count = sheet.exercises.length;
  return `${count} ${count === 1 ? "exercício" : "exercícios"}`;
}

/**
 * Ficha de treino do cliente (FichaTreinoDesktop.dc.html / FichaTreinoMobile.dc.html):
 * as fichas ativas em destaque e, abaixo, as anteriores (concluídas e
 * arquivadas). Somente leitura: cada ficha abre no seu detalhe.
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
      <h1 className="fb-workout__title">Ficha de treino</h1>

      {sheetsQuery.isError && (
        <p role="alert" className="fb-workout__alert">
          Não foi possível carregar as suas fichas.
        </p>
      )}

      {sheetsQuery.isSuccess && sheets.length === 0 && (
        <div className="fb-workout__empty">
          Você ainda não tem fichas de treino. Fale com o seu professor para receber a sua.
        </div>
      )}

      {sheetsQuery.isSuccess && sheets.length > 0 && active.length === 0 && (
        <div className="fb-workout__empty">Nenhuma ficha ativa no momento.</div>
      )}

      {active.length > 0 && (
        <section className="fb-workout__section" aria-labelledby="fb-workout-active">
          <h2 id="fb-workout-active" className="fb-workout__section-title">
            Fichas ativas
          </h2>
          <ul className="fb-workout__cards">
            {active.map((sheet) => (
              <li key={sheet.id}>
                <Link to={`/ficha-treino/${sheet.id}`} className="fb-workout__card">
                  <span className="fb-workout__card-head">
                    <span className="fb-workout__card-title">{sheet.title}</span>
                    <span className="fb-workout__badge">{statusBadge(sheet.status)}</span>
                  </span>
                  <span className="fb-workout__meta">
                    Montada por {sheet.authorName} · desde {formatInstantDate(sheet.createdAt)}
                  </span>
                  <span className="fb-workout__count">{exerciseCount(sheet)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

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
                    <span className="fb-workout__meta">{formatInstantDate(sheet.createdAt)}</span>
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
