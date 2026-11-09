import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Module, PermissionAction, type ClassTemplateDetail } from "@fitburn/contracts";
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
import { professorLabel } from "../../lib/names";
import {
  deleteClassTemplate,
  listClassTemplates,
  listInstructors,
  listModalities,
  activateClassTemplate,
  deactivateClassTemplate,
} from "../../lib/catalog/api";
import { ClassTemplateForm } from "./ClassTemplateForm";

type FormState =
  | { mode: "closed" }
  | { mode: "create" }
  | { mode: "edit"; template: ClassTemplateDetail };

/** Templates de aula (D-038, #156): tabela com as ações por linha; criar e editar abrem o `Dialog` do formulário. */
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

  // Se dois templates têm professores com o mesmo primeiro nome, a tabela mostra o nome completo.
  const instructorNames = (templatesQuery.data ?? []).flatMap((template) =>
    template.defaultInstructor ? [template.defaultInstructor.fullName] : [],
  );

  const columns: TableColumn<ClassTemplateDetail>[] = [
    {
      key: "name",
      header: "Nome",
      className: "fb-ui-table__name",
      cell: (template) => (
        <span className="fb-ui-table__inline">
          {template.name}
          {!template.isActive && <Badge dot>INATIVO</Badge>}
        </span>
      ),
    },
    { key: "modality", header: "Modalidade", cell: (template) => template.modality.name },
    {
      key: "duration",
      header: "Duração",
      className: "fb-ui-table__muted",
      cell: (template) => `${template.durationMinutes} min`,
    },
    {
      key: "capacity",
      header: "Capacidade",
      className: "fb-ui-table__muted",
      cell: (template) => `${template.capacity} vagas`,
    },
    {
      key: "instructor",
      header: "Professor padrão",
      className: "fb-ui-table__muted",
      cell: (template) =>
        template.defaultInstructor
          ? professorLabel(template.defaultInstructor.fullName, instructorNames)
          : "—",
    },
    {
      key: "actions",
      header: "Ações",
      actions: true,
      cell: (template) => (
        <div className="fb-ui-row-actions">
          <BlockedAction allowed={canEdit} reason="Você não tem permissão para editar templates.">
            <Button
              size="sm"
              aria-label={`Editar template ${template.name}`}
              onClick={() => setForm({ mode: "edit", template })}
            >
              Editar
            </Button>
          </BlockedAction>
          <BlockedAction allowed={canEdit} reason="Você não tem permissão para editar templates.">
            <Button
              size="sm"
              aria-label={`${template.isActive ? "Desativar" : "Ativar"} template ${template.name}`}
              onClick={() => toggleMutation.mutate(template)}
            >
              {template.isActive ? "Desativar" : "Ativar"}
            </Button>
          </BlockedAction>
          <DeleteRowButton
            subject={`template ${template.name}`}
            allowed={canDelete}
            deniedReason="Você não tem permissão para excluir templates."
            onDelete={async () => {
              await deleteClassTemplate(template.id);
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
          <BlockedAction allowed={canCreate} reason="Você não tem permissão para criar templates.">
            <Button variant="primary" size="sm" onClick={() => setForm({ mode: "create" })}>
              + Novo template
            </Button>
          </BlockedAction>
        </div>
      </Toolbar>

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

      <QueryBlockState
        query={templatesQuery}
        hasData={templatesQuery.data !== undefined}
        loading="Carregando templates…"
        error="Não foi possível carregar os templates."
      />
      {toggleMutation.isError && (
        <Alert>{toggleMutation.error.message || "Não foi possível alterar o template."}</Alert>
      )}
      {templatesQuery.data && templatesQuery.data.length === 0 && (
        <EmptyState title="Nenhum template cadastrado." />
      )}
      {templatesQuery.data && templatesQuery.data.length > 0 && (
        <Table
          label="Templates de aula"
          columns={columns}
          rows={templatesQuery.data}
          rowKey={(template) => template.id}
        />
      )}
    </div>
  );
}
