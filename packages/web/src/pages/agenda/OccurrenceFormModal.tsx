import { useId, useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { gymToday } from "@fitburn/contracts";
import { Modal } from "../../components/Modal";
import { createOccurrence, getOccurrenceFormOptions } from "../../lib/agenda/api";
import { OccurrenceErrorBox } from "./OccurrenceErrorBox";

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
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<unknown>(null);

  function selectTemplate(id: string) {
    setTemplateId(id);
    const template = templates.find((candidate) => candidate.id === id);
    if (!template) return;
    setInstructorId(template.defaultInstructor?.id ?? "");
    setCapacity(String(template.capacity));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      await createOccurrence({
        templateId,
        date,
        startTime,
        instructorId: instructorId || null,
        capacity: Number(capacity),
      });
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
                onChange={(event) => setDate(event.target.value)}
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
          </div>
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
