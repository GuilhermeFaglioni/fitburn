import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Module, PermissionAction, PlanAssignmentStatus } from "@fitburn/contracts";
import { BlockedAction } from "../../components/BlockedAction";
import { formatLocalDate } from "../../lib/agenda/format";
import { errorMessage } from "../../lib/auth/api";
import { useAuth } from "../../lib/auth/AuthContext";
import { assignPlan, getPlanAssignmentOptions, listClientPlans } from "../../lib/plans/api";

/**
 * "Atribuir a cliente" (PlanosAdmin.dc.html): cliente, plano e as datas de
 * início e término; se o cliente já tem um plano ativo, o aviso de que a nova
 * atribuição o encerra. Abaixo, o histórico de planos do cliente escolhido.
 * O artboard não tem as datas (o spec as pede na atribuição).
 */
export function AssignTab() {
  const { can } = useAuth();
  const queryClient = useQueryClient();
  const [clientId, setClientId] = useState("");
  const [planId, setPlanId] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
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
      setPlanId("");
      setStartDate("");
      setEndDate("");
      await queryClient.invalidateQueries({ queryKey: ["plans"] });
      await queryClient.invalidateQueries({ queryKey: ["plan-options"] });
    },
  });

  const canAssign = can(Module.PLANOS, PermissionAction.CREATE);
  const complete = clientId !== "" && planId !== "" && startDate !== "" && endDate !== "";

  function reset() {
    setClientId("");
    setPlanId("");
    setStartDate("");
    setEndDate("");
    setAssignedTo(null);
    assignMutation.reset();
  }

  return (
    <div style={{ maxWidth: 620, display: "flex", flexDirection: "column", gap: 16 }}>
      {optionsQuery.isError && (
        <p role="alert">Não foi possível carregar os clientes e os planos.</p>
      )}

      <div className="fb-modal__field">
        <label htmlFor="assign-client">Cliente</label>
        <select
          id="assign-client"
          className="fb-field"
          value={clientId}
          onChange={(event) => {
            setClientId(event.target.value);
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
          onChange={(event) => setPlanId(event.target.value)}
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
            onChange={(event) => setStartDate(event.target.value)}
          />
        </div>
        <div className="fb-modal__field">
          <label htmlFor="assign-end">Término</label>
          <input
            id="assign-end"
            type="date"
            className="fb-field"
            value={endDate}
            onChange={(event) => setEndDate(event.target.value)}
          />
        </div>
      </div>

      {client?.activePlan && (
        <div className="fb-lock-banner" role="note">
          <span>
            <strong>{client.fullName} já possui um plano ativo</strong> ({client.activePlan.name},
            até {formatLocalDate(client.activePlan.endDate)}). Um cliente só pode ter um plano ativo
            por vez — atribuir este novo plano encerrará o atual imediatamente.
          </span>
        </div>
      )}

      {assignMutation.isError && (
        <p role="alert">
          {errorMessage(assignMutation.error, "Não foi possível atribuir o plano.")}
        </p>
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
            disabled={!complete || assignMutation.isPending}
            onClick={() => assignMutation.mutate({ clientId, planId, startDate, endDate })}
          >
            {client?.activePlan ? "Encerrar atual e atribuir" : "Atribuir plano"}
          </button>
        </BlockedAction>
      </div>

      {client && historyQuery.isSuccess && historyQuery.data.length > 0 && (
        <section
          aria-labelledby="assign-history"
          style={{ display: "flex", flexDirection: "column", gap: 8 }}
        >
          <h2 id="assign-history" style={{ margin: 0, fontSize: 14, fontWeight: 700 }}>
            Histórico de planos do cliente
          </h2>
          <ul
            style={{
              margin: 0,
              padding: 0,
              listStyle: "none",
              display: "flex",
              flexDirection: "column",
              gap: 8,
            }}
          >
            {historyQuery.data.map((item) => (
              <li
                key={item.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 10,
                  padding: "10px 14px",
                  border: "1px solid #eeeeee",
                  borderRadius: 5,
                }}
              >
                <span style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                  <span style={{ fontSize: 13, fontWeight: 500 }}>{item.plan.name}</span>
                  <span style={{ fontSize: 12, color: "#8a8a8a" }}>
                    {formatLocalDate(item.startDate)} – {formatLocalDate(item.endDate)}
                  </span>
                </span>
                <span
                  className={`fb-badge ${item.status === PlanAssignmentStatus.ACTIVE ? "fb-badge--active" : "fb-badge--inactive"}`}
                >
                  {item.status === PlanAssignmentStatus.ACTIVE ? "ATIVO" : "ENCERRADO"}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
