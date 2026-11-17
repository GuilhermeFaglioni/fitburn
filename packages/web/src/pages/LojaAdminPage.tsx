import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Module, PermissionAction } from "@fitburn/contracts";
import { BlockedAction } from "../components/BlockedAction";
import { Button } from "../components/ui/Button";
import { PageHeader } from "../components/ui/PageHeader";
import { Segmented } from "../components/ui/Segmented";
import { useAuth } from "../lib/auth/AuthContext";
import { CategoriesTab } from "./shop/CategoriesTab";
import { CategoryDialog } from "./shop/CategoryDialog";
import { defaultExportRange, ExportOrdersDialog } from "./shop/ExportOrdersDialog";
import { OrdersTab, periodRange, type OrderPeriod } from "./shop/OrdersTab";
import { ProductsTab } from "./shop/ProductsTab";

export type LojaTab = "pedidos" | "produtos" | "categorias";

const TABS = [
  { value: "pedidos", label: "Pedidos" },
  { value: "produtos", label: "Produtos" },
  { value: "categorias", label: "Categorias" },
] as const;

/**
 * Loja no admin (D-039, #187, #200): Pedidos (padrão), Produtos e Categorias num controle segmentado, cada aba na
 * própria rota (`/loja-admin`, `/loja-admin/produtos`, `/loja-admin/categorias`). O foco vai ao conteúdo ao trocar de
 * aba pelo `useFocusOnNavigation` do AdminLayout.
 */
export function LojaAdminPage({ tab }: { tab: LojaTab }) {
  const { can } = useAuth();
  const navigate = useNavigate();
  const [creatingCategory, setCreatingCategory] = useState(false);
  const [period, setPeriod] = useState<OrderPeriod>("all");
  const [exporting, setExporting] = useState(false);
  const canCreate = can(Module.LOJA, PermissionAction.CREATE);
  // A API da exportação exige Ver da Loja; sem a permissão o botão nem aparece.
  const canExport = can(Module.LOJA, PermissionAction.VIEW);

  return (
    <div className="fb-ui-page">
      <PageHeader
        kicker="Loja"
        title={TABS.find((option) => option.value === tab)!.label}
        actions={
          tab === "pedidos" ? (
            canExport ? (
              <Button size="sm" onClick={() => setExporting(true)}>
                Exportar pedidos (CSV)
              </Button>
            ) : undefined
          ) : tab === "produtos" ? (
            <BlockedAction allowed={canCreate} reason="Você não tem permissão para criar produtos.">
              <Button variant="primary" size="sm" onClick={() => void navigate("/loja-admin/produtos/novo")}>
                + Novo produto
              </Button>
            </BlockedAction>
          ) : (
            <BlockedAction allowed={canCreate} reason="Você não tem permissão para criar categorias.">
              <Button variant="primary" size="sm" onClick={() => setCreatingCategory(true)}>
                + Nova categoria
              </Button>
            </BlockedAction>
          )
        }
      />

      <Segmented
        label="Seções da loja"
        options={TABS}
        value={tab}
        onChange={(next) => void navigate(next === "pedidos" ? "/loja-admin" : `/loja-admin/${next}`)}
      />

      {tab === "pedidos" ? <OrdersTab period={period} onPeriodChange={setPeriod} /> : tab === "produtos" ? <ProductsTab /> : <CategoriesTab />}

      {exporting && (
        <ExportOrdersDialog initialRange={defaultExportRange(periodRange(period))} onClose={() => setExporting(false)} />
      )}
      {creatingCategory && <CategoryDialog onClose={() => setCreatingCategory(false)} />}
    </div>
  );
}
