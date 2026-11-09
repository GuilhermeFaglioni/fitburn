import { useState, type FormEvent } from "react";
import type { ClassTemplateDetail, InstructorSummary, ModalityDetail } from "@fitburn/contracts";
import { ApiError } from "../../lib/auth/api";
import { createClassTemplate, updateClassTemplate } from "../../lib/catalog/api";
import { Alert } from "../../components/ui/Alert";
import { Button } from "../../components/ui/Button";
import { Dialog } from "../../components/ui/Dialog";
import { Field } from "../../components/ui/Field";
import { Select } from "../../components/ui/Select";

/** Criação e edição de um template de aula, em `Dialog` (D-038, #156). */
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
    <Dialog title={template ? "Editar template de aula" : "Novo template de aula"} onClose={onCancel}>
      <form onSubmit={handleSubmit} aria-label="Template de aula" className="fb-ui-dialog__form">
        <Field
          label="Nome"
          value={name}
          onChange={(event) => setName(event.target.value)}
          required
        />
        <Field
          label="Descrição"
          value={description}
          onChange={(event) => setDescription(event.target.value)}
        />
        <Select
          label="Modalidade"
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
        </Select>
        <div className="fb-ui-form-grid">
          <Field
            label="Duração (min)"
            type="number"
            min={1}
            value={durationMinutes}
            onChange={(event) => setDurationMinutes(event.target.value)}
            required
          />
          <Field
            label="Capacidade"
            type="number"
            min={1}
            value={capacity}
            onChange={(event) => setCapacity(event.target.value)}
            required
          />
        </div>
        <Select
          label="Professor padrão"
          value={defaultInstructorId}
          onChange={(event) => setDefaultInstructorId(event.target.value)}
        >
          <option value="">Sem professor padrão</option>
          {instructorOptions.map((instructor) => (
            <option key={instructor.id} value={instructor.id}>
              {instructor.fullName}
            </option>
          ))}
        </Select>
        {errorMessage && <Alert>{errorMessage}</Alert>}
        <div className="fb-ui-dialog__actions">
          <Button disabled={isSubmitting} onClick={onCancel}>
            Cancelar
          </Button>
          <Button type="submit" variant="primary" busy={isSubmitting}>
            Salvar template
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
