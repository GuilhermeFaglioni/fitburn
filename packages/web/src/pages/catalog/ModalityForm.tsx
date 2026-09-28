import { useId, useState, type FormEvent } from "react";
import type { ModalityDetail } from "@fitburn/contracts";
import { ApiError } from "../../lib/auth/api";
import { createModality, updateModality } from "../../lib/catalog/api";

export function ModalityForm({
  modality,
  onSaved,
  onCancel,
}: {
  modality?: ModalityDetail;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const formId = useId();
  const [name, setName] = useState(modality?.name ?? "");
  const [description, setDescription] = useState(modality?.description ?? "");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage(null);
    setIsSubmitting(true);
    try {
      if (modality) {
        await updateModality(modality.id, { name, description: description.trim() || null });
      } else {
        await createModality({ name, description: description.trim() || undefined });
      }
      onSaved();
    } catch (error) {
      setErrorMessage(
        error instanceof ApiError ? error.message : "Não foi possível salvar a modalidade.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} aria-label="Modalidade" className="fb-form">
      {errorMessage && <p role="alert">{errorMessage}</p>}

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

      <div style={{ display: "flex", gap: 10 }}>
        <button type="submit" className="fb-btn-primary" disabled={isSubmitting}>
          Salvar modalidade
        </button>
        <button type="button" className="fb-row-btn" onClick={onCancel}>
          Cancelar
        </button>
      </div>
    </form>
  );
}
