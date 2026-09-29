import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Module, PermissionAction, type PlanDetail } from "@fitburn/contracts";
import { BlockedAction } from "../../components/BlockedAction";
import { useAuth } from "../../lib/auth/AuthContext";
import { errorMessage } from "../../lib/auth/api";
import { listPlans, setPlanActive } from "../../lib/plans/api";
import { PlanForm } from "./PlanForm";

type FormState = { mode: "closed" } | { mode: "create" } | { mode: "edit"; plan: PlanDetail };

/** Catálogo de planos (PlanosAdmin.dc.html): tabela com criar, editar, ativar e desativar. */
export function CatalogTab() {
  const { can } = useAuth();
  const queryClient = useQueryClient();
  const [form, setForm] = useState<FormState>({ mode: "closed" });

  const plansQuery = useQuery({ queryKey: ["plans"], queryFn: listPlans });
  const toggleMutation = useMutation({
    mutationFn: (plan: PlanDetail) => setPlanActive(plan.id, !plan.isActive),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["plans"] }),
  });

  const canCreate = can(Module.PLANOS, PermissionAction.CREATE);
  const canEdit = can(Module.PLANOS, PermissionAction.EDIT);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14, flexGrow: 1, minHeight: 0 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end" }}>
        <BlockedAction allowed={canCreate} reason="Você não tem permissão para criar planos.">
          <button
            type="button"
            className="fb-btn-primary"
            onClick={() => setForm({ mode: "create" })}
          >
            + Novo plano
          </button>
        </BlockedAction>
      </div>

      {plansQuery.isLoading && <p className="fb-note">Carregando…</p>}
      {plansQuery.isError && <p role="alert">Não foi possível carregar os planos.</p>}
      {toggleMutation.isError && (
        <p role="alert">
          {errorMessage(toggleMutation.error, "Não foi possível alterar o plano.")}
        </p>
      )}
      {plansQuery.isSuccess && plansQuery.data.length === 0 && (
        <p className="fb-note">Nenhum plano cadastrado.</p>
      )}

      {plansQuery.isSuccess && plansQuery.data.length > 0 && (
        <div className="fb-table-wrap">
          <table>
            <thead>
              <tr>
                <th className="fb-th">Nome</th>
                <th className="fb-th">Descrição</th>
                <th className="fb-th">Status</th>
                <th className="fb-th">Clientes ativos</th>
                <th className="fb-th" style={{ textAlign: "right" }}>
                  Ações
                </th>
              </tr>
            </thead>
            <tbody>
              {plansQuery.data.map((plan) => (
                <tr key={plan.id}>
                  <td className="fb-td" style={{ fontWeight: 500 }}>
                    {plan.name}
                  </td>
                  <td className="fb-td" style={{ color: "#5a5a5a" }}>
                    {plan.description}
                  </td>
                  <td className="fb-td">
                    <span
                      className={`fb-badge ${plan.isActive ? "fb-badge--active" : "fb-badge--inactive"}`}
                    >
                      {plan.isActive ? "ATIVO" : "INATIVO"}
                    </span>
                  </td>
                  <td className="fb-td" style={{ color: "#5a5a5a" }}>
                    {plan.activeClientCount}
                  </td>
                  <td className="fb-td" style={{ textAlign: "right" }}>
                    <BlockedAction
                      allowed={canEdit}
                      reason="Você não tem permissão para alterar planos."
                    >
                      <button
                        type="button"
                        className="fb-row-btn"
                        onClick={() => setForm({ mode: "edit", plan })}
                      >
                        Editar
                      </button>
                    </BlockedAction>
                    <BlockedAction
                      allowed={canEdit}
                      reason="Você não tem permissão para alterar planos."
                    >
                      <button
                        type="button"
                        className="fb-row-btn"
                        disabled={toggleMutation.isPending}
                        onClick={() => toggleMutation.mutate(plan)}
                      >
                        {plan.isActive ? "Desativar" : "Ativar"}
                      </button>
                    </BlockedAction>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {form.mode !== "closed" && (
        <PlanForm
          plan={form.mode === "edit" ? form.plan : undefined}
          onSaved={() => {
            setForm({ mode: "closed" });
            void queryClient.invalidateQueries({ queryKey: ["plans"] });
          }}
          onClose={() => setForm({ mode: "closed" })}
        />
      )}
    </div>
  );
}
