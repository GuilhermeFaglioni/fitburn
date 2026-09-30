import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { errorMessage } from "../lib/auth/api";
import { getMyWorkoutSheet } from "../lib/workout-sheets/api";
import { ClientSheetView } from "./workout-sheets/ClientSheetView";
import { Feedback } from "../components/states";

/**
 * Uma ficha de treino do cliente (FichaTreinoDesktop.dc.html / FichaTreinoMobile.dc.html):
 * o mesmo bloco da ficha ativa de `/ficha-treino`, aberto a partir de "Fichas
 * anteriores". O artboard não tem esta rota; o link de volta é do app.
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
        <Feedback tone="error" surface="dark">
          {errorMessage(sheetQuery.error, "Não foi possível carregar a ficha.")}
        </Feedback>
      )}

      {sheet && <ClientSheetView sheet={sheet} showPageTitle />}
    </div>
  );
}
