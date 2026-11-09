import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Module, PermissionAction, type ModalityDetail } from "@fitburn/contracts";
import { BlockedAction } from "../../components/BlockedAction";
import { DeleteRowButton } from "../../components/DeleteRowButton";
import { QueryBlockState } from "../../components/QueryBlockState";
import { Alert } from "../../components/ui/Alert";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { EmptyState } from "../../components/ui/States";
import { Table, type TableColumn } from "../../components/ui/Table";
import { Toolbar } from "../../components/ui/Toolbar";
import { useAuth } from "../../lib/auth/AuthContext";
import {
  activateModality,
  deactivateModality,
  deleteModality,
  listModalities,
} from "../../lib/catalog/api";
import { ModalityForm } from "./ModalityForm";

type FormState =
  | { mode: "closed" }
  | { mode: "create" }
  | { mode: "edit"; modality: ModalityDetail };

/** Modalidades (D-038, #156): tabela com as ações por linha; criar e editar abrem o `Dialog` do formulário. */
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

  const columns: TableColumn<ModalityDetail>[] = [
    {
      key: "name",
      header: "Nome",
      className: "fb-ui-table__name",
      cell: (modality) => (
        <span className="fb-ui-table__inline">
          {modality.name}
          {!modality.isActive && <Badge dot>INATIVO</Badge>}
        </span>
      ),
    },
    {
      key: "description",
      header: "Descrição",
      className: "fb-ui-table__muted",
      cell: (modality) => modality.description ?? "—",
    },
    {
      key: "templates",
      header: "Templates ativos",
      className: "fb-ui-table__muted",
      cell: (modality) => modality.activeTemplateCount,
    },
    {
      key: "actions",
      header: "Ações",
      actions: true,
      cell: (modality) => (
        <div className="fb-ui-row-actions">
          <BlockedAction allowed={canEdit} reason="Você não tem permissão para editar modalidades.">
            <Button
              size="sm"
              aria-label={`Editar modalidade ${modality.name}`}
              onClick={() => setForm({ mode: "edit", modality })}
            >
              Editar
            </Button>
          </BlockedAction>
          <BlockedAction allowed={canEdit} reason="Você não tem permissão para editar modalidades.">
            <Button
              size="sm"
              aria-label={`${modality.isActive ? "Desativar" : "Ativar"} modalidade ${modality.name}`}
              onClick={() => toggleMutation.mutate(modality)}
            >
              {modality.isActive ? "Desativar" : "Ativar"}
            </Button>
          </BlockedAction>
          <DeleteRowButton
            subject={`modalidade ${modality.name}`}
            inUseReason={
              modality.templateCount > 0
                ? "Esta modalidade tem templates vinculados — remova ou reatribua os templates primeiro."
                : undefined
            }
            allowed={canDelete}
            deniedReason="Você não tem permissão para excluir modalidades."
            onDelete={async () => {
              await deleteModality(modality.id);
              void invalidate();
            }}
          />
        </div>
      ),
    },
  ];

  return (
    <div className="fb-ui-page">
      <Toolbar>
        <div className="fb-ui-toolbar__end">
          <BlockedAction allowed={canCreate} reason="Você não tem permissão para criar modalidades.">
            <Button variant="primary" size="sm" onClick={() => setForm({ mode: "create" })}>
              + Nova modalidade
            </Button>
          </BlockedAction>
        </div>
      </Toolbar>

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

      <QueryBlockState
        query={modalitiesQuery}
        hasData={modalitiesQuery.data !== undefined}
        loading="Carregando modalidades…"
        error="Não foi possível carregar as modalidades."
      />
      {toggleMutation.isError && (
        <Alert>{toggleMutation.error.message || "Não foi possível alterar a modalidade."}</Alert>
      )}
      {modalitiesQuery.data && modalitiesQuery.data.length === 0 && (
        <EmptyState title="Nenhuma modalidade cadastrada." />
      )}
      {modalitiesQuery.data && modalitiesQuery.data.length > 0 && (
        <Table
          label="Modalidades"
          columns={columns}
          rows={modalitiesQuery.data}
          rowKey={(modality) => modality.id}
        />
      )}
      <p className="fb-ui-note">
        Modalidades com templates vinculados não podem ser excluídas — remova ou reatribua os
        templates primeiro.
      </p>
    </div>
  );
}
