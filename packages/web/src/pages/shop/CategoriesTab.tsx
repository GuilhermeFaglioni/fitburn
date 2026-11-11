import { useState } from "react";
import { Module, PermissionAction, type ShopCategory } from "@fitburn/contracts";
import { QueryBlockState } from "../../components/QueryBlockState";
import { Alert } from "../../components/ui/Alert";
import { Button } from "../../components/ui/Button";
import { EmptyState } from "../../components/ui/States";
import { Table, type TableColumn } from "../../components/ui/Table";
import { errorMessage } from "../../lib/auth/api";
import { useAuth } from "../../lib/auth/AuthContext";
import {
  useDeleteShopCategory,
  useReorderShopCategories,
  useShopCategories,
} from "../../lib/shop/api";
import { CategoryDialog } from "./CategoryDialog";
import { ConfirmDeleteDialog } from "./ConfirmDeleteDialog";
import { ShopAction } from "./ShopAction";

/**
 * Categorias da loja (D-039, #187): produtos por categoria, ordem (Subir/Descer, que mandam a lista completa na nova
 * ordem), renomear e excluir. Categoria com produtos não se exclui: a API recusa e a mensagem aparece na confirmação.
 * "+ Nova categoria" fica no cabeçalho da página.
 */
export function CategoriesTab() {
  const { can } = useAuth();
  const categoriesQuery = useShopCategories();
  const reorderMutation = useReorderShopCategories();
  const deleteMutation = useDeleteShopCategory();
  const [renaming, setRenaming] = useState<ShopCategory | null>(null);
  const [deleting, setDeleting] = useState<ShopCategory | null>(null);
  const [orderError, setOrderError] = useState<string | null>(null);

  const canEdit = can(Module.LOJA, PermissionAction.EDIT);
  const canDelete = can(Module.LOJA, PermissionAction.DELETE);
  const categories = categoriesQuery.data;

  function move(index: number, offset: -1 | 1) {
    if (!categories) return;
    const ids = categories.map((category) => category.id);
    const target = index + offset;
    [ids[index], ids[target]] = [ids[target]!, ids[index]!];
    setOrderError(null);
    reorderMutation.mutate(ids, {
      onError: (error) => setOrderError(errorMessage(error, "Não foi possível reordenar as categorias.")),
    });
  }

  const editReason = "Você não tem permissão para alterar categorias.";
  const columns: TableColumn<ShopCategory>[] = [
    { key: "name", header: "Categoria", className: "fb-ui-table__name", cell: (category) => category.name },
    {
      key: "products",
      header: "Produtos",
      className: "fb-ui-table__muted",
      cell: (category) => category.productCount,
    },
    {
      key: "order",
      header: "Ordem",
      cell: (category) => {
        const index = categories?.findIndex((candidate) => candidate.id === category.id) ?? 0;
        const last = (categories?.length ?? 0) - 1;
        return (
          <span className="fb-shop-order">
            <span className="fb-shop-order__number">{index + 1}</span>
            <ShopAction allowed={canEdit} reason={editReason}>
              <Button
                size="sm"
                aria-label={`Subir categoria ${category.name}`}
                disabled={index === 0 || reorderMutation.isPending}
                onClick={() => move(index, -1)}
              >
                Subir
              </Button>
            </ShopAction>
            <ShopAction allowed={canEdit} reason={editReason}>
              <Button
                size="sm"
                aria-label={`Descer categoria ${category.name}`}
                disabled={index === last || reorderMutation.isPending}
                onClick={() => move(index, 1)}
              >
                Descer
              </Button>
            </ShopAction>
          </span>
        );
      },
    },
    {
      key: "actions",
      header: "Ações",
      actions: true,
      cell: (category) => (
        <div className="fb-ui-row-actions">
          <ShopAction allowed={canEdit} reason={editReason}>
            <Button size="sm" aria-label={`Renomear categoria ${category.name}`} onClick={() => setRenaming(category)}>
              Renomear
            </Button>
          </ShopAction>
          <ShopAction allowed={canDelete} reason="Você não tem permissão para excluir categorias.">
            <Button
              size="sm"
              variant="ghost-danger"
              aria-label={`Excluir categoria ${category.name}`}
              onClick={() => setDeleting(category)}
            >
              Excluir
            </Button>
          </ShopAction>
        </div>
      ),
    },
  ];

  return (
    <div className="fb-ui-stack">
      {orderError && <Alert>{orderError}</Alert>}
      <QueryBlockState
        query={categoriesQuery}
        hasData={categories !== undefined}
        loading="Carregando categorias…"
        error="Não foi possível carregar as categorias."
      />
      {categories && categories.length === 0 && <EmptyState title="Nenhuma categoria cadastrada ainda." />}
      {categories && categories.length > 0 && (
        <Table label="Categorias" columns={columns} rows={categories} rowKey={(category) => category.id} />
      )}
      <p className="fb-ui-note">
        Categoria com produtos não pode ser excluída; mova os produtos antes. A categoria é opcional no produto.
      </p>

      {renaming && <CategoryDialog key={renaming.id} category={renaming} onClose={() => setRenaming(null)} />}
      {deleting && (
        <ConfirmDeleteDialog
          title={`Excluir a categoria ${deleting.name}?`}
          description="Categoria com produtos não pode ser excluída; mova os produtos antes."
          fallbackError="Não foi possível excluir a categoria."
          onConfirm={() => deleteMutation.mutateAsync(deleting.id)}
          onClose={() => setDeleting(null)}
        />
      )}
    </div>
  );
}
