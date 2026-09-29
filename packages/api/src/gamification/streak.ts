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

/** O que uma sequência já merece por um marco: o bônus (se ainda não foi lançado) e a aula que o completou. */
export interface StreakAward {
  threshold: number;
  points: number;
  completing: RegisteredAttendance;
  bonusDue: boolean;
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

/** A sequência que contém uma presença; undefined se ela não estiver no histórico como presente. */
export function runContaining(
  history: RegisteredAttendance[],
  reservationId: string,
): RegisteredAttendance[] | undefined {
  return presenceRuns(history).find((run) =>
    run.some((attendance) => attendance.reservationId === reservationId),
  );
}

/** O streak de agora: as presenças consecutivas no fim do histórico (zero se a última marcação foi uma falta). */
export function currentStreak(history: RegisteredAttendance[]): number {
  let streak = 0;
  for (let index = history.length - 1; index >= 0 && history[index].present; index--) streak++;
  return streak;
}

/**
 * Os marcos que uma sequência já alcançou, do menor ao maior. O bônus de um
 * marco está "devido" se nenhum bônus daquele marco foi lançado para uma
 * presença da própria sequência — assim uma presença que entra no meio, fora
 * de ordem, e muda qual aula completa o marco não paga duas vezes.
 * `rewarded` são os bônus já lançados: o marco e a reserva que o completou.
 */
export function streakAwards(
  run: RegisteredAttendance[],
  milestones: StreakMilestone[],
  rewarded: Array<{ milestone: number | null; reservationId: string | null }>,
): StreakAward[] {
  const inRun = new Set(run.map((attendance) => attendance.reservationId));
  return milestones
    .filter(({ threshold }) => run.length >= threshold)
    .map(({ threshold, points }) => ({
      threshold,
      points,
      completing: run[threshold - 1],
      bonusDue: !rewarded.some(
        (entry) =>
          entry.milestone === threshold &&
          entry.reservationId !== null &&
          inRun.has(entry.reservationId),
      ),
    }));
}
