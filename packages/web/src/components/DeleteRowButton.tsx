import { useState } from "react";
import { ApiError } from "../lib/auth/api";
import { BlockedAction } from "./BlockedAction";
import { Alert } from "./ui/Alert";
import { Button } from "./ui/Button";
import { Dialog } from "./ui/Dialog";

interface DeleteRowButtonProps {
  /** O registro, para o nome do botão e do diálogo: "template Spinning" vira "Excluir template Spinning". */
  subject: string;
  onDelete: () => Promise<unknown>;
  /** Sem permissão de excluir: bloqueio padrão do BlockedAction. */
  allowed: boolean;
  deniedReason: string;
  /** Exclusão sabidamente impossível (ex.: registro em uso): botão esmaecido, sem ação. */
  inUseReason?: string;
}

/**
 * "Excluir" das tabelas administrativas (D-038, #156). O clique abre a confirmação (`Dialog`) com o foco em
 * "Cancelar", a saída segura. Se a API recusar a exclusão, a mensagem aparece no próprio diálogo, que continua aberto.
 */
export function DeleteRowButton({
  subject,
  onDelete,
  allowed,
  deniedReason,
  inUseReason,
}: DeleteRowButtonProps) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  async function handleConfirm() {
    setError(null);
    setIsDeleting(true);
    try {
      await onDelete();
      setOpen(false);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Não foi possível excluir.");
    } finally {
      setIsDeleting(false);
    }
  }

  function close() {
    setOpen(false);
    setError(null);
  }

  return (
    <>
      <BlockedAction allowed={allowed} reason={deniedReason}>
        <Button
          size="sm"
          variant="ghost-danger"
          aria-label={`Excluir ${subject}`}
          aria-disabled={inUseReason ? true : undefined}
          title={inUseReason}
          onClick={() => {
            if (!inUseReason) setOpen(true);
          }}
        >
          Excluir
        </Button>
      </BlockedAction>
      {open && (
        <Dialog
          title={`Excluir ${subject}?`}
          description="A exclusão é definitiva e não pode ser desfeita."
          onClose={close}
          actions={
            <>
              <Button disabled={isDeleting} onClick={close}>
                Cancelar
              </Button>
              <Button variant="danger" busy={isDeleting} onClick={() => void handleConfirm()}>
                Confirmar exclusão
              </Button>
            </>
          }
        >
          {error && <Alert>{error}</Alert>}
        </Dialog>
      )}
    </>
  );
}
