import type { ReactNode } from "react";
import { useMutation } from "@tanstack/react-query";
import { Alert } from "../../components/ui/Alert";
import { Button } from "../../components/ui/Button";
import { Dialog } from "../../components/ui/Dialog";
import { errorMessage } from "../../lib/auth/api";
import { useNetworkRequired } from "../../lib/connectivity/useNetworkRequired";

interface ConfirmDeleteDialogProps {
  title: string;
  description: ReactNode;
  /** Mensagem quando o erro não vem da API (rede caiu no meio). */
  fallbackError: string;
  onConfirm: () => Promise<unknown>;
  onClose: () => void;
}

/**
 * Confirmação de exclusão da Loja. O foco inicial fica em "Cancelar", a saída segura. Se a API recusar (ex.: categoria
 * em uso), a mensagem dela aparece aqui dentro e o diálogo continua aberto; no sucesso, fecha. Sem conexão, o botão
 * de confirmar fica desabilitado.
 */
export function ConfirmDeleteDialog({
  title,
  description,
  fallbackError,
  onConfirm,
  onClose,
}: ConfirmDeleteDialogProps) {
  const { offline, reason } = useNetworkRequired();
  const mutation = useMutation({ mutationFn: onConfirm, onSuccess: onClose });

  return (
    <Dialog
      title={title}
      description={description}
      onClose={onClose}
      actions={
        <>
          <Button disabled={mutation.isPending} onClick={onClose}>
            Cancelar
          </Button>
          <Button
            variant="danger"
            busy={mutation.isPending}
            disabled={offline}
            aria-disabled={offline || undefined}
            title={offline ? reason : undefined}
            onClick={() => mutation.mutate()}
          >
            Confirmar exclusão
          </Button>
        </>
      }
    >
      {mutation.isError && <Alert>{errorMessage(mutation.error, fallbackError)}</Alert>}
    </Dialog>
  );
}
