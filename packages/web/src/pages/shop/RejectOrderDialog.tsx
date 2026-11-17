import { useState } from "react";
import type { AdminShopOrder } from "@fitburn/contracts";
import { Alert } from "../../components/ui/Alert";
import { Button } from "../../components/ui/Button";
import { Dialog } from "../../components/ui/Dialog";
import { Textarea } from "../../components/ui/Textarea";
import { errorMessage } from "../../lib/auth/api";
import { useNetworkRequired } from "../../lib/connectivity/useNetworkRequired";
import { useRejectOrder } from "../../lib/shop/admin-orders-api";
import { formatOrderNumber } from "../../lib/shop/orders-api";

/** Limite do motivo, o mesmo do contrato (`rejectShopOrderRequestSchema`). */
const REASON_MAX_LENGTH = 500;

/**
 * Recusa de pedido (#200): motivo opcional para o cliente. Se a API recusar (ex.: o pedido já foi aprovado por outra
 * pessoa), a mensagem dela aparece dentro e o diálogo continua aberto; no sucesso, fecha. Sem conexão, "Recusar
 * pedido" fica desabilitado.
 */
export function RejectOrderDialog({ order, onClose }: { order: AdminShopOrder; onClose: () => void }) {
  const { offline, reason: offlineReason } = useNetworkRequired();
  const [reason, setReason] = useState("");
  const mutation = useRejectOrder();

  return (
    <Dialog
      title={`Recusar pedido ${formatOrderNumber(order.number)}`}
      description="As unidades voltam ao estoque e o cliente vê o pedido como recusado."
      onClose={onClose}
      actions={
        <>
          <Button disabled={mutation.isPending} onClick={onClose}>
            Voltar
          </Button>
          <Button
            variant="danger"
            busy={mutation.isPending}
            disabled={offline}
            aria-disabled={offline || undefined}
            title={offline ? offlineReason : undefined}
            onClick={() => mutation.mutate({ id: order.id, reason }, { onSuccess: onClose })}
          >
            Recusar pedido
          </Button>
        </>
      }
    >
      <Textarea
        label="Motivo para o cliente (opcional)"
        value={reason}
        maxLength={REASON_MAX_LENGTH}
        onChange={(event) => setReason(event.target.value)}
      />
      {mutation.isError && <Alert>{errorMessage(mutation.error, "Não foi possível recusar o pedido.")}</Alert>}
    </Dialog>
  );
}
