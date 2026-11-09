import { useState, type FormEvent } from "react";
import type { ModalityDetail } from "@fitburn/contracts";
import { ApiError } from "../../lib/auth/api";
import { createModality, updateModality } from "../../lib/catalog/api";
import { Alert } from "../../components/ui/Alert";
import { Button } from "../../components/ui/Button";
import { Dialog } from "../../components/ui/Dialog";
import { Field } from "../../components/ui/Field";

/** Criação e edição de uma modalidade, em `Dialog` (D-038, #156). */
export function ModalityForm({
  modality,
  onSaved,
  onCancel,
}: {
  modality?: ModalityDetail;
  onSaved: () => void;
  onCancel: () => void;
}) {
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
    <Dialog title={modality ? "Editar modalidade" : "Nova modalidade"} onClose={onCancel}>
      <form onSubmit={handleSubmit} aria-label="Modalidade" className="fb-ui-dialog__form">
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
        {errorMessage && <Alert>{errorMessage}</Alert>}
        <div className="fb-ui-dialog__actions">
          <Button disabled={isSubmitting} onClick={onCancel}>
            Cancelar
          </Button>
          <Button type="submit" variant="primary" busy={isSubmitting}>
            Salvar modalidade
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
