import type { GamificationSummary } from "@fitburn/contracts";
import { CheckIcon, LockIcon } from "./icons";

/** Conquistas: um disco por marco de streak, com check se conquistado ou cadeado e o progresso se bloqueado. */
export function Achievements({ streak, badges }: Pick<GamificationSummary, "streak" | "badges">) {
  return (
    <section className="fb-gami__section" aria-labelledby="fb-gami-badges">
      <h2 id="fb-gami-badges" className="fb-gami__section-title">
        Conquistas
      </h2>
      <ul className="fb-gami__discs">
        {badges.map(({ milestone, earned }) => {
          const label = earned
            ? `Streak de ${milestone}`
            : `Streak de ${milestone} (${Math.min(streak.current, milestone)}/${milestone})`;
          return (
            <li
              key={milestone}
              className={`fb-gami__disc-item${earned ? "" : " fb-gami__disc-item--locked"}`}
              aria-label={`${label}, ${earned ? "conquistado" : "bloqueado"}`}
            >
              <span className="fb-gami__disc">
                {earned ? <CheckIcon size={20} /> : <LockIcon size={20} />}
              </span>
              <span className="fb-gami__disc-label">{label}</span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
