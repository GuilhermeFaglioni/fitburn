import { useId, useState, type FormEvent } from "react";
import type { ClassTemplateDetail, InstructorSummary, ModalityDetail } from "@fitburn/contracts";
import { ApiError } from "../../lib/auth/api";
import { createClassTemplate, updateClassTemplate } from "../../lib/catalog/api";
import { Feedback } from "../../components/states";

export function ClassTemplateForm({
  template,
  modalities,
  instructors,
  onSaved,
  onCancel,
}: {
  template?: ClassTemplateDetail;
  modalities: ModalityDetail[];
  instructors: InstructorSummary[];
  onSaved: () => void;
  onCancel: () => void;
}) {
  const formId = useId();
  const [name, setName] = useState(template?.name ?? "");
  const [description, setDescription] = useState(template?.description ?? "");
  const [modalityId, setModalityId] = useState(template?.modality.id ?? "");
  const [durationMinutes, setDurationMinutes] = useState(
    template ? String(template.durationMinutes) : "",
  );
  const [capacity, setCapacity] = useState(template ? String(template.capacity) : "");
  const [defaultInstructorId, setDefaultInstructorId] = useState(
    template?.defaultInstructor?.id ?? "",
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Modalidade inativa não entra em template novo, mas o template sendo
  // editado continua mostrando a que já tem.
  const modalityOptions = modalities.filter(
    (modality) => modality.isActive || modality.id === template?.modality.id,
  );
  // Mesmo raciocínio para o professor padrão que foi desativado depois.
  const currentInstructor = template?.defaultInstructor;
  const instructorOptions =
    currentInstructor && !instructors.some((instructor) => instructor.id === currentInstructor.id)
      ? [
          ...instructors,
          { ...currentInstructor, fullName: `${currentInstructor.fullName} (inativo)` },
        ]
      : instructors;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage(null);
    setIsSubmitting(true);
    const payload = {
      name,
      durationMinutes: Number(durationMinutes),
      capacity: Number(capacity),
      modalityId,
      defaultInstructorId: defaultInstructorId || null,
    };
    try {
      if (template) {
        await updateClassTemplate(template.id, {
          ...payload,
          description: description.trim() || null,
        });
      } else {
        await createClassTemplate({ ...payload, description: description.trim() || undefined });
      }
      onSaved();
    } catch (error) {
      setErrorMessage(
        error instanceof ApiError ? error.message : "Não foi possível salvar o template.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} aria-label="Template de aula" className="fb-form">
      {errorMessage && <Feedback tone="error">{errorMessage}</Feedback>}

      <label htmlFor={`${formId}-name`}>Nome</label>
      <input
        id={`${formId}-name`}
        className="fb-field"
        value={name}
        onChange={(event) => setName(event.target.value)}
        required
      />

      <label htmlFor={`${formId}-description`}>Descrição</label>
      <input
        id={`${formId}-description`}
        className="fb-field"
        value={description}
        onChange={(event) => setDescription(event.target.value)}
      />

      <label htmlFor={`${formId}-modality`}>Modalidade</label>
      <select
        id={`${formId}-modality`}
        className="fb-field"
        value={modalityId}
        onChange={(event) => setModalityId(event.target.value)}
        required
      >
        <option value="" disabled>
          Selecione
        </option>
        {modalityOptions.map((modality) => (
          <option key={modality.id} value={modality.id}>
            {modality.name}
          </option>
        ))}
      </select>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <label htmlFor={`${formId}-duration`}>Duração (min)</label>
          <input
            id={`${formId}-duration`}
            className="fb-field"
            type="number"
            min={1}
            value={durationMinutes}
            onChange={(event) => setDurationMinutes(event.target.value)}
            required
          />
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <label htmlFor={`${formId}-capacity`}>Capacidade</label>
          <input
            id={`${formId}-capacity`}
            className="fb-field"
            type="number"
            min={1}
            value={capacity}
            onChange={(event) => setCapacity(event.target.value)}
            required
          />
        </div>
      </div>

      <label htmlFor={`${formId}-instructor`}>Professor padrão</label>
      <select
        id={`${formId}-instructor`}
        className="fb-field"
        value={defaultInstructorId}
        onChange={(event) => setDefaultInstructorId(event.target.value)}
      >
        <option value="">Sem professor padrão</option>
        {instructorOptions.map((instructor) => (
          <option key={instructor.id} value={instructor.id}>
            {instructor.fullName}
          </option>
        ))}
      </select>

      <div style={{ display: "flex", gap: 10 }}>
        <button type="submit" className="fb-btn-primary" disabled={isSubmitting}>
          Salvar template
        </button>
        <button type="button" className="fb-row-btn" onClick={onCancel}>
          Cancelar
        </button>
      </div>
    </form>
  );
}
