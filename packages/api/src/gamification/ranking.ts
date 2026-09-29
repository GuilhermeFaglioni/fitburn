import {
  addDays,
  addMonths,
  RankingPeriod,
  startOfMonth,
  startOfWeek,
  type RankingPeriodName,
} from "@fitburn/contracts";

/** Primeiro e último dia (locais da academia, inclusive) do período que contém `today`. */
export function rankingWindow(
  period: RankingPeriodName,
  today: string,
): { from: string; to: string } {
  if (period === RankingPeriod.WEEK) {
    const from = startOfWeek(today);
    return { from, to: addDays(from, 6) };
  }
  const from = startOfMonth(today);
  return { from, to: addDays(addMonths(from, 1), -1) };
}

/** O primeiro nome de uma pessoa. */
export function firstName(fullName: string): string {
  return fullName.trim().split(/\s+/)[0] ?? "";
}

/** Como um participante aparece para os outros: o primeiro nome e a inicial do sobrenome ("Ana P."). */
export function publicName(fullName: string): string {
  const words = fullName.trim().split(/\s+/);
  if (words.length < 2) return words[0] ?? "";
  return `${words[0]} ${words[words.length - 1][0].toUpperCase()}.`;
}

export interface Standing {
  clientId: string;
  /** O nome completo: só desempata a ordem entre empatados (alfabética); quem vê usa publicName. */
  fullName: string;
  points: number;
  attendances: number;
}

export interface RankedStanding extends Standing {
  position: number;
  tied: boolean;
}

/**
 * Classificação de competição: mais pontos primeiro; empate em pontos decidido
 * por mais presenças; quem continua empatado divide a posição e a seguinte é
 * pulada (1, 1, 3). Entre empatados a ordem é alfabética, para a lista não
 * mudar de uma consulta para outra.
 */
export function rankStandings(standings: Standing[]): RankedStanding[] {
  const sorted = [...standings].sort(
    (a, b) =>
      b.points - a.points ||
      b.attendances - a.attendances ||
      a.fullName.localeCompare(b.fullName, "pt-BR") ||
      a.clientId.localeCompare(b.clientId),
  );

  const ranked: RankedStanding[] = [];
  let groupStart = 0;
  sorted.forEach((standing, index) => {
    const previous = sorted[index - 1];
    const sameScore =
      previous &&
      previous.points === standing.points &&
      previous.attendances === standing.attendances;
    if (!sameScore) groupStart = index;
    ranked.push({ ...standing, position: groupStart + 1, tied: false });
    if (sameScore) {
      // Todo o grupo empatado, do primeiro ao atual, está empatado.
      for (let member = groupStart; member <= index; member++) ranked[member].tied = true;
    }
  });
  return ranked;
}

/** Os `size` primeiros colocados e, se estiver fora deles, o cliente que consultou. */
export function topWithViewer(
  ranked: RankedStanding[],
  size: number,
  viewerId: string,
): RankedStanding[] {
  return ranked.filter((standing, index) => index < size || standing.clientId === viewerId);
}
