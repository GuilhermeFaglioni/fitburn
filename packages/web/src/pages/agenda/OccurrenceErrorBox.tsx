import {
  ErrorCode,
  occurrenceOverlapDetailsSchema,
  utcToGymDateTime,
  weekdayOf,
} from "@fitburn/contracts";
import { ApiError } from "../../lib/auth/api";
import { formatInstantHour, formatShortDate } from "../../lib/agenda/format";

/** Erro de uma operação na agenda; para OCCURRENCE_OVERLAP lista as aulas em conflito. */
export function OccurrenceErrorBox({ error }: { error: unknown }) {
  const message = error instanceof ApiError ? error.message : "Não foi possível salvar a aula.";
  const overlap =
    error instanceof ApiError && error.code === ErrorCode.OCCURRENCE_OVERLAP
      ? occurrenceOverlapDetailsSchema.safeParse(error.details)
      : null;

  return (
    <div role="alert" className="fb-error-box">
      {message}
      {overlap?.success && overlap.data.conflicts.length > 0 && (
        <ul>
          {overlap.data.conflicts.map((conflict) => {
            const { date } = utcToGymDateTime(conflict.startsAt);
            return (
              <li key={conflict.id}>
                {conflict.name} · {formatInstantHour(conflict.startsAt)}–
                {formatInstantHour(conflict.endsAt)} ({formatShortDate(date, weekdayOf(date))})
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
