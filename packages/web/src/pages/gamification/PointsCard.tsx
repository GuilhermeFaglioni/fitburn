import type { GamificationSummary } from "@fitburn/contracts";
import { Meter } from "../../components/ui/Meter";
import { CheckIcon } from "./icons";

/**
 * Cartão de pontos (gradiente CTA, como o cartão do plano na Home): o total e, quando há marcos de sequência, a
 * linha do streak com a contagem em círculo. Branco sobre o laranja segue a exceção da base (texto em negrito).
 */
export function PointsCard({
  totalPoints,
  streak,
  showStreak,
}: Pick<GamificationSummary, "totalPoints" | "streak"> & { showStreak: boolean }) {
  return (
    <section className="fb-gami__points" aria-label="Pontos">
      <span className="fb-gami__points-kicker">pontos totais</span>
      <strong className="fb-gami__points-total">{totalPoints.toLocaleString("pt-BR")}</strong>
      {showStreak && (
        <div className="fb-gami__streak">
          <span className="fb-gami__streak-count">{streak.current}</span>
          <span className="fb-gami__streak-label">dias seguidos de treino</span>
        </div>
      )}
    </section>
  );
}

/**
 * Marcos de sequência: um por marco configurado; o alcançado traz o check (não depende só da cor) e o pendente fica
 * neutro. Quando ainda há um marco pela frente, mostra o próximo e o quanto da sequência já foi (barra e texto).
 */
export function StreakMarks({ streak, badges }: Pick<GamificationSummary, "streak" | "badges">) {
  return (
    <section className="fb-gami__sequence" aria-label="Marcos de sequência">
      <ul className="fb-gami__marks">
        {badges.map(({ milestone }) => {
          const reached = streak.current >= milestone;
          return (
            <li
              key={milestone}
              className={`fb-gami__mark${reached ? "" : " fb-gami__mark--pending"}`}
              aria-label={`${milestone} dias, ${reached ? "alcançado" : "ainda não alcançado"}`}
            >
              {reached && <CheckIcon size={14} />}
              {milestone} dias
            </li>
          );
        })}
      </ul>
      {streak.next && (
        <div className="fb-gami__next">
          <p className="fb-gami__next-text">
            {`Próximo marco: ${streak.next.threshold} dias (+${streak.next.bonusPoints} pontos)`}
          </p>
          <Meter
            value={streak.current}
            max={streak.next.threshold}
            label={`Sequência: ${streak.current} de ${streak.next.threshold} dias`}
          />
        </div>
      )}
    </section>
  );
}
