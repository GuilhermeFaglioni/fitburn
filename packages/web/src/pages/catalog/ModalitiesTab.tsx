import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Module, PermissionAction, type ModalityDetail } from "@fitburn/contracts";
import { BlockedAction } from "../../components/BlockedAction";
import { DeleteRowButton } from "../../components/DeleteRowButton";
import { useAuth } from "../../lib/auth/AuthContext";
import {
  activateModality,
  deactivateModality,
  deleteModality,
  listModalities,
} from "../../lib/catalog/api";
import { ModalityForm } from "./ModalityForm";
import { EmptyState, ErrorState, Feedback, LoadingState } from "../../components/states";

type FormState =
  { mode: "closed" } | { mode: "create" } | { mode: "edit"; modality: ModalityDetail };

export function ModalitiesTab() {
  const { can } = useAuth();
  const queryClient = useQueryClient();
  const [form, setForm] = useState<FormState>({ mode: "closed" });

  const modalitiesQuery = useQuery({ queryKey: ["modalities"], queryFn: listModalities });

  function invalidate() {
    return queryClient.invalidateQueries({ queryKey: ["modalities"] });
  }

  const toggleMutation = useMutation({
    mutationFn: (modality: ModalityDetail) =>
      modality.isActive ? deactivateModality(modality.id) : activateModality(modality.id),
    onSuccess: invalidate,
  });

  const canCreate = can(Module.TEMPLATES_DE_AULA, PermissionAction.CREATE);
  const canEdit = can(Module.TEMPLATES_DE_AULA, PermissionAction.EDIT);
  const canDelete = can(Module.TEMPLATES_DE_AULA, PermissionAction.DELETE);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14, flexGrow: 1, minHeight: 0 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end" }}>
        <BlockedAction allowed={canCreate} reason="Você não tem permissão para criar modalidades.">
          <button
            type="button"
            className="fb-btn-primary"
            onClick={() =>
              setForm(form.mode === "create" ? { mode: "closed" } : { mode: "create" })
            }
          >
            + Nova modalidade
          </button>
        </BlockedAction>
      </div>

      {form.mode !== "closed" && (
        <ModalityForm
          key={form.mode === "edit" ? form.modality.id : "new"}
          modality={form.mode === "edit" ? form.modality : undefined}
          onSaved={() => {
            setForm({ mode: "closed" });
            void invalidate();
          }}
          onCancel={() => setForm({ mode: "closed" })}
        />
      )}

      {modalitiesQuery.isLoading && <LoadingState />}
      {modalitiesQuery.isError && (
        <ErrorState
          message="Não foi possível carregar as modalidades."
          onRetry={() => void modalitiesQuery.refetch()}
        />
      )}
      {toggleMutation.isError && (
        <Feedback tone="error">
          {toggleMutation.error.message || "Não foi possível alterar a modalidade."}
        </Feedback>
      )}
      {modalitiesQuery.data && modalitiesQuery.data.length === 0 && (
        <EmptyState message="Nenhuma modalidade cadastrada." />
      )}

      {modalitiesQuery.data && modalitiesQuery.data.length > 0 && (
        <div className="fb-table-wrap">
          <table>
            <thead>
              <tr>
                <th className="fb-th">Nome</th>
                <th className="fb-th">Descrição</th>
                <th className="fb-th">Templates ativos</th>
                <th className="fb-th" style={{ textAlign: "right" }}>
                  Ações
                </th>
              </tr>
            </thead>
            <tbody>
              {modalitiesQuery.data.map((modality) => (
                <tr key={modality.id}>
                  <td
                    className="fb-td"
                    style={{ fontWeight: 500, color: modality.isActive ? undefined : "#8a8a8a" }}
                  >
                    {modality.name}
                    {!modality.isActive && (
                      <span className="fb-badge fb-badge--inactive" style={{ marginLeft: 8 }}>
                        INATIVO
                      </span>
                    )}
                  </td>
                  <td className="fb-td" style={{ color: "#5a5a5a" }}>
                    {modality.description ?? "—"}
                  </td>
                  <td className="fb-td" style={{ color: "#5a5a5a" }}>
                    {modality.activeTemplateCount}
                  </td>
                  <td
                    className="fb-td"
                    style={{ textAlign: "right", position: "relative", whiteSpace: "nowrap" }}
                  >
                    <BlockedAction
                      allowed={canEdit}
                      reason="Você não tem permissão para editar modalidades."
                    >
                      <button
                        type="button"
                        className="fb-row-btn"
                        onClick={() => setForm({ mode: "edit", modality })}
                      >
                        Editar
                      </button>
                    </BlockedAction>
                    <BlockedAction
                      allowed={canEdit}
                      reason="Você não tem permissão para editar modalidades."
                    >
                      <button
                        type="button"
                        className="fb-row-btn"
                        onClick={() => toggleMutation.mutate(modality)}
                      >
                        {modality.isActive ? "Desativar" : "Ativar"}
                      </button>
                    </BlockedAction>
                    <DeleteRowButton
                      inUseReason={
                        modality.templateCount > 0
                          ? "Esta modalidade tem templates vinculados — remova ou reatribua os templates primeiro."
                          : undefined
                      }
                      allowed={canDelete}
                      deniedReason="Você não tem permissão para excluir modalidades."
                      onDelete={async () => {
                        await deleteModality(modality.id);
                        invalidate();
                      }}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <span className="fb-note">
        Modalidades com templates vinculados não podem ser excluídas — remova ou reatribua os
        templates primeiro.
      </span>
    </div>
  );
}
