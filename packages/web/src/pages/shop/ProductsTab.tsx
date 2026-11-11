import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Module, PermissionAction, type ShopProduct } from "@fitburn/contracts";
import { BlockedAction } from "../../components/BlockedAction";
import { QueryBlockState } from "../../components/QueryBlockState";
import { Alert } from "../../components/ui/Alert";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { Field } from "../../components/ui/Field";
import { Select } from "../../components/ui/Select";
import { EmptyState } from "../../components/ui/States";
import { Table, type TableColumn } from "../../components/ui/Table";
import { Toolbar } from "../../components/ui/Toolbar";
import { errorMessage } from "../../lib/auth/api";
import { useAuth } from "../../lib/auth/AuthContext";
import {
  hasProductFilters,
  useDeleteShopProduct,
  useShopCategories,
  useShopProducts,
  useUpdateShopProduct,
  type ShopProductFilters,
  type ShopVisibilityFilter,
} from "../../lib/shop/api";
import { formatCents } from "../../lib/shop/money";
import { ConfirmDeleteDialog } from "./ConfirmDeleteDialog";
import { ShopAction } from "./ShopAction";

/** Espera da digitação antes de buscar: uma consulta por pausa, não por tecla. */
const SEARCH_DEBOUNCE_MS = 300;

function Price({ product }: { product: ShopProduct }) {
  if (product.promoPriceCents === null) return <>{formatCents(product.priceCents)}</>;
  return (
    <>
      <s className="fb-shop-price__old">
        <span className="fb-ui-sr-only">Preço cheio </span>
        {formatCents(product.priceCents)}
      </s>{" "}
      <span className="fb-ui-sr-only">Preço promocional </span>
      {formatCents(product.promoPriceCents)}
    </>
  );
}

function Stock({ product }: { product: ShopProduct }) {
  const soldOut = product.soldOutVariantCount;
  return (
    <>
      {product.stock === 0 ? <span className="fb-shop-stock--zero">0</span> : product.stock}
      {soldOut > 0 && (
        <>
          {" "}
          <span className="fb-shop-soft">({soldOut === 1 ? "1 esgotada" : `${soldOut} esgotadas`})</span>
        </>
      )}
    </>
  );
}

/**
 * Produtos da loja (D-039, #187): busca por nome, categoria e visibilidade, e a tabela com editar (abre o
 * formulário), ocultar/mostrar e excluir (exclusão lógica, com confirmação). Gravar exige a permissão do módulo e rede.
 */
