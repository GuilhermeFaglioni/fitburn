import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { PlanDetail } from "@fitburn/contracts";
import { Alert } from "../../components/ui/Alert";
import { Button } from "../../components/ui/Button";
import { Dialog } from "../../components/ui/Dialog";
import { errorMessage } from "../../lib/auth/api";
import { setPlanActive } from "../../lib/plans/api";

/**
 * Confirmação de ativar ou desativar um plano (D-038, #156). O foco inicial fica em "Cancelar", a saída segura. Se a
 * API recusar, a mensagem aparece aqui dentro e o diálogo continua aberto; no sucesso, a lista é recarregada e ele fecha.
 */
export function PlanToggleDialog({ plan, onClose }: { plan: PlanDetail; onClose: () => void }) {
  const queryClient = useQueryClient();
  const activating = !plan.isActive;

  const toggleMutation = useMutation({
    mutationFn: () => setPlanActive(plan.id, activating),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["plans"] });
      onClose();
    },
  });

  return (
    <Dialog
      title={`${activating ? "Ativar" : "Desativar"} o plano ${plan.name}?`}
      description={
        activating
          ? "O plano volta a poder ser atribuído a clientes."
          : "O plano deixa de poder ser atribuído a novos clientes. As atribuições que já existem não mudam."
      }
      onClose={onClose}
      actions={
        <>
          <Button disabled={toggleMutation.isPending} onClick={onClose}>
            Cancelar
          </Button>
          <Button
            variant="primary"
            busy={toggleMutation.isPending}
            onClick={() => toggleMutation.mutate()}
          >
            {activating ? "Confirmar ativação" : "Confirmar desativação"}
          </Button>
        </>
      }
    >
      {toggleMutation.isError && (
        <Alert>{errorMessage(toggleMutation.error, "Não foi possível alterar o plano.")}</Alert>
      )}
    </Dialog>
  );
}
