import { useState, type FormEvent } from "react";
import { useMutation } from "@tanstack/react-query";
import { createPlanRequestSchema, type PlanDetail } from "@fitburn/contracts";
import { Alert } from "../../components/ui/Alert";
import { Button } from "../../components/ui/Button";
import { Dialog } from "../../components/ui/Dialog";
import { Field } from "../../components/ui/Field";
import { errorMessage } from "../../lib/auth/api";
import { createPlan, updatePlan } from "../../lib/plans/api";

interface PlanFormProps {
  /** O plano em edição; ausente para criar um novo. */
  plan?: PlanDetail;
  onSaved: () => void;
  onClose: () => void;
}

type FieldErrors = { name?: string; description?: string };

/**
 * Diálogo de plano (criar/editar, D-038 e #156): nome e descrição. Sem preço nem duração: o plano é informativo.
 * Os limites do contrato (nome obrigatório de até 80 caracteres, descrição de até 500) aparecem no campo, com
 * `aria-invalid`; a recusa da API (ex.: nome repetido) aparece no aviso do próprio diálogo.
 */
export function PlanForm({ plan, onSaved, onClose }: PlanFormProps) {
  const [name, setName] = useState(plan?.name ?? "");
  const [description, setDescription] = useState(plan?.description ?? "");
  const [errors, setErrors] = useState<FieldErrors>({});

  const saveMutation = useMutation({
    mutationFn: () =>
      plan
        ? updatePlan(plan.id, { name: name.trim(), description: description.trim() || null })
        : createPlan({ name: name.trim(), description: description.trim() || undefined }),
    onSuccess: onSaved,
  });

  function submit(event: FormEvent) {
    event.preventDefault();
    const parsed = createPlanRequestSchema.safeParse({ name, description });
    if (!parsed.success) {
      const next: FieldErrors = {};
      for (const issue of parsed.error.issues) {
        const field = issue.path[0];
        if ((field === "name" || field === "description") && !next[field])
          next[field] = issue.message;
      }
      setErrors(next);
      return;
    }
    setErrors({});
    saveMutation.mutate();
  }

  return (
    <Dialog title={plan ? "Editar plano" : "Novo plano"} onClose={onClose}>
      <form onSubmit={submit} noValidate aria-label="Plano" className="fb-ui-dialog__form">
        <Field
          label="Nome"
          placeholder="Ex.: Plano Performance"
          value={name}
          error={errors.name}
          onChange={(event) => setName(event.target.value)}
        />
        <Field
          label="Descrição"
          placeholder="O que o plano inclui"
          value={description}
          error={errors.description}
          onChange={(event) => setDescription(event.target.value)}
        />
        {saveMutation.isError && (
          <Alert>{errorMessage(saveMutation.error, "Não foi possível salvar o plano.")}</Alert>
        )}
        <div className="fb-ui-dialog__actions">
          <Button disabled={saveMutation.isPending} onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" variant="primary" busy={saveMutation.isPending}>
            Salvar
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
