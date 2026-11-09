import { useQuery } from "@tanstack/react-query";
import { getMyGamification } from "../lib/gamification/api";
import { QueryBlockState } from "../components/QueryBlockState";
import { Achievements } from "./gamification/Achievements";
import { GoalsSection } from "./gamification/GoalsSection";
import { HistorySection } from "./gamification/HistorySection";
import { PointsCard, StreakMarks } from "./gamification/PointsCard";
import { RankingConsentControl } from "./gamification/RankingConsentControl";
import { RankingSection } from "./gamification/RankingSection";

/**
 * FitPoints (D-038, tela extrapolada da base): o cartão de pontos com o streak e os marcos, as conquistas, o
 * histórico dos ganhos, as metas do professor, o ranking e a participação nele. No celular as seções empilham
 * nessa ordem; no desktop largo, a coluna de pontos e conquistas fica ao lado do resto (ver gamification.css).
 * Cada bloco carrega, falha e fica sem conexão sozinho (`QueryBlockState`).
 */
export function GamificationPage() {
  const summaryQuery = useQuery({
    queryKey: ["gamification", "me"],
    queryFn: getMyGamification,
  });
  const summary = summaryQuery.data;
  const hasMilestones = (summary?.badges.length ?? 0) > 0;

  return (
    <div className="fb-gami">
      <h1 className="fb-gami__title">FitPoints</h1>

      <div className="fb-gami__cols">
        <div className="fb-gami__col fb-gami__col--lead">
          <QueryBlockState
            query={summaryQuery}
            loading="Carregando…"
            error="Não foi possível carregar seus FitPoints."
            hasData={summary !== undefined}
          />
          {summary && (
            <PointsCard
              totalPoints={summary.totalPoints}
              streak={summary.streak}
              showStreak={hasMilestones}
            />
          )}
          {summary && hasMilestones && (
            <>
              <StreakMarks streak={summary.streak} badges={summary.badges} />
              <Achievements streak={summary.streak} badges={summary.badges} />
            </>
          )}
        </div>

        <div className="fb-gami__col fb-gami__col--rest">
          {summary && <HistorySection history={summary.history} />}
          <GoalsSection />
          <RankingSection />
          <RankingConsentControl surface="gamification" />
        </div>
      </div>
    </div>
  );
}
