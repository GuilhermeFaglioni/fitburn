import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  BIOIMPEDANCE_SOURCE_LABELS,
  Module,
  PermissionAction,
  utcToGymDateTime,
  type BioimpedanceAssessment,
} from "@fitburn/contracts";
import { QueryBlockState } from "../../components/QueryBlockState";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { PageHeader } from "../../components/ui/PageHeader";
import { Segmented } from "../../components/ui/Segmented";
import { EmptyState } from "../../components/ui/States";
import { Table, type TableColumn } from "../../components/ui/Table";
import { useAuth } from "../../lib/auth/AuthContext";
import {
  useAssessments,
  useDeleteAssessment,
  type AssessmentRange,
} from "../../lib/bioimpedance/assessments-api";
import { ConfirmDeleteDialog } from "../shop/ConfirmDeleteDialog";
import { AssessmentAction } from "./AssessmentAction";

const RANGES = [
  { value: "30d", label: "Últimos 30 dias" },
  { value: "year", label: "Este ano" },
  { value: "all", label: "Tudo" },
] as const;

const NUMBER = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1, minimumFractionDigits: 1 });

export function formatMeasuredAt(iso: string): string {
  const { date, time } = utcToGymDateTime(iso);
  const [year, month, day] = date.split("-");
  return `${day}/${month}/${year} · ${time}`;
}

/**
 * Bioimpedância no admin (B2): as avaliações recentes dos clientes do escopo que autorizaram o registro (D-042),
 * com origem e quem registrou. Editar e excluir exigem a permissão do módulo e rede; excluir é físico, com
 * confirmação, e fica na trilha de auditoria sem os valores.
 */
export function BioimpedanceAdminPage() {
  const { can } = useAuth();
  const navigate = useNavigate();
  const [range, setRange] = useState<AssessmentRange>("30d");
  const [deleting, setDeleting] = useState<BioimpedanceAssessment | null>(null);
  const query = useAssessments(range);
  const deleteMutation = useDeleteAssessment();

  const canCreate = can(Module.BIOIMPEDANCIA, PermissionAction.CREATE);
  const canEdit = can(Module.BIOIMPEDANCIA, PermissionAction.EDIT);
  const canDelete = can(Module.BIOIMPEDANCIA, PermissionAction.DELETE);

  const columns: TableColumn<BioimpedanceAssessment>[] = [
    {
      key: "client",
      header: "Cliente",
      className: "fb-ui-table__name",
      cell: (assessment) => assessment.clientName,
    },
    { key: "date", header: "Data da avaliação", cell: (assessment) => formatMeasuredAt(assessment.measuredAt) },
    {
      key: "weight",
      header: "Peso",
      cell: (assessment) => `${NUMBER.format(assessment.measures.weight.value)} kg`,
    },
    {
      key: "fat",
      header: "PGC",
      cell: (assessment) => {
        const fat = assessment.measures.bodyFatPercent?.value;
        return fat === undefined ? "—" : `${NUMBER.format(fat)}%`;
      },
    },
    {
      key: "source",
      header: "Origem",
      cell: (assessment) => (
        <Badge tone={assessment.source === "FOTO_DO_LAUDO" ? "brand" : "neutral"}>
          {BIOIMPEDANCE_SOURCE_LABELS[assessment.source].toUpperCase()}
        </Badge>
      ),
    },
    {
      key: "author",
      header: "Registrada por",
      className: "fb-ui-table__muted",
      cell: (assessment) => assessment.authorName,
    },
    {
      key: "actions",
      header: "Ações",
      actions: true,
      cell: (assessment) => (
        <div className="fb-ui-row-actions">
          <AssessmentAction allowed={canEdit} reason="Você não tem permissão para editar avaliações.">
            <Button
              size="sm"
              aria-label={`Editar avaliação de ${assessment.clientName} em ${formatMeasuredAt(assessment.measuredAt)}`}
              onClick={() => void navigate(`/bioimpedancia-admin/${assessment.id}/editar`)}
            >
              Editar
            </Button>
          </AssessmentAction>
          <AssessmentAction allowed={canDelete} reason="Você não tem permissão para excluir avaliações.">
            <Button
              size="sm"
              variant="ghost-danger"
              aria-label={`Excluir avaliação de ${assessment.clientName} em ${formatMeasuredAt(assessment.measuredAt)}`}
              onClick={() => setDeleting(assessment)}
            >
              Excluir
            </Button>
          </AssessmentAction>
        </div>
      ),
    },
  ];

  const items = query.data?.items;

  return (
    <div className="fb-ui-page">
      <PageHeader
        kicker="Bioimpedância"
        title="Avaliações"
        actions={
          <AssessmentAction allowed={canCreate} reason="Você não tem permissão para registrar avaliações.">
            <Button variant="primary" size="sm" onClick={() => void navigate("/bioimpedancia-admin/nova")}>
              + Nova avaliação
            </Button>
          </AssessmentAction>
        }
      />

      <Segmented label="Período" options={RANGES} value={range} onChange={setRange} />

      <QueryBlockState
        query={query}
        hasData={items !== undefined}
        loading="Carregando avaliações…"
        error="Não foi possível carregar as avaliações."
      />
      {items && items.length === 0 && (
        <EmptyState
          title="Nenhuma avaliação neste período."
          description="Só aparecem clientes que autorizaram o registro da bioimpedância."
        />
      )}
      {items && items.length > 0 && (
        <Table label="Avaliações recentes" columns={columns} rows={items} rowKey={(assessment) => assessment.id} />
      )}
      <p className="fb-ui-note">
        A equipe só vê avaliações de clientes que autorizaram o registro. Se o cliente revogar, as avaliações dele
        saem desta lista; ele continua vendo e pode excluir as dele.
      </p>

      {deleting && (
        <ConfirmDeleteDialog
          title={`Excluir a avaliação de ${deleting.clientName}?`}
          description="A exclusão é definitiva: os valores são apagados e não podem ser recuperados. A ação fica registrada na auditoria, sem os valores."
          fallbackError="Não foi possível excluir a avaliação."
          onConfirm={() => deleteMutation.mutateAsync(deleting.id)}
          onClose={() => setDeleting(null)}
        />
      )}
    </div>
  );
}
