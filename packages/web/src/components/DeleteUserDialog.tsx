import { useMutation } from "@tanstack/react-query";
import { ApiError } from "../lib/auth/api";
import { Modal } from "./Modal";

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
 * Confirmação da exclusão com anonimização (ClientesAdmin.dc.html): explica o
 * que acontece com os dados pessoais, com o histórico e que não há volta.
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
    <Modal title={`Excluir ${kind}?`} onClose={onClose}>
      <p className="fb-modal__text">
        <strong>{name}</strong> deixará a base ativa e perderá o acesso ao sistema. Por
        conformidade, os dados pessoais (nome, e-mail, telefone, data de nascimento, documento e
        endereço) serão <strong>anonimizados</strong> permanentemente. O histórico de aulas,
        reservas, presenças, pontos e planos é mantido, de forma anônima, para fins de relatório.{" "}
        <strong>Esta ação não pode ser desfeita.</strong>
      </p>
      {mutation.isError && (
        <p role="alert" className="fb-error-box">
          {mutation.error instanceof ApiError
            ? mutation.error.message
            : `Não foi possível excluir o ${kind}.`}
        </p>
      )}
      <div className="fb-modal__footer" style={{ justifyContent: "flex-end" }}>
        <button
          type="button"
          className="fb-btn-secondary"
          disabled={mutation.isPending}
          onClick={onClose}
        >
          Cancelar
        </button>
        <button
          type="button"
          className="fb-btn-danger"
          disabled={mutation.isPending}
          onClick={() => mutation.mutate()}
        >
          Excluir e anonimizar
        </button>
      </div>
    </Modal>
  );
}
