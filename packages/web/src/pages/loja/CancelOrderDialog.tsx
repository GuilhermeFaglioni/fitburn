import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Alert } from "../../components/ui/Alert";
import { Button } from "../../components/ui/Button";
import { Dialog } from "../../components/ui/Dialog";
import { errorMessage } from "../../lib/auth/api";
import { useNetworkRequired } from "../../lib/connectivity/useNetworkRequired";
import { cancelMyOrder, formatOrderNumber, orderKeys } from "../../lib/shop/orders-api";

/**
 * Confirmação de cancelamento do pedido (L6, #199). O foco inicial fica em "Manter pedido", a saída segura. Se a
 * API recusar (ex.: a academia aprovou nesse meio tempo), a mensagem dela aparece aqui e o pedido é recarregado;
 * no sucesso, lista e detalhe são atualizados e o diálogo fecha. Sem conexão, "Cancelar pedido" fica desabilitado.
 */
export function CancelOrderDialog({
  orderId,
  orderNumber,
  onClose,
}: {
  orderId: string;
  orderNumber: number;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const { offline, reason } = useNetworkRequired();
  const mutation = useMutation({
    mutationFn: () => cancelMyOrder(orderId),
    onSuccess: (order) => {
      queryClient.setQueryData(orderKeys.detail(orderId), order);
      void queryClient.invalidateQueries({ queryKey: orderKeys.all });
      onClose();
    },
    onError: () => void queryClient.invalidateQueries({ queryKey: orderKeys.all }),
  });

  return (
    <Dialog
      title={`Cancelar o pedido ${formatOrderNumber(orderNumber)}?`}
      description="Os itens separados voltam para o estoque. Esta ação não pode ser desfeita."
      onClose={onClose}
      actions={
        <>
          <Button disabled={mutation.isPending} onClick={onClose}>
            Manter pedido
          </Button>
          <Button
            variant="danger"
            busy={mutation.isPending}
            disabled={offline}
            aria-disabled={offline || undefined}
            title={offline ? reason : undefined}
            onClick={() => mutation.mutate()}
          >
            Cancelar pedido
          </Button>
        </>
      }
    >
      {mutation.isError && (
        <Alert>{errorMessage(mutation.error, "Não foi possível cancelar o pedido. Tente de novo.")}</Alert>
      )}
    </Dialog>
  );
}
