import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Module, PermissionAction, type ClassTemplateDetail } from "@fitburn/contracts";
import { BlockedAction } from "../../components/BlockedAction";
import { DeleteRowButton } from "../../components/DeleteRowButton";
import { useAuth } from "../../lib/auth/AuthContext";
import {
  deleteClassTemplate,
  listClassTemplates,
  listInstructors,
  listModalities,
  activateClassTemplate,
  deactivateClassTemplate,
} from "../../lib/catalog/api";
import { ClassTemplateForm } from "./ClassTemplateForm";
import { EmptyState, ErrorState, Feedback, LoadingState } from "../../components/states";

type FormState =
  { mode: "closed" } | { mode: "create" } | { mode: "edit"; template: ClassTemplateDetail };

export function ClassTemplatesTab() {
  const { can } = useAuth();
  const queryClient = useQueryClient();
  const [form, setForm] = useState<FormState>({ mode: "closed" });

  const templatesQuery = useQuery({ queryKey: ["class-templates"], queryFn: listClassTemplates });
  const modalitiesQuery = useQuery({ queryKey: ["modalities"], queryFn: listModalities });
  const instructorsQuery = useQuery({ queryKey: ["instructors"], queryFn: listInstructors });

  function invalidate() {
    return Promise.all([
      queryClient.invalidateQueries({ queryKey: ["class-templates"] }),
      queryClient.invalidateQueries({ queryKey: ["modalities"] }),
    ]);
  }

  const toggleMutation = useMutation({
    mutationFn: (template: ClassTemplateDetail) =>
      template.isActive ? deactivateClassTemplate(template.id) : activateClassTemplate(template.id),
    onSuccess: invalidate,
  });

  const canCreate = can(Module.TEMPLATES_DE_AULA, PermissionAction.CREATE);
  const canEdit = can(Module.TEMPLATES_DE_AULA, PermissionAction.EDIT);
  const canDelete = can(Module.TEMPLATES_DE_AULA, PermissionAction.DELETE);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14, flexGrow: 1, minHeight: 0 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end" }}>
        <BlockedAction allowed={canCreate} reason="Você não tem permissão para criar templates.">
          <button
            type="button"
            className="fb-btn-primary"
            onClick={() =>
              setForm(form.mode === "create" ? { mode: "closed" } : { mode: "create" })
            }
          >
            + Novo template
          </button>
        </BlockedAction>
      </div>

      {form.mode !== "closed" && (
        <ClassTemplateForm
          key={form.mode === "edit" ? form.template.id : "new"}
          template={form.mode === "edit" ? form.template : undefined}
          modalities={modalitiesQuery.data ?? []}
          instructors={instructorsQuery.data ?? []}
          onSaved={() => {
            setForm({ mode: "closed" });
            void invalidate();
          }}
          onCancel={() => setForm({ mode: "closed" })}
        />
      )}

      {templatesQuery.isLoading && <LoadingState />}
      {templatesQuery.isError && (
        <ErrorState
          message="Não foi possível carregar os templates."
          onRetry={() => void templatesQuery.refetch()}
        />
      )}
      {toggleMutation.isError && (
        <Feedback tone="error">
          {toggleMutation.error.message || "Não foi possível alterar o template."}
        </Feedback>
      )}
      {templatesQuery.data && templatesQuery.data.length === 0 && (
        <EmptyState message="Nenhum template cadastrado." />
      )}

      {templatesQuery.data && templatesQuery.data.length > 0 && (
        <div className="fb-table-wrap">
          <table>
            <thead>
              <tr>
                <th className="fb-th">Nome</th>
                <th className="fb-th">Modalidade</th>
                <th className="fb-th">Duração</th>
                <th className="fb-th">Capacidade</th>
                <th className="fb-th">Professor padrão</th>
                <th className="fb-th" style={{ textAlign: "right" }}>
                  Ações
                </th>
              </tr>
            </thead>
            <tbody>
              {templatesQuery.data.map((template) => (
                <tr key={template.id}>
                  <td
                    className="fb-td"
                    style={{ fontWeight: 500, color: template.isActive ? undefined : "#8a8a8a" }}
                  >
                    {template.name}
                    {!template.isActive && (
                      <span className="fb-badge fb-badge--inactive" style={{ marginLeft: 8 }}>
                        INATIVO
                      </span>
                    )}
                  </td>
                  <td className="fb-td">{template.modality.name}</td>
                  <td className="fb-td" style={{ color: "#5a5a5a" }}>
                    {template.durationMinutes} min
                  </td>
                  <td className="fb-td" style={{ color: "#5a5a5a" }}>
                    {template.capacity} vagas
                  </td>
                  <td className="fb-td" style={{ color: "#5a5a5a" }}>
                    {template.defaultInstructor
                      ? `Prof. ${template.defaultInstructor.fullName}`
                      : "—"}
                  </td>
                  <td
                    className="fb-td"
                    style={{ textAlign: "right", position: "relative", whiteSpace: "nowrap" }}
                  >
                    <BlockedAction
                      allowed={canEdit}
                      reason="Você não tem permissão para editar templates."
                    >
                      <button
                        type="button"
                        className="fb-row-btn"
                        onClick={() => setForm({ mode: "edit", template })}
                      >
                        Editar
                      </button>
                    </BlockedAction>
                    <BlockedAction
                      allowed={canEdit}
                      reason="Você não tem permissão para editar templates."
                    >
                      <button
                        type="button"
                        className="fb-row-btn"
                        onClick={() => toggleMutation.mutate(template)}
                      >
                        {template.isActive ? "Desativar" : "Ativar"}
                      </button>
                    </BlockedAction>
                    <DeleteRowButton
                      allowed={canDelete}
                      deniedReason="Você não tem permissão para excluir templates."
                      onDelete={async () => {
                        await deleteClassTemplate(template.id);
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
    </div>
  );
}
