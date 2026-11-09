import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { GoalDetail } from "@fitburn/contracts";
import { Alert } from "../../components/ui/Alert";
import { Button } from "../../components/ui/Button";
import { Dialog } from "../../components/ui/Dialog";
import { errorMessage } from "../../lib/auth/api";
import { cancelGoal, completeGoal } from "../../lib/goals/api";

/** As duas ações que não se desfazem e pedem confirmação. */
const COPY = {
  complete: {
    title: "Concluir a meta",
    description: "Concluir a meta e dar os pontos ao aluno?",
    confirm: "Confirmar conclusão",
    failure: "Não foi possível concluir a meta.",
    run: completeGoal,
  },
  cancel: {
    title: "Cancelar a meta",
    description: "Cancelar esta meta? Ela não poderá ser reativada.",
    confirm: "Confirmar cancelamento",
    failure: "Não foi possível cancelar a meta.",
    run: cancelGoal,
  },
} as const;

interface GoalConfirmDialogProps {
  goal: GoalDetail;
  action: "complete" | "cancel";
  onClose: () => void;
  /** A ação deu certo e a lista já foi recarregada. */
  onDone: () => void;
}

/**
 * Confirmação de concluir ou cancelar uma meta (D-038, #156). O foco inicial fica em "Voltar", a saída segura. Se a
 * API recusar, o motivo aparece aqui dentro e o diálogo continua aberto; no sucesso, a lista é recarregada e ele fecha.
 */
export function GoalConfirmDialog({ goal, action, onClose, onDone }: GoalConfirmDialogProps) {
  const queryClient = useQueryClient();
  const copy = COPY[action];

  const mutation = useMutation({
    mutationFn: () => copy.run(goal.id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["goals"] });
      onDone();
    },
  });

  return (
    <Dialog
      title={`${copy.title} ${goal.title}?`}
      description={copy.description}
      onClose={onClose}
      actions={
        <>
          <Button disabled={mutation.isPending} onClick={onClose}>
            Voltar
          </Button>
          <Button
            variant={action === "cancel" ? "danger" : "primary"}
            busy={mutation.isPending}
            onClick={() => mutation.mutate()}
          >
            {copy.confirm}
          </Button>
        </>
      }
    >
      {mutation.isError && <Alert>{errorMessage(mutation.error, copy.failure)}</Alert>}
    </Dialog>
  );
}
