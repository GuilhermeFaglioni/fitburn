import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { assignPlanRequestSchema, Module, PermissionAction } from "@fitburn/contracts";
import { BlockedAction } from "../../components/BlockedAction";
import { formatLocalDate } from "../../lib/agenda/format";
import { errorMessage } from "../../lib/auth/api";
import { useAuth } from "../../lib/auth/AuthContext";
import { PlanHistoryList } from "./PlanHistoryList";
import { assignPlan, getPlanAssignmentOptions, listClientPlans } from "../../lib/plans/api";
import { ErrorState, Feedback, LoadingState } from "../../components/states";

/**
 * "Atribuir a cliente" (PlanosAdmin.dc.html): cliente, plano e as datas de
 * início e término; se o cliente já tem um plano ativo, o aviso de que a nova
 * atribuição o substitui (o atual termina na véspera do início do novo).
 * Abaixo, o histórico de planos do cliente escolhido. O artboard não tem as datas (o spec as pede na atribuição).
 */
const EMPTY_FORM = { clientId: "", planId: "", startDate: "", endDate: "" };

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
    <div style={{ maxWidth: 620, display: "flex", flexDirection: "column", gap: 16 }}>
      {optionsQuery.isLoading && <LoadingState />}
      {optionsQuery.isError && (
        <ErrorState
          message="Não foi possível carregar os clientes e os planos."
          onRetry={() => void optionsQuery.refetch()}
        />
      )}

      <div className="fb-modal__field">
        <label htmlFor="assign-client">Cliente</label>
        <select
          id="assign-client"
          className="fb-field"
          value={clientId}
          onChange={(event) => {
            setField("clientId", event.target.value);
            setAssignedTo(null);
            assignMutation.reset();
          }}
        >
          <option value="">Selecione um cliente</option>
          {options?.clients.map((item) => (
            <option key={item.id} value={item.id}>
              {item.fullName} {item.activePlan ? "(plano ativo)" : "(sem plano ativo)"}
            </option>
          ))}
        </select>
      </div>

      <div className="fb-modal__field">
        <label htmlFor="assign-plan">Plano</label>
        <select
          id="assign-plan"
          className="fb-field"
          value={planId}
          onChange={(event) => setField("planId", event.target.value)}
        >
          <option value="">Selecione um plano</option>
          {options?.plans.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </select>
      </div>

      <div className="fb-modal__grid">
        <div className="fb-modal__field">
          <label htmlFor="assign-start">Início</label>
          <input
            id="assign-start"
            type="date"
            className="fb-field"
            value={startDate}
            onChange={(event) => setField("startDate", event.target.value)}
          />
        </div>
        <div className="fb-modal__field">
          <label htmlFor="assign-end">Término</label>
          <input
            id="assign-end"
            type="date"
            className="fb-field"
            value={endDate}
            onChange={(event) => setField("endDate", event.target.value)}
          />
        </div>
      </div>

      {client?.activePlan && (
        <div className="fb-lock-banner" role="note">
          <span>
            <strong>{client.fullName} já possui um plano ativo</strong> ({client.activePlan.name},
            até {formatLocalDate(client.activePlan.endDate)}). Um cliente só pode ter um plano ativo
            por vez — ao atribuir este novo plano, o atual passa a terminar na véspera do início do
            novo plano (ou mantém o término atual, se ele já for anterior a essa data).
          </span>
        </div>
      )}

      {invalidReason && <Feedback tone="error">{invalidReason}</Feedback>}
      {assignMutation.isError && (
        <Feedback tone="error">
          {errorMessage(assignMutation.error, "Não foi possível atribuir o plano.")}
        </Feedback>
      )}
      {assignedTo && <p className="fb-note">Plano atribuído a {assignedTo}.</p>}

      <div className="fb-modal__footer" style={{ justifyContent: "flex-end" }}>
        <button type="button" className="fb-btn-secondary" onClick={reset}>
          Cancelar
        </button>
        <BlockedAction allowed={canAssign} reason="Você não tem permissão para atribuir planos.">
          <button
            type="button"
            className="fb-btn-primary"
            disabled={!complete || !parsed.success || assignMutation.isPending}
            onClick={() => assignMutation.mutate({ clientId, planId, startDate, endDate })}
          >
            {client?.activePlan ? "Atribuir e substituir o atual" : "Atribuir plano"}
          </button>
        </BlockedAction>
      </div>

      {client && historyQuery.isSuccess && historyQuery.data.length > 0 && (
        <section aria-labelledby="assign-history" className="fb-plan__admin-history">
          <h2 id="assign-history" className="fb-plan__admin-history-title">
            Histórico de planos do cliente
          </h2>
          <PlanHistoryList items={historyQuery.data} light />
        </section>
      )}
    </div>
  );
}
