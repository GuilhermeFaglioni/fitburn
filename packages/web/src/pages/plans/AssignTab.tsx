import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  assignPlanRequestSchema,
  Module,
  PermissionAction,
  PlanAssignmentStatus,
  type PlanAssignment,
} from "@fitburn/contracts";
import { BlockedAction } from "../../components/BlockedAction";
import { QueryBlockState } from "../../components/QueryBlockState";
import { Alert } from "../../components/ui/Alert";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { Field } from "../../components/ui/Field";
import { Select } from "../../components/ui/Select";
import { EmptyState } from "../../components/ui/States";
import { Table, type TableColumn } from "../../components/ui/Table";
import { formatLocalDate } from "../../lib/agenda/format";
import { errorMessage } from "../../lib/auth/api";
import { useAuth } from "../../lib/auth/AuthContext";
import { assignPlan, getPlanAssignmentOptions, listClientPlans } from "../../lib/plans/api";

const EMPTY_FORM = { clientId: "", planId: "", startDate: "", endDate: "" };

const HISTORY_COLUMNS: TableColumn<PlanAssignment>[] = [
  { key: "plan", header: "Plano", className: "fb-ui-table__name", cell: (item) => item.plan.name },
  {
    key: "period",
    header: "Período",
    className: "fb-ui-table__muted",
    cell: (item) => `${formatLocalDate(item.startDate)} – ${formatLocalDate(item.endDate)}`,
  },
  {
    key: "status",
    header: "Situação",
    cell: (item) =>
      item.status === PlanAssignmentStatus.ACTIVE ? (
        <Badge tone="ok" dot>
          ATIVO
        </Badge>
      ) : (
        <Badge dot>ENCERRADO</Badge>
      ),
  },
];

/**
 * "Atribuir a cliente" (D-038, #156): cliente, plano e as datas de início e término; se o cliente já tem um plano
 * ativo, o aviso de que a nova atribuição o substitui (o atual termina na véspera do início do novo). Abaixo, o
 * histórico de planos do cliente escolhido. A tela de referência não tem as datas; o spec as pede na atribuição.
 */
export function AssignTab() {
  const { can } = useAuth();
  const queryClient = useQueryClient();
  const [form, setForm] = useState(EMPTY_FORM);
  const { clientId, planId, startDate, endDate } = form;
  const setField = (field: keyof typeof EMPTY_FORM, value: string) =>
    setForm((current) => ({ ...current, [field]: value }));
  const [assignedTo, setAssignedTo] = useState<string | null>(null);

  const optionsQuery = useQuery({ queryKey: ["plan-options"], queryFn: getPlanAssignmentOptions });
  const historyQuery = useQuery({
    queryKey: ["plans", "client", clientId],
    queryFn: () => listClientPlans(clientId),
    enabled: clientId !== "",
  });

  const options = optionsQuery.data;
  const client = options?.clients.find((item) => item.id === clientId);

  const assignMutation = useMutation({
    mutationFn: assignPlan,
    onMutate: () => setAssignedTo(null),
    onSuccess: async () => {
      setAssignedTo(client?.fullName ?? null);
      setForm((current) => ({ ...EMPTY_FORM, clientId: current.clientId }));
      await queryClient.invalidateQueries({ queryKey: ["plans"] });
      await queryClient.invalidateQueries({ queryKey: ["plan-options"] });
    },
  });

  const canAssign = can(Module.PLANOS, PermissionAction.CREATE);
  const complete = clientId !== "" && planId !== "" && startDate !== "" && endDate !== "";
  const parsed = assignPlanRequestSchema.safeParse({ clientId, planId, startDate, endDate });
  const invalidReason = complete && !parsed.success ? parsed.error.issues[0].message : null;

  function reset() {
    setForm(EMPTY_FORM);
    setAssignedTo(null);
    assignMutation.reset();
  }

  return (
    <div className="fb-ui-assign">
      <QueryBlockState
        query={optionsQuery}
        hasData={options !== undefined}
        loading="Carregando clientes e planos…"
        error="Não foi possível carregar os clientes e os planos."
      />

      {options && (
        <Card as="section" aria-labelledby="assign-title" className="fb-ui-stack">
          <h2 id="assign-title" className="fb-ui-section-title">
            Atribuir a cliente
          </h2>
          <div className="fb-ui-form-grid">
            <Select
              label="Cliente"
              className="fb-ui-field--full"
              value={clientId}
              onChange={(event) => {
                setField("clientId", event.target.value);
                setAssignedTo(null);
                assignMutation.reset();
              }}
            >
              <option value="">Selecione um cliente</option>
              {options.clients.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.fullName} {item.activePlan ? "(plano ativo)" : "(sem plano ativo)"}
                </option>
              ))}
            </Select>
            <Select
              label="Plano"
              className="fb-ui-field--full"
              value={planId}
              onChange={(event) => setField("planId", event.target.value)}
            >
              <option value="">Selecione um plano</option>
              {options.plans.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </Select>
            <Field
              label="Início"
              type="date"
              value={startDate}
              onChange={(event) => setField("startDate", event.target.value)}
            />
            <Field
              label="Término"
              type="date"
              value={endDate}
              error={invalidReason ?? undefined}
              onChange={(event) => setField("endDate", event.target.value)}
            />
          </div>

          {client?.activePlan && (
            <p role="note" className="fb-ui-notice">
              <span>
                <strong>{client.fullName} já possui um plano ativo</strong> (
                {client.activePlan.name}, até {formatLocalDate(client.activePlan.endDate)}). Um
                cliente só pode ter um plano ativo por vez — ao atribuir este novo plano, o atual
                passa a terminar na véspera do início do novo plano (ou mantém o término atual, se
                ele já for anterior a essa data).
              </span>
            </p>
          )}

          {assignMutation.isError && (
            <Alert>
              {errorMessage(assignMutation.error, "Não foi possível atribuir o plano.")}
            </Alert>
          )}
          {assignedTo && <Alert tone="ok">Plano atribuído a {assignedTo}.</Alert>}

          <div className="fb-ui-dialog__actions">
            <Button disabled={assignMutation.isPending} onClick={reset}>
              Cancelar
            </Button>
            <BlockedAction
              allowed={canAssign}
              reason="Você não tem permissão para atribuir planos."
            >
              <Button
                variant="primary"
                busy={assignMutation.isPending}
                disabled={!complete || !parsed.success}
                onClick={() => assignMutation.mutate({ clientId, planId, startDate, endDate })}
              >
                {client?.activePlan ? "Encerrar atual e atribuir" : "Atribuir plano"}
              </Button>
            </BlockedAction>
          </div>
        </Card>
      )}

      {client && (
        <section className="fb-ui-assign__history" aria-labelledby="assign-history">
          <h2 id="assign-history" className="fb-ui-section-title">
            Histórico de planos do cliente
          </h2>
          <QueryBlockState
            query={historyQuery}
            hasData={historyQuery.data !== undefined}
            loading="Carregando histórico…"
            error="Não foi possível carregar o histórico de planos."
          />
          {historyQuery.data && historyQuery.data.length === 0 && (
            <EmptyState title="Este cliente ainda não tem planos." />
          )}
          {historyQuery.data && historyQuery.data.length > 0 && (
            <Table
              label={`Planos de ${client.fullName}`}
              columns={HISTORY_COLUMNS}
              rows={historyQuery.data}
              rowKey={(item) => item.id}
            />
          )}
        </section>
      )}
    </div>
  );
}