export function ProductsTab() {
  const { can } = useAuth();
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [visibility, setVisibility] = useState<ShopVisibilityFilter>("all");
  const [deleting, setDeleting] = useState<ShopProduct | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [search]);

  const filters: ShopProductFilters = { q: debouncedSearch, categoryId, visibility };
  const productsQuery = useShopProducts(filters);
  const categoriesQuery = useShopCategories();
  const updateMutation = useUpdateShopProduct();
  const deleteMutation = useDeleteShopProduct();

  const canEdit = can(Module.LOJA, PermissionAction.EDIT);
  const canDelete = can(Module.LOJA, PermissionAction.DELETE);

  function toggleVisibility(product: ShopProduct) {
    setActionError(null);
    updateMutation.mutate(
      { id: product.id, input: { visivel: !product.visivel } },
      {
        onError: (error) =>
          setActionError(errorMessage(error, "Não foi possível alterar a visibilidade do produto.")),
      },
    );
  }

  const columns: TableColumn<ShopProduct>[] = [
    {
      key: "name",
      header: "Produto",
      className: "fb-ui-table__name",
      cell: (product) => (
        <span className="fb-shop-name">
          {product.name}
          {product.destaque && <Badge tone="brand">DESTAQUE</Badge>}
        </span>
      ),
    },
    {
      key: "category",
      header: "Categoria",
      className: "fb-ui-table__muted",
      cell: (product) => product.category?.name ?? "—",
    },
    { key: "price", header: "Preço", cell: (product) => <Price product={product} /> },
    {
      key: "variants",
      header: "Variações",
      className: "fb-ui-table__muted",
      cell: (product) => product.variantCount,
    },
    { key: "stock", header: "Estoque", cell: (product) => <Stock product={product} /> },
    {
      key: "visibility",
      header: "Visibilidade",
      cell: (product) => (
        <Badge tone={product.visivel ? "ok" : "neutral"} dot={product.visivel}>
          {product.visivel ? "VISÍVEL" : "OCULTO"}
        </Badge>
      ),
    },
    {
      key: "actions",
      header: "Ações",
      actions: true,
      cell: (product) => (
        <div className="fb-ui-row-actions">
          <BlockedAction allowed={canEdit} reason="Você não tem permissão para alterar produtos.">
            <Button
              size="sm"
              aria-label={`Editar produto ${product.name}`}
              onClick={() => void navigate(`/loja-admin/produtos/${product.id}`)}
            >
              Editar
            </Button>
          </BlockedAction>
          <ShopAction allowed={canEdit} reason="Você não tem permissão para alterar produtos.">
            <Button
              size="sm"
              aria-label={`${product.visivel ? "Ocultar" : "Mostrar"} produto ${product.name}`}
              disabled={updateMutation.isPending}
              onClick={() => toggleVisibility(product)}
            >
              {product.visivel ? "Ocultar" : "Mostrar"}
            </Button>
          </ShopAction>
          <ShopAction allowed={canDelete} reason="Você não tem permissão para excluir produtos.">
            <Button
              size="sm"
              variant="ghost-danger"
              aria-label={`Excluir produto ${product.name}`}
              onClick={() => setDeleting(product)}
            >
              Excluir
            </Button>
          </ShopAction>
        </div>
      ),
    },
  ];

  const products = productsQuery.data;
  const categories = categoriesQuery.data ?? [];

  return (
    <div className="fb-ui-stack">
      <Toolbar role="search" aria-label="Filtrar produtos">
        <Field
          hideLabel
          label="Buscar produto"
          type="search"
          placeholder="Buscar produto"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <Select
          hideLabel
          label="Categoria"
          value={categoryId}
          onChange={(event) => setCategoryId(event.target.value)}
        >
          <option value="">Categoria: todas</option>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </Select>
        <Select
          hideLabel
          label="Visibilidade"
          value={visibility}
          onChange={(event) => setVisibility(event.target.value as ShopVisibilityFilter)}
        >
          <option value="all">Visíveis e ocultos</option>
          <option value="visible">Só visíveis</option>
          <option value="hidden">Só ocultos</option>
        </Select>
      </Toolbar>

      {actionError && <Alert>{actionError}</Alert>}

      <QueryBlockState
        query={productsQuery}
        hasData={products !== undefined}
        loading="Carregando produtos…"
        error="Não foi possível carregar os produtos."
      />
      {products && products.length === 0 && (
        <EmptyState
          title={hasProductFilters(filters) ? "Nenhum produto encontrado." : "Nenhum produto cadastrado ainda."}
          description={hasProductFilters(filters) ? "Ajuste a busca ou os filtros." : undefined}
        />
      )}
      {products && products.length > 0 && (
        <Table label="Produtos" columns={columns} rows={products} rowKey={(product) => product.id} />
      )}
      <p className="fb-ui-note">
        Excluir tira o produto da loja e da lista, mas mantém o histórico dos pedidos (exclusão lógica). Ocultar só
        esconde do cliente.
      </p>

      {deleting && (
        <ConfirmDeleteDialog
          title={`Excluir o produto ${deleting.name}?`}
          description="Excluir tira o produto da loja e da lista, mas mantém o histórico dos pedidos (exclusão lógica). Ocultar só esconde do cliente."
          fallbackError="Não foi possível excluir o produto."
          onConfirm={() => deleteMutation.mutateAsync(deleting.id)}
          onClose={() => setDeleting(null)}
        />
      )}
    </div>
  );
}
