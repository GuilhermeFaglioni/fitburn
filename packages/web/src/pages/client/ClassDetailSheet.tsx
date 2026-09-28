import { useId } from "react";
import { useQuery } from "@tanstack/react-query";
import { gymToday, utcToGymDateTime, weekdayOf, type ClientAgendaItem } from "@fitburn/contracts";
import { useCloseOnEscape } from "../../components/Modal";
import { getClientAgendaItem } from "../../lib/agenda/client-api";
import { formatInstantHour, formatShortDate } from "../../lib/agenda/format";

/**
 * Detalhe somente leitura da aula (ReservaMobile.dc.html). Os estados de
 * reserva do artboard (Reservar, confirmada, erros) chegam na Fase 3.
 */
export function ClassDetailSheet({
  item,
  onClose,
}: {
  item: ClientAgendaItem;
  onClose: () => void;
}) {
  const titleId = useId();
  // Recarrega para mostrar a disponibilidade mais recente (ainda informativa).
  const detailQuery = useQuery({
    queryKey: ["client-agenda", "item", item.id],
    queryFn: () => getClientAgendaItem(item.id),
    placeholderData: item,
  });
  const occurrence = detailQuery.data ?? item;

  useCloseOnEscape(onClose);

  const { date } = utcToGymDateTime(occurrence.startsAt);
  const day = date === gymToday() ? "Hoje" : formatShortDate(date, weekdayOf(date));

  return (
    <div
      className="fb-sheet-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="fb-sheet" role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <h2 id={titleId} className="fb-sheet__title">
            {occurrence.name}
          </h2>
          <span className="fb-sheet__subtitle">
            {day}, {formatInstantHour(occurrence.startsAt)} – {formatInstantHour(occurrence.endsAt)}
          </span>
        </div>

        <div className="fb-sheet__facts">
          {occurrence.instructor && (
            <span className="fb-sheet__fact">Prof. {occurrence.instructor.fullName}</span>
          )}
          <span className="fb-sheet__fact">Duração de {occurrence.durationMinutes} minutos</span>
          <span className="fb-sheet__fact">
            {occurrence.available} de {occurrence.capacity} vagas restantes
          </span>
        </div>

        {occurrence.description && (
          <p className="fb-sheet__description">{occurrence.description}</p>
        )}

        {detailQuery.isError && (
          <p role="alert" className="fb-sheet__description">
            Esta aula não está mais disponível na agenda (foi cancelada ou já começou).
          </p>
        )}

        <div className="fb-sheet__divider" />

        <button type="button" className="fb-sheet__close" onClick={onClose}>
          Fechar
        </button>
      </div>
    </div>
  );
}
