import { useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { RankingPeriod, type RankingEntry, type RankingPeriodName } from "@fitburn/contracts";
import { getRanking } from "../../lib/gamification/api";

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
  const rankingQuery = useQuery({
    queryKey: ["gamification", "ranking", period],
    queryFn: () => getRanking(period),
    // Ao trocar de período a lista anterior fica até a nova chegar: sem salto de layout.
    placeholderData: keepPreviousData,
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

      {rankingQuery.isError && (
        <p role="alert" className="fb-gami__alert">
          Não foi possível carregar o ranking.
        </p>
      )}
      {rankingQuery.data &&
        (rankingQuery.data.entries.length === 0 ? (
          <div className="fb-client-empty">Ninguém pontuou neste período ainda.</div>
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
