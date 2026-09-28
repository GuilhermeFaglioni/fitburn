import { useId, useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { expandRecurrenceDates, gymToday, weekdayOf } from "@fitburn/contracts";
import { Modal } from "../../components/Modal";
import {
  createOccurrence,
  createRecurringOccurrences,
  getOccurrenceFormOptions,
} from "../../lib/agenda/api";
import { formatShortDate } from "../../lib/agenda/format";
import { OccurrenceErrorBox } from "./OccurrenceErrorBox";

/** Ordem de exibição (segunda primeiro), com o índice do Date (0 = domingo). */
const WEEKDAY_TOGGLES = [
  { weekday: 1, label: "SEG" },
  { weekday: 2, label: "TER" },
  { weekday: 3, label: "QUA" },
  { weekday: 4, label: "QUI" },
  { weekday: 5, label: "SEX" },
  { weekday: 6, label: "SÁB" },
  { weekday: 0, label: "DOM" },
];

const SUMMARY_MAX_DATES = 12;

function recurrenceSummary(dates: string[]): string {
  if (dates.length === 0) return "Nenhuma aula será criada com esses dias e período.";
  const shown = dates
    .slice(0, SUMMARY_MAX_DATES)
    .map((date) => formatShortDate(date, weekdayOf(date)));
  const rest = dates.length - shown.length;
  return `Serão criadas ${dates.length} aulas: ${shown.join(", ")}${rest > 0 ? ` e mais ${rest}` : ""}.`;
}

/** "Nova aula" — formulário do modal de AgendaAdmin.dc.html. */
export function OccurrenceFormModal({
  initialDate,
  onClose,
  onSaved,
}: {
  initialDate?: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const formId = useId();
  const optionsQuery = useQuery({
    queryKey: ["occurrence-options"],
    queryFn: getOccurrenceFormOptions,
  });
  const templates = optionsQuery.data?.templates ?? [];
  const instructors = optionsQuery.data?.instructors ?? [];

  const [templateId, setTemplateId] = useState("");
  const [date, setDate] = useState(initialDate ?? gymToday());
  const [startTime, setStartTime] = useState("");
  const [instructorId, setInstructorId] = useState("");
  const [capacity, setCapacity] = useState("");
  const [repeatsWeekly, setRepeatsWeekly] = useState(false);
  const [weekdays, setWeekdays] = useState<number[]>([]);
  const [endDate, setEndDate] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<unknown>(null);

  function selectTemplate(id: string) {
    setTemplateId(id);
    const template = templates.find((candidate) => candidate.id === id);
    if (!template) return;
    setInstructorId(template.defaultInstructor?.id ?? "");
    setCapacity(String(template.capacity));
  }

  function changeDate(value: string) {
    // A seleção automática de dia da semana acompanha a data enquanto o
    // usuário não escolheu outros dias à mão.
    if (
      repeatsWeekly &&
      value &&
      (weekdays.length === 0 || (weekdays.length === 1 && date && weekdays[0] === weekdayOf(date)))
    ) {
      setWeekdays([weekdayOf(value)]);
    }
    setDate(value);
  }

  function changeRecurrence(value: string) {
    const weekly = value === "WEEKLY";
    setRepeatsWeekly(weekly);
    if (weekly && weekdays.length === 0 && date) setWeekdays([weekdayOf(date)]);
  }

  function toggleWeekday(weekday: number) {
    setWeekdays((current) =>
      current.includes(weekday)
        ? current.filter((candidate) => candidate !== weekday)
        : [...current, weekday].sort((a, b) => a - b),
    );
  }

  const recurrenceDates =
    repeatsWeekly && date && endDate ? expandRecurrenceDates(date, endDate, weekdays) : [];

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);
    const settings = {
      templateId,
      startTime,
      instructorId: instructorId || null,
      capacity: Number(capacity),
    };
    try {
      if (repeatsWeekly) {
        await createRecurringOccurrences({ ...settings, weekdays, startDate: date, endDate });
      } else {
        await createOccurrence({ ...settings, date });
      }
      onSaved();
    } catch (caught) {
      setError(caught);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Modal title="Nova aula" onClose={onClose}>
      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div className="fb-modal__field">
            <label htmlFor={`${formId}-template`}>Modalidade / template</label>
            <select
              id={`${formId}-template`}
              className="fb-field"
              value={templateId}
              onChange={(event) => selectTemplate(event.target.value)}
              required
            >
              <option value="" disabled>
                Selecione
              </option>
              {templates.map((template) => (
                <option key={template.id} value={template.id}>
                  {template.name}
                </option>
              ))}
            </select>
          </div>

          <div className="fb-modal__grid">
            <div className="fb-modal__field">
              <label htmlFor={`${formId}-date`}>Data</label>
              <input
                id={`${formId}-date`}
                type="date"
                className="fb-field"
                value={date}
                onChange={(event) => changeDate(event.target.value)}
                required
              />
            </div>
            <div className="fb-modal__field">
              <label htmlFor={`${formId}-time`}>Horário</label>
              <input
                id={`${formId}-time`}
                type="time"
                className="fb-field"
                value={startTime}
                onChange={(event) => setStartTime(event.target.value)}
                required
              />
            </div>
          </div>

          <div className="fb-modal__field">
            <label htmlFor={`${formId}-instructor`}>Professor</label>
            <select
              id={`${formId}-instructor`}
              className="fb-field"
              value={instructorId}
              onChange={(event) => setInstructorId(event.target.value)}
            >
              <option value="">Sem professor</option>
              {instructors.map((instructor) => (
                <option key={instructor.id} value={instructor.id}>
                  {instructor.fullName}
                </option>
              ))}
            </select>
          </div>

          <div className="fb-modal__grid">
            <div className="fb-modal__field">
              <label htmlFor={`${formId}-capacity`}>Capacidade</label>
              <input
                id={`${formId}-capacity`}
                type="number"
                min={1}
                className="fb-field"
                value={capacity}
                onChange={(event) => setCapacity(event.target.value)}
                required
              />
            </div>
            <div className="fb-modal__field">
              <label htmlFor={`${formId}-recurrence`}>Recorrência</label>
              <select
                id={`${formId}-recurrence`}
                className="fb-field"
                value={repeatsWeekly ? "WEEKLY" : "NONE"}
                onChange={(event) => changeRecurrence(event.target.value)}
              >
                <option value="NONE">Não se repete</option>
                <option value="WEEKLY">Repetir semanalmente</option>
              </select>
            </div>
          </div>

          {repeatsWeekly && (
            <>
              <div className="fb-modal__field">
                <span style={{ fontSize: 12, fontWeight: 500, color: "#333333" }}>
                  Dias da semana
                </span>
                <div className="fb-weekday-toggles" role="group" aria-label="Dias da semana">
                  {WEEKDAY_TOGGLES.map(({ weekday, label }) => (
                    <button
                      key={weekday}
                      type="button"
                      className="fb-weekday-toggle"
                      aria-pressed={weekdays.includes(weekday)}
                      onClick={() => toggleWeekday(weekday)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="fb-modal__field">
                <label htmlFor={`${formId}-end-date`}>Repetir até</label>
                <input
                  id={`${formId}-end-date`}
                  type="date"
                  className="fb-field"
                  value={endDate}
                  min={date}
                  onChange={(event) => setEndDate(event.target.value)}
                  required
                />
              </div>
              {endDate && (
                <p className="fb-recurrence-summary">{recurrenceSummary(recurrenceDates)}</p>
              )}
            </>
          )}
        </div>

        {error !== null && <OccurrenceErrorBox error={error} />}

        <div className="fb-modal__footer">
          <span />
          <div style={{ display: "flex", gap: 10, marginLeft: "auto" }}>
            <button type="button" className="fb-btn-secondary" onClick={onClose}>
              Fechar
            </button>
            <button
              type="submit"
              className="fb-btn-primary fb-btn-primary--sm"
              disabled={isSubmitting}
            >
              Salvar
            </button>
          </div>
        </div>
      </form>
    </Modal>
  );
}
