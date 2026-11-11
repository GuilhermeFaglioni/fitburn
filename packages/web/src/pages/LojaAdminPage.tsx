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
import { ProductsTab } from "./shop/ProductsTab";

export type LojaTab = "produtos" | "categorias";

const TABS = [
  { value: "produtos", label: "Produtos" },
  { value: "categorias", label: "Categorias" },
] as const;

/**
 * Loja no admin (D-039, #187): Produtos e Categorias num controle segmentado, cada aba na própria rota
 * (`/loja-admin/produtos`, `/loja-admin/categorias`). A aba Pedidos chega na L7. O foco vai ao conteúdo ao trocar de
 * aba pelo `useFocusOnNavigation` do AdminLayout.
 */
export function LojaAdminPage({ tab }: { tab: LojaTab }) {
  const { can } = useAuth();
  const navigate = useNavigate();
  const [creatingCategory, setCreatingCategory] = useState(false);
  const canCreate = can(Module.LOJA, PermissionAction.CREATE);

  return (
    <div className="fb-ui-page">
      <PageHeader
        kicker="Loja"
        title={tab === "produtos" ? "Produtos" : "Categorias"}
        actions={
          tab === "produtos" ? (
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
        onChange={(next) => void navigate(`/loja-admin/${next}`)}
      />

      {tab === "produtos" ? <ProductsTab /> : <CategoriesTab />}

      {creatingCategory && <CategoryDialog onClose={() => setCreatingCategory(false)} />}
    </div>
  );
}
