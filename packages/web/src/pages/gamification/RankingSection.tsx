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
import { QueryBlockState } from "../../components/QueryBlockState";
import { Segmented, type SegmentedOption } from "../../components/ui/Segmented";
import { EmptyState } from "../../components/ui/States";

const RANKING_TABS: SegmentedOption<RankingPeriodName>[] = [
  { value: RankingPeriod.WEEK, label: "Semanal" },
  { value: RankingPeriod.MONTH, label: "Mensal" },
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
      <span className="fb-gami__rank-who">
        <span className="fb-gami__rank-name">{name}</span>
        <span className="fb-gami__rank-info">{info}</span>
      </span>
    </li>
  );
}

/**
 * Ranking semanal e mensal: pontos no período, desempate por presenças; a minha posição destacada (e com "(você)" no
 * texto) e o rótulo "empate" para quem continua empatado. Só quem participa (consentimento) vê as posições.
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
  const consented = isClient && consentQuery.data?.consented === true;
  const rankingQuery = useQuery({
    queryKey: ["gamification", "ranking", period],
    queryFn: () => getRanking(period),
    // Ao trocar de período a lista anterior fica até a nova chegar: sem salto de layout.
    placeholderData: keepPreviousData,
    enabled: consented,
  });

  return (
    <section className="fb-gami__section" aria-labelledby="fb-gami-ranking">
      <div className="fb-gami__rank-head">
        <h2 id="fb-gami-ranking" className="fb-gami__section-title">
          Ranking
        </h2>
        <Segmented
          label="Período do ranking"
          options={RANKING_TABS}
          value={period}
          onChange={setPeriod}
          className="fb-gami__tabs"
        />
      </div>

      {!isClient && <EmptyState title="Ranking disponível para clientes participantes." />}
      {isClient && (
        <QueryBlockState
          query={consentQuery}
          loading="Carregando…"
          error="Não foi possível verificar sua participação no ranking."
          hasData={consentQuery.data !== undefined}
        />
      )}
      {isClient && consentQuery.data && !consentQuery.data.consented && (
        <EmptyState
          title="Você não participa do ranking."
          description="Seus pontos e sua sequência continuam disponíveis só para você."
        />
      )}
      {consented && (
        <QueryBlockState
          query={rankingQuery}
          loading="Carregando o ranking…"
          error="Não foi possível carregar o ranking."
          hasData={rankingQuery.data !== undefined}
        />
      )}
      {consented &&
        rankingQuery.data &&
        (rankingQuery.data.entries.length === 0 ? (
          <EmptyState title="Ninguém pontuou neste período ainda." />
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
