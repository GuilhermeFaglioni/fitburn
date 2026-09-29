import {
  ErrorCode,
  scheduleConflictDetailsSchema,
  type ReservationRefusal,
} from "@fitburn/contracts";
import { formatClassMoment } from "../../lib/agenda/format";

export interface RefusalText {
  title: string | null;
  text: string;
}

/**
 * A recusa de uma reserva em nome do cliente, com o texto voltado à equipe
 * (o do servidor fala com o cliente em primeira pessoa). O código é o mesmo
 * do fluxo do cliente; para os que não têm texto próprio vale a mensagem do
 * servidor.
 */
export function describeRefusal(
  refusal: ReservationRefusal,
  occurrence: { name: string; capacity: number } | null,
): RefusalText {
  switch (refusal.code) {
    case ErrorCode.CLASS_FULL: {
      const capacity = occurrence?.capacity;
      const subject = occurrence
        ? `Todas as ${capacity} vagas de ${occurrence.name} já estão ocupadas.`
        : "Todas as vagas desta aula já estão ocupadas.";
      return { title: "Aula cheia.", text: `${subject} Escolha outro horário.` };
    }
    case ErrorCode.DUPLICATE_RESERVATION:
      return {
        title: "Reserva duplicada.",
        text: "Este cliente já possui uma reserva confirmada para esta aula.",
      };
    case ErrorCode.SCHEDULE_CONFLICT: {
      const conflict = scheduleConflictDetailsSchema.safeParse(refusal.details);
      const when = conflict.success
        ? ` (${conflict.data.reservation.occurrence.name}, ${formatClassMoment(conflict.data.reservation.occurrence.startsAt)})`
        : "";
      return {
        title: "Conflito de horário.",
        text: `Este cliente já tem outra reserva no mesmo horário${when}.`,
      };
    }
    case ErrorCode.OCCURRENCE_NOT_BOOKABLE:
      return {
        title: "Aula indisponível.",
        text: "Esta aula foi cancelada ou já começou.",
      };
    case ErrorCode.USER_INACTIVE:
      return {
        title: "Cliente inativo.",
        text: "Reative o cadastro do cliente antes de reservar.",
      };
    default:
      return { title: null, text: refusal.message };
  }
}
