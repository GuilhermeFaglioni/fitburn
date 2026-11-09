import { useState, type FormEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createGoalRequestSchema, type GoalDetail } from "@fitburn/contracts";
import { Alert } from "../../components/ui/Alert";
import { Button } from "../../components/ui/Button";
import { Dialog } from "../../components/ui/Dialog";
import { Field } from "../../components/ui/Field";
import { errorMessage } from "../../lib/auth/api";
import { createGoal, updateGoal } from "../../lib/goals/api";

interface GoalFormProps {
  /** O aluno da meta nova. */
  clientId: string;
  /** A meta em edição; ausente para criar uma nova. */
  goal?: GoalDetail;
  onClose: () => void;
}

type FieldErrors = { title?: string; description?: string; dueDate?: string };

/**
 * Diálogo de meta (criar ou editar uma meta ativa, D-038 e #156): título, descrição e prazo. Os limites do contrato
 * (título obrigatório de até 120 caracteres, descrição de até 500) aparecem no campo, com `aria-invalid`; o foco vai
 * ao primeiro campo com erro. A recusa da API fica no aviso do próprio diálogo, que continua aberto com o que foi
 * digitado. No sucesso, as metas são recarregadas e o diálogo fecha.
 */
export function GoalForm({ clientId, goal, onClose }: GoalFormProps) {
  const queryClient = useQueryClient();
  const [title, setTitle] = useState(goal?.title ?? "");
  const [description, setDescription] = useState(goal?.description ?? "");
  const [dueDate, setDueDate] = useState(goal?.dueDate ?? "");
  const [errors, setErrors] = useState<FieldErrors>({});

  const saveMutation = useMutation({
    mutationFn: () =>
      goal
        ? updateGoal(goal.id, {
            title: title.trim(),
            description: description.trim() || null,
            dueDate: dueDate || null,
          })
        : createGoal({
            clientId,
            title: title.trim(),
            ...(description.trim() ? { description: description.trim() } : {}),
            ...(dueDate ? { dueDate } : {}),
          }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["goals"] });
      onClose();
    },
  });

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = createGoalRequestSchema.safeParse({
      clientId,
      title,
      description,
      ...(dueDate ? { dueDate } : {}),
    });
    if (!parsed.success) {
      const next: FieldErrors = {};
      for (const issue of parsed.error.issues) {
        const field = issue.path[0];
        if ((field === "title" || field === "description" || field === "dueDate") && !next[field])
          next[field] = issue.message;
      }
      setErrors(next);
      const first = (["title", "description", "dueDate"] as const).find((name) => next[name]);
      const input = first
        ? event.currentTarget.querySelector<HTMLInputElement>(`[data-field="${first}"]`)
        : null;
      input?.focus();
      return;
    }
    setErrors({});
    saveMutation.mutate();
  }

  return (
    <Dialog title={goal ? "Editar meta" : "Nova meta"} onClose={onClose}>
      <form onSubmit={submit} noValidate aria-label="Meta" className="fb-ui-dialog__form">
        <Field
          label="Título"
          placeholder="Ex.: Frequentar 10 aulas no mês"
          data-field="title"
          value={title}
          error={errors.title}
          onChange={(event) => setTitle(event.target.value)}
        />
        <Field
          label="Descrição"
          placeholder="Detalhe opcional sobre a meta"
          data-field="description"
          value={description}
          error={errors.description}
          onChange={(event) => setDescription(event.target.value)}
        />
        <Field
          label="Prazo"
          type="date"
          data-field="dueDate"
          value={dueDate}
          error={errors.dueDate}
          onChange={(event) => setDueDate(event.target.value)}
        />
        {saveMutation.isError && (
          <Alert>
            {errorMessage(
              saveMutation.error,
              goal ? "Não foi possível salvar a meta." : "Não foi possível criar a meta.",
            )}
          </Alert>
        )}
        <div className="fb-ui-dialog__actions">
          <Button disabled={saveMutation.isPending} onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" variant="primary" busy={saveMutation.isPending}>
            {goal ? "Salvar" : "Criar meta"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
