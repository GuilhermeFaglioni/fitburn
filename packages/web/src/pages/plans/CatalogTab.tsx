import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Module, PermissionAction, type PlanDetail } from "@fitburn/contracts";
import { BlockedAction } from "../../components/BlockedAction";
import { QueryBlockState } from "../../components/QueryBlockState";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { EmptyState } from "../../components/ui/States";
import { Table, type TableColumn } from "../../components/ui/Table";
import { useAuth } from "../../lib/auth/AuthContext";
import { listPlans } from "../../lib/plans/api";
import { PlanToggleDialog } from "./PlanToggleDialog";

/**
 * Catálogo de planos (D-038, #156): tabela com editar, ativar e desativar por linha. Editar abre o formulário, que
 * vive na página (o "+ Novo plano" fica no cabeçalho); ativar e desativar pedem confirmação em diálogo.
 */
export function CatalogTab({ onEdit }: { onEdit: (plan: PlanDetail) => void }) {
  const { can } = useAuth();
  const [toggling, setToggling] = useState<PlanDetail | null>(null);

  const plansQuery = useQuery({ queryKey: ["plans"], queryFn: listPlans });
  const canEdit = can(Module.PLANOS, PermissionAction.EDIT);
  const reason = "Você não tem permissão para alterar planos.";

  const columns: TableColumn<PlanDetail>[] = [
    { key: "name", header: "Nome", className: "fb-ui-table__name", cell: (plan) => plan.name },
    {
      key: "description",
      header: "Descrição",
      className: "fb-ui-table__muted",
      cell: (plan) => plan.description ?? "—",
    },
    {
      key: "status",
      header: "Status",
      cell: (plan) => (
        <Badge tone={plan.isActive ? "ok" : "neutral"} dot>
          {plan.isActive ? "ATIVO" : "INATIVO"}
        </Badge>
      ),
    },
    {
      key: "clients",
      header: "Clientes ativos",
      className: "fb-ui-table__muted",
      cell: (plan) => plan.activeClientCount,
    },
    {
      key: "actions",
      header: "Ações",
      actions: true,
      cell: (plan) => (
        <div className="fb-ui-row-actions">
          <BlockedAction allowed={canEdit} reason={reason}>
            <Button size="sm" aria-label={`Editar plano ${plan.name}`} onClick={() => onEdit(plan)}>
              Editar
            </Button>
          </BlockedAction>
          <BlockedAction allowed={canEdit} reason={reason}>
            <Button
              size="sm"
              aria-label={`${plan.isActive ? "Desativar" : "Ativar"} plano ${plan.name}`}
              onClick={() => setToggling(plan)}
            >
              {plan.isActive ? "Desativar" : "Ativar"}
            </Button>
          </BlockedAction>
        </div>
      ),
    },
  ];

  return (
    <div className="fb-ui-stack">
      <QueryBlockState
        query={plansQuery}
        hasData={plansQuery.data !== undefined}
        loading="Carregando planos…"
        error="Não foi possível carregar os planos."
      />
      {plansQuery.data && plansQuery.data.length === 0 && (
        <EmptyState title="Nenhum plano cadastrado." />
      )}
      {plansQuery.data && plansQuery.data.length > 0 && (
        <Table
          label="Catálogo de planos"
          columns={columns}
          rows={plansQuery.data}
          rowKey={(plan) => plan.id}
        />
      )}

      {toggling && <PlanToggleDialog plan={toggling} onClose={() => setToggling(null)} />}
    </div>
  );
}
