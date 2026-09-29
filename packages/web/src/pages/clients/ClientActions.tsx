import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Module, PermissionAction, UserStatus, type ClientListItem } from "@fitburn/contracts";
import { BlockedAction } from "../../components/BlockedAction";
import { Modal } from "../../components/Modal";
import { errorMessage } from "../../lib/auth/api";
import { useAuth } from "../../lib/auth/AuthContext";
import { deactivateClient, reactivateClient } from "../../lib/clients/api";
import { ClientFormModal } from "./ClientFormModal";

type ClientSummary = Pick<ClientListItem, "id" | "fullName" | "status">;

/**
 * As ações sobre um cliente (editar, desativar, reativar), com os diálogos que
 * elas abrem. Usada na linha da lista e no cabeçalho do detalhe, com os botões
 * de cada um (`className`). Ponto de extensão da exclusão com anonimização
 * (#43): o botão "Excluir" e o diálogo de confirmação entram aqui, ao lado das
 * demais ações, e valem nas duas telas.
 */
export function ClientActions({
  client,
  buttonClassName = "fb-row-btn",
}: {
  client: ClientSummary;
  buttonClassName?: string;
}) {
  const { can } = useAuth();
  const queryClient = useQueryClient();
  const [dialog, setDialog] = useState<"edit" | "deactivate" | null>(null);
  const canEdit = can(Module.CLIENTES, PermissionAction.EDIT);

  const reactivateMutation = useMutation({
    mutationFn: () => reactivateClient(client.id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["clients"] }),
  });

  const reason = "Você não tem permissão para alterar clientes.";
  const isActive = client.status === UserStatus.ACTIVE;

  return (
    <>
      <BlockedAction allowed={canEdit} reason={reason}>
        <button type="button" className={buttonClassName} onClick={() => setDialog("edit")}>
          Editar
        </button>
      </BlockedAction>
      <BlockedAction allowed={canEdit} reason={reason}>
        {isActive ? (
          <button type="button" className={buttonClassName} onClick={() => setDialog("deactivate")}>
            Desativar
          </button>
        ) : (
          <button
            type="button"
            className={buttonClassName}
            disabled={reactivateMutation.isPending}
            onClick={() => reactivateMutation.mutate()}
          >
            Reativar
          </button>
        )}
      </BlockedAction>
      {reactivateMutation.isError && (
        <span role="alert" className="fb-note">
          {errorMessage(reactivateMutation.error, "Não foi possível reativar o cliente.")}
        </span>
      )}

      {dialog === "edit" && (
        <ClientFormModal clientId={client.id} onClose={() => setDialog(null)} />
      )}
      {dialog === "deactivate" && (
        <DeactivateClientModal client={client} onClose={() => setDialog(null)} />
      )}
    </>
  );
}

function DeactivateClientModal({
  client,
  onClose,
}: {
  client: ClientSummary;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: () => deactivateClient(client.id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["clients"] });
      onClose();
    },
  });

  return (
    <Modal title="Desativar cliente?" onClose={onClose}>
      <p className="fb-modal__text">
        {client.fullName} não poderá entrar nem reservar aulas, e as sessões abertas são encerradas.
        As reservas já existentes são mantidas: cabe a você decidir o que fazer com elas. Você pode
        reativar o cliente quando quiser.
      </p>
      {mutation.isError && (
        <p role="alert" className="fb-error-box">
          {errorMessage(mutation.error, "Não foi possível desativar o cliente.")}
        </p>
      )}
      <div className="fb-modal__footer" style={{ justifyContent: "flex-end" }}>
        <button type="button" className="fb-btn-secondary" onClick={onClose}>
          Cancelar
        </button>
        <button
          type="button"
          className="fb-btn-danger"
          disabled={mutation.isPending}
          onClick={() => mutation.mutate()}
        >
          Desativar cliente
        </button>
      </div>
    </Modal>
  );
}
