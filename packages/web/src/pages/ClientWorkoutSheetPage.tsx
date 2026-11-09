import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { errorMessage } from "../lib/auth/api";
import { getMyWorkoutSheet } from "../lib/workout-sheets/api";
import { ClientSheetView } from "./workout-sheets/ClientSheetView";
import { QueryBlockState } from "../components/QueryBlockState";

/**
 * Uma ficha de treino do cliente (D-038):
 * o mesmo bloco da ficha ativa de `/ficha-treino`, aberto a partir de "Fichas
 * anteriores". A proposta não tem esta rota; o link de volta é do app.
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
      <Link
        to="/ficha-treino"
        className="fb-workout__back"
        aria-label="Voltar para Fichas de treino"
      >
        <span aria-hidden="true">←</span> Fichas de treino
      </Link>

      <QueryBlockState
        query={sheetQuery}
        loading="Carregando a ficha…"
        error={errorMessage(sheetQuery.error, "Não foi possível carregar a ficha.")}
        hasData={sheet !== undefined}
      />

      {sheet && <ClientSheetView sheet={sheet} showPageTitle />}
    </div>
  );
}
