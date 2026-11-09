import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Module, PermissionAction, type PlanDetail } from "@fitburn/contracts";
import { BlockedAction } from "../components/BlockedAction";
import { Button } from "../components/ui/Button";
import { PageHeader } from "../components/ui/PageHeader";
import { Segmented } from "../components/ui/Segmented";
import { useAuth } from "../lib/auth/AuthContext";
import { CatalogTab } from "./plans/CatalogTab";
import { AssignTab } from "./plans/AssignTab";
import { PlanForm } from "./plans/PlanForm";

type Tab = "catalogo" | "atribuir";
type FormState = { mode: "closed" } | { mode: "create" } | { mode: "edit"; plan: PlanDetail };

const TABS = [
  { value: "catalogo", label: "Catálogo de planos" },
  { value: "atribuir", label: "Atribuir a cliente" },
] as const;

/** Planos (D-038, #156): o catálogo e a atribuição de planos a clientes, num controle segmentado. */
export function PlansPage() {
  const { can } = useAuth();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<Tab>("catalogo");
  const [form, setForm] = useState<FormState>({ mode: "closed" });

  return (
    <div className="fb-ui-page">
      <PageHeader
        kicker="Planos"
        title="Planos"
        actions={
          tab === "catalogo" && (
            <BlockedAction
              allowed={can(Module.PLANOS, PermissionAction.CREATE)}
              reason="Você não tem permissão para criar planos."
            >
              <Button variant="primary" size="sm" onClick={() => setForm({ mode: "create" })}>
                + Novo plano
              </Button>
            </BlockedAction>
          )
        }
      />

      <Segmented label="Seção de planos" options={TABS} value={tab} onChange={setTab} />

      {tab === "catalogo" ? (
        <CatalogTab onEdit={(plan) => setForm({ mode: "edit", plan })} />
      ) : (
        <AssignTab />
      )}

      {form.mode !== "closed" && (
        <PlanForm
          key={form.mode === "edit" ? form.plan.id : "new"}
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
