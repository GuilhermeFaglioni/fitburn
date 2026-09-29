/** Uma presença ou falta já registrada, na ordem cronológica das aulas. */
export interface RegisteredAttendance {
  reservationId: string;
  present: boolean;
  startsAt: Date;
}

/** Um marco de streak configurado: quantas presenças seguidas e quantos pontos de bônus. */
export interface StreakMilestone {
  threshold: number;
  points: number;
}

/** O que o plano precisa saber de um bônus de streak que ainda vale (nenhum estorno o desfez). */
export interface LiveBonus {
  id: string;
  milestone: number | null;
  /** A reserva cuja presença completou o marco. */
  reservationId: string | null;
}

/** Um bônus merecido e ainda não lançado: o marco, os pontos e a aula que o completou. */
export interface StreakAward {
  threshold: number;
  points: number;
  completing: RegisteredAttendance;
}

/** O que falta fazer no ledger e nos badges para refletirem o histórico de agora. */
export interface StreakPlan<B extends LiveBonus> {
  awards: StreakAward[];
  /** Bônus vivos que nenhuma sequência sustenta mais, ou repetidos numa mesma sequência: a estornar. */
  surplus: B[];
  badgesToGrant: Array<{ threshold: number; awardedAt: Date }>;
  badgesToRevoke: number[];
}

export interface StreakPlanInput<B extends LiveBonus> {
  /** Presenças e faltas registradas, em ordem cronológica (já com a marcação de agora). */
  history: RegisteredAttendance[];
  /** A reserva cuja marcação acabou de mudar. */
  changedReservationId: string;
  /** Os marcos configurados, do menor para o maior. */
  milestones: StreakMilestone[];
  /** Os bônus vivos do cliente, do mais antigo para o mais novo. */
  liveBonuses: B[];
  /** Os marcos de que o cliente tem badge ativo (não revogado). */
  activeBadges: Set<number>;
}

/**
 * Sequências de presenças consecutivas do histórico (já em ordem cronológica):
 * uma falta encerra a sequência. Cancelamentos e reservas ainda não marcadas
 * nem entram no histórico — são neutros.
 */
export function presenceRuns(history: RegisteredAttendance[]): RegisteredAttendance[][] {
  const runs: RegisteredAttendance[][] = [];
  let run: RegisteredAttendance[] = [];
  for (const attendance of history) {
    if (attendance.present) {
      run.push(attendance);
    } else if (run.length > 0) {
      runs.push(run);
      run = [];
    }
  }
  if (run.length > 0) runs.push(run);
  return runs;
}

/** O streak de agora: as presenças consecutivas no fim do histórico (zero se a última marcação foi uma falta). */
export function currentStreak(history: RegisteredAttendance[]): number {
  let streak = 0;
  for (let index = history.length - 1; index >= 0 && history[index].present; index--) streak++;
  return streak;
}

/**
 * Compara o histórico de agora com o que já foi lançado e diz o que ajustar,
 * olhando só as sequências que a marcação de `changedReservationId` tocou: a
 * que a contém (presente) ou as que ficaram de cada lado dela (falta). Assim
 * uma regra nova na configuração não repaga sequências antigas, e uma falta ou
 * uma correção que quebra, une ou reduz uma sequência ajusta os bônus dela.
 *
 * Cada sequência merece um bônus por marco configurado que alcançou, uma vez.
 * Um bônus vivo é excedente se nenhuma sequência o sustenta mais (a reserva
 * que o completou virou falta ou a sequência ficou menor que o marco) ou se
 * repete outro do mesmo marco na mesma sequência (resultado de uma fusão) —
 * mesmo que o marco tenha saído da configuração: o que foi pago segue a
 * história, não a configuração. O badge é revogado quando nenhuma sequência
 * do histórico alcança mais o marco, e concedido quando uma sequência tocada o
 * alcança e o cliente não o tem.
 */
export function planStreak<B extends LiveBonus>(input: StreakPlanInput<B>): StreakPlan<B> {
  const { history, changedReservationId, milestones, liveBonuses, activeBadges } = input;
  const runs = presenceRuns(history);
  const runOf = new Map<string, number>();
  runs.forEach((run, index) => run.forEach((a) => runOf.set(a.reservationId, index)));

  const position = history.findIndex((a) => a.reservationId === changedReservationId);
  const touched = new Set<number>();
  for (const neighbour of [position - 1, position, position + 1]) {
    const run = history[neighbour] && runOf.get(history[neighbour].reservationId);
    if (run !== undefined) touched.add(run);
  }

  const runOfBonus = (bonus: B) =>
    bonus.reservationId === null ? undefined : runOf.get(bonus.reservationId);

  const awards: StreakAward[] = [];
  for (const index of touched) {
    for (const { threshold, points } of milestones) {
      if (runs[index].length < threshold) break;
      const paid = liveBonuses.some(
        (bonus) => bonus.milestone === threshold && runOfBonus(bonus) === index,
      );
      if (!paid) awards.push({ threshold, points, completing: runs[index][threshold - 1] });
    }
  }

  const surplus: B[] = [];
  const kept = new Set<string>();
  for (const bonus of liveBonuses) {
    const index = runOfBonus(bonus);
    const inScope =
      bonus.reservationId === changedReservationId || (index !== undefined && touched.has(index));
    if (!inScope || bonus.milestone === null) continue;

    const supported = index !== undefined && runs[index].length >= bonus.milestone;
    const slot = `${index}:${bonus.milestone}`;
    if (supported && !kept.has(slot)) kept.add(slot);
    else surplus.push(bonus);
  }

  const badgesToGrant: StreakPlan<B>["badgesToGrant"] = [];
  const badgesToRevoke: number[] = [];
  for (const { threshold } of milestones) {
    const reaching = runs.findIndex((run) => run.length >= threshold);
    if (reaching === -1) {
      if (activeBadges.has(threshold)) badgesToRevoke.push(threshold);
      continue;
    }
    const reachingTouched = runs.findIndex((run, i) => touched.has(i) && run.length >= threshold);
    if (reachingTouched !== -1 && !activeBadges.has(threshold)) {
      badgesToGrant.push({
        threshold,
        awardedAt: runs[reachingTouched][threshold - 1].startsAt,
      });
    }
  }

  return { awards, surplus, badgesToGrant, badgesToRevoke };
}
