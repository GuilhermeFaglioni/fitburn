import { useMutation } from "@tanstack/react-query";
import { ApiError } from "../lib/auth/api";
import { Alert } from "./ui/Alert";
import { Button } from "./ui/Button";
import { Dialog } from "./ui/Dialog";

interface DeleteUserDialogProps {
  /** Quem será excluído: cliente ou membro da equipe. */
  kind: "cliente" | "usuário";
  name: string;
  /** Chama a exclusão; se a API recusar, a mensagem aparece aqui e o diálogo continua aberto. */
  onConfirm: () => Promise<unknown>;
  /** Chamado ao concluir a exclusão. */
  onDeleted: () => void;
  onClose: () => void;
}

/**
 * Confirmação da exclusão com anonimização (`Dialog`, D-038): explica o que acontece com os dados pessoais, com o
 * histórico e que não há volta. O foco inicial cai em "Cancelar", a saída segura.
 */
export function DeleteUserDialog({
  kind,
  name,
  onConfirm,
  onDeleted,
  onClose,
}: DeleteUserDialogProps) {
  const mutation = useMutation({ mutationFn: onConfirm, onSuccess: onDeleted });

  return (
    <Dialog
      title={`Excluir ${kind}?`}
      onClose={onClose}
      description={
        <>
          {name} será removido(a) da base ativa. Por conformidade, os dados pessoais (nome, e-mail,
          telefone, CPF, endereço) serão <strong>anonimizados</strong> permanentemente. O histórico
          de aulas, reservas e pontuação é mantido, de forma anônima, para fins de relatório. Esta
          ação não pode ser desfeita.
        </>
      }
      actions={
        <>
          <Button disabled={mutation.isPending} onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="danger" busy={mutation.isPending} onClick={() => mutation.mutate()}>
            Excluir e anonimizar
          </Button>
        </>
      }
    >
      {mutation.isError && (
        <Alert>
          {mutation.error instanceof ApiError
            ? mutation.error.message
            : `Não foi possível excluir o ${kind}.`}
        </Alert>
      )}
    </Dialog>
  );
}
