import { useId, useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { expandRecurrenceDates, gymToday, weekdayOf } from "@fitburn/contracts";
import { Button } from "../../components/ui/Button";
import { Dialog } from "../../components/ui/Dialog";
import { Field } from "../../components/ui/Field";
import { Pill } from "../../components/ui/Pill";
import { Select } from "../../components/ui/Select";
import {
  createOccurrence,
  createRecurringOccurrences,
  getOccurrenceFormOptions,
} from "../../lib/agenda/api";
import { formatShortDate } from "../../lib/agenda/format";
import { instructorOptionLabel } from "./instructor-label";
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

/** "Nova aula" (D-038, #156): formulário em `Dialog`, com a recorrência semanal opcional. */
export function OccurrenceFormModal({
  initialDate,
  onClose,
  onSaved,
}: {
  initialDate?: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const weekdaysLabelId = useId();
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

  const titularId = templates.find((candidate) => candidate.id === templateId)?.defaultInstructor
    ?.id;

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
    <Dialog title="Nova aula" onClose={onClose}>
      <form onSubmit={handleSubmit} aria-label="Nova aula" className="fb-ui-dialog__form">
        <Select
          label="Modalidade / template"
          value={templateId}
          onChange={(event) => selectTemplate(event.target.value)}
          error={optionsQuery.isError ? "Não foi possível carregar os templates." : undefined}
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
        </Select>

        <div className="fb-ui-form-grid">
          <Field
            label="Data"
            type="date"
            value={date}
            onChange={(event) => changeDate(event.target.value)}
            required
          />
          <Field
            label="Horário"
            type="time"
            value={startTime}
            onChange={(event) => setStartTime(event.target.value)}
            required
          />
        </div>

        <Select
          label="Professor"
          value={instructorId}
          onChange={(event) => setInstructorId(event.target.value)}
        >
          <option value="">Sem professor</option>
          {instructors.map((instructor) => (
            <option key={instructor.id} value={instructor.id}>
              {instructorOptionLabel(instructor.fullName, instructor.id === titularId)}
            </option>
          ))}
        </Select>

        <div className="fb-ui-form-grid">
          <Field
            label="Capacidade"
            type="number"
            min={1}
            value={capacity}
            onChange={(event) => setCapacity(event.target.value)}
            required
          />
          <Select
            label="Recorrência"
            value={repeatsWeekly ? "WEEKLY" : "NONE"}
            onChange={(event) => changeRecurrence(event.target.value)}
          >
            <option value="NONE">Não se repete</option>
            <option value="WEEKLY">Repetir semanalmente</option>
          </Select>
        </div>

        {repeatsWeekly && (
          <>
            <div className="fb-ui-fieldgroup">
              <span id={weekdaysLabelId} className="fb-ui-field__label">
                Dias da semana
              </span>
              <div className="fb-ui-weekdays" role="group" aria-labelledby={weekdaysLabelId}>
                {WEEKDAY_TOGGLES.map(({ weekday, label }) => (
                  <Pill
                    key={weekday}
                    pressed={weekdays.includes(weekday)}
                    onClick={() => toggleWeekday(weekday)}
                  >
                    {label}
                  </Pill>
                ))}
              </div>
            </div>
            <Field
              label="Repetir até"
              type="date"
              value={endDate}
              min={date}
              onChange={(event) => setEndDate(event.target.value)}
              required
            />
            {endDate && <p className="fb-ui-note">{recurrenceSummary(recurrenceDates)}</p>}
          </>
        )}

        {error !== null && <OccurrenceErrorBox error={error} />}

        <div className="fb-ui-dialog__actions">
          <Button disabled={isSubmitting} onClick={onClose}>
            Fechar
          </Button>
          <Button type="submit" variant="primary" busy={isSubmitting}>
            Salvar
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
