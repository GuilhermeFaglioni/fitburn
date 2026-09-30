import { useId, useState, type FormEvent } from "react";
import { useMutation } from "@tanstack/react-query";
import type { PlanDetail } from "@fitburn/contracts";
import { Modal } from "../../components/Modal";
import { errorMessage } from "../../lib/auth/api";
import { createPlan, updatePlan } from "../../lib/plans/api";
import { Feedback } from "../../components/states";

interface PlanFormProps {
  /** O plano em edição; ausente para criar um novo. */
  plan?: PlanDetail;
  onSaved: () => void;
  onClose: () => void;
}

/** Diálogo de plano (criar/editar): nome e descrição. Sem preço nem duração: o plano é informativo. */
export function PlanForm({ plan, onSaved, onClose }: PlanFormProps) {
  const id = useId();
  const [name, setName] = useState(plan?.name ?? "");
  const [description, setDescription] = useState(plan?.description ?? "");

  const saveMutation = useMutation({
    mutationFn: () =>
      plan
        ? updatePlan(plan.id, { name: name.trim(), description: description.trim() || null })
        : createPlan({ name: name.trim(), description: description.trim() || undefined }),
    onSuccess: onSaved,
  });

  function submit(event: FormEvent) {
    event.preventDefault();
    saveMutation.mutate();
  }

  return (
    <Modal title={plan ? "Editar plano" : "Novo plano"} onClose={onClose}>
      <form onSubmit={submit} style={{ display: "contents" }}>
        <div className="fb-modal__field">
          <label htmlFor={`${id}-name`}>Nome</label>
          <input
            id={`${id}-name`}
            type="text"
            className="fb-field"
            placeholder="Ex.: Plano Performance"
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </div>
        <div className="fb-modal__field">
          <label htmlFor={`${id}-description`}>Descrição</label>
          <input
            id={`${id}-description`}
            type="text"
            className="fb-field"
            placeholder="O que o plano inclui"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
          />
        </div>
        {saveMutation.isError && (
          <Feedback tone="error">
            {errorMessage(saveMutation.error, "Não foi possível salvar o plano.")}
          </Feedback>
        )}
        <div className="fb-modal__footer fb-modal__footer--end">
          <button type="button" className="fb-btn-secondary" onClick={onClose}>
            Cancelar
          </button>
          <button
            type="submit"
            className="fb-btn-primary fb-btn-primary--sm"
            disabled={name.trim() === "" || saveMutation.isPending}
          >
            Salvar
          </button>
        </div>
      </form>
    </Modal>
  );
}
