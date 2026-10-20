import { useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { RankingPeriod, type RankingEntry, type RankingPeriodName } from "@fitburn/contracts";
import { useAuth } from "../../lib/auth/AuthContext";
import { isClientUser } from "../../lib/auth/areas";
import {
  getRanking,
  getRankingConsent,
  rankingConsentQueryKey,
} from "../../lib/gamification/api";
import { EmptyState, ErrorState, LoadingState } from "../../components/states";

const RANKING_TABS: Array<{ period: RankingPeriodName; label: string }> = [
  { period: RankingPeriod.WEEK, label: "Semanal" },
  { period: RankingPeriod.MONTH, label: "Mensal" },
];

function attendancesLabel(count: number): string {
  return `${count} ${count === 1 ? "presença" : "presenças"}`;
}

function RankingRow({ entry }: { entry: RankingEntry }) {
  // A própria linha mostra só o primeiro nome ("Marina (você)"); as dos outros, "Ana P.".
  const name = entry.isMe ? `${entry.firstName} (você)` : entry.name;
  const info = `${attendancesLabel(entry.attendances)}${entry.tied ? " · empate" : ""}`;
  return (
    <li className={`fb-gami__rank-row${entry.isMe ? " fb-gami__rank-row--me" : ""}`}>
      <span className="fb-gami__rank-pos">{entry.position}º</span>
      <span className="fb-gami__rank-name">{name}</span>
      <span className="fb-gami__rank-info">{info}</span>
    </li>
  );
}

/**
 * Ranking semanal e mensal da tela Sua evolução (GamificacaoMobile /
 * GamificacaoDesktop.dc.html): pontos no período, desempate por presenças; a
 * minha posição destacada e o rótulo "empate" para quem continua empatado.
 */
export function RankingSection() {
  const [period, setPeriod] = useState<RankingPeriodName>(RankingPeriod.WEEK);
  const { user } = useAuth();
  const isClient = user ? isClientUser(user) : false;
  const consentQuery = useQuery({
    queryKey: rankingConsentQueryKey,
    queryFn: getRankingConsent,
    enabled: isClient,
  });
  const rankingQuery = useQuery({
    queryKey: ["gamification", "ranking", period],
    queryFn: () => getRanking(period),
    // Ao trocar de período a lista anterior fica até a nova chegar: sem salto de layout.
    placeholderData: keepPreviousData,
    enabled: isClient && consentQuery.data?.consented === true,
  });

  return (
    <section className="fb-gami__section fb-gami__ranking" aria-labelledby="fb-gami-ranking">
      <div className="fb-gami__rank-head">
        <h2 id="fb-gami-ranking" className="fb-gami__section-title">
          Ranking
        </h2>
        <div
          className="fb-client-tabs fb-gami__rank-tabs"
          role="group"
          aria-label="Período do ranking"
        >
          {RANKING_TABS.map((tab) => (
            <button
              key={tab.period}
              type="button"
              className="fb-client-tab-btn fb-gami__rank-tab"
              aria-pressed={period === tab.period}
              onClick={() => setPeriod(tab.period)}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {!isClient && (
        <EmptyState surface="dark" message="Ranking disponível para clientes participantes." />
      )}
      {isClient && consentQuery.isLoading && <LoadingState surface="dark" />}
      {isClient && consentQuery.isError && (
        <ErrorState
          surface="dark"
          message="Não foi possível verificar sua participação no ranking."
          onRetry={() => void consentQuery.refetch()}
        />
      )}
      {isClient && consentQuery.data && !consentQuery.data.consented && (
        <EmptyState
          surface="dark"
          message="Você não participa do ranking. Seus pontos e sua sequência continuam disponíveis só para você."
        />
      )}
      {isClient && consentQuery.data?.consented && rankingQuery.isLoading && (
        <LoadingState surface="dark" />
      )}
      {isClient && consentQuery.data?.consented && rankingQuery.isError && (
        <ErrorState
          surface="dark"
          message="Não foi possível carregar o ranking."
          onRetry={() => void rankingQuery.refetch()}
        />
      )}
      {isClient && consentQuery.data?.consented && rankingQuery.data &&
        (rankingQuery.data.entries.length === 0 ? (
          <EmptyState surface="dark" message="Ninguém pontuou neste período ainda." />
        ) : (
          <ul className="fb-gami__rank-list">
            {rankingQuery.data.entries.map((entry, index) => (
              // Sem id no contrato (privacidade): dois "Ana P." empatados só se distinguem pela ordem.
              <RankingRow key={index} entry={entry} />
            ))}
          </ul>
        ))}
    </section>
  );
}
