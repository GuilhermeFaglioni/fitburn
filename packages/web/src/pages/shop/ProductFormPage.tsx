import { useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Module, PermissionAction, type ShopProduct } from "@fitburn/contracts";
import { QueryBlockState } from "../../components/QueryBlockState";
import { Alert } from "../../components/ui/Alert";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { Field } from "../../components/ui/Field";
import { PageHeader } from "../../components/ui/PageHeader";
import { Select } from "../../components/ui/Select";
import { Switch } from "../../components/ui/Switch";
import { Textarea } from "../../components/ui/Textarea";
import { errorMessage } from "../../lib/auth/api";
import { useAuth } from "../../lib/auth/AuthContext";
import {
  useCreateShopProduct,
  useShopCategories,
  useShopProduct,
  useUpdateShopProduct,
} from "../../lib/shop/api";
import {
  buildProductRequest,
  EMPTY_PRODUCT_FORM,
  productToFormValues,
  type ProductFormErrors,
  type ProductFormValues,
} from "./productForm";
import { ShopAction } from "./ShopAction";

const FORM_ID = "shop-product-form";

/** Rota `/loja-admin/produtos/novo` (sem `:id`) cria; `/loja-admin/produtos/:id` carrega o produto e edita. */
export function ProductFormPage() {
  const { id } = useParams();
  return id ? <EditProduct id={id} /> : <ProductForm />;
}

function EditProduct({ id }: { id: string }) {
  const productQuery = useShopProduct(id);
  const product = productQuery.data;

  if (!product) {
    return (
      <div className="fb-ui-page">
        <PageHeader crumb={<Crumb current="Editar produto" />} kicker="Loja" title="Editar produto" />
        <QueryBlockState
          query={productQuery}
          hasData={false}
          loading="Carregando produto…"
          error="Não foi possível carregar o produto."
        />
      </div>
    );
  }
  return <ProductForm key={product.id} product={product} />;
}

function Crumb({ current }: { current: string }) {
  return (
    <>
      <Link to="/loja-admin/produtos" className="fb-ui-link">
        Loja
      </Link>{" "}
      /{" "}
      <Link to="/loja-admin/produtos" className="fb-ui-link">
        Produtos
      </Link>{" "}
      / {current}
    </>
  );
}

/**
 * Cadastro e edição de produto simples (D-039, #187): "Dados do produto" (com a variação única e o estoque) e "Regras
 * de venda". Preço e promoção são digitados em reais e enviados em centavos. O formulário valida com os schemas do
 * contrato antes de enviar e mostra o erro em cada campo; a recusa da API (ex.: já há 3 destaques) aparece no aviso
 * do formulário. Fotos e opções/variações chegam nas issues L3 e L2.
 */
function ProductForm({ product }: { product?: ShopProduct }) {
  const { can } = useAuth();
  const navigate = useNavigate();
  const categoriesQuery = useShopCategories();
  const createMutation = useCreateShopProduct();
  const updateMutation = useUpdateShopProduct();
  const [values, setValues] = useState<ProductFormValues>(product ? productToFormValues(product) : EMPTY_PRODUCT_FORM);
  const [errors, setErrors] = useState<ProductFormErrors>({});
  const [apiError, setApiError] = useState<string | null>(null);

  const editing = product !== undefined;
  const canSave = can(Module.LOJA, editing ? PermissionAction.EDIT : PermissionAction.CREATE);
  const saving = createMutation.isPending || updateMutation.isPending;
  const title = editing ? "Editar produto" : "Novo produto";

  function set<K extends keyof ProductFormValues>(key: K, value: ProductFormValues[K]) {
    setValues((current) => ({ ...current, [key]: value }));
  }

  const categories = categoriesQuery.data ?? [];
  // A categoria do produto aparece mesmo se a lista de categorias ainda não chegou.
  const missingCategory =
    product?.category && !categories.some((category) => category.id === product.category?.id) ? product.category : null;

  function goBack() {
    void navigate("/loja-admin/produtos");
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    setApiError(null);
    const onError = (error: unknown) => setApiError(errorMessage(error, "Não foi possível salvar o produto."));

    if (product) {
      const result = buildProductRequest(values, "update");
      if (!result.ok) return setErrors(result.errors);
      setErrors({});
      updateMutation.mutate({ id: product.id, input: result.data }, { onSuccess: goBack, onError });
    } else {
      const result = buildProductRequest(values, "create");
      if (!result.ok) return setErrors(result.errors);
      setErrors({});
      createMutation.mutate(result.data, { onSuccess: goBack, onError });
    }
  }

  return (
    <div className="fb-ui-page">
      <PageHeader
        crumb={<Crumb current={product?.name ?? title} />}
        kicker="Loja"
        title={title}
        actions={
          <>
            <Button size="sm" disabled={saving} onClick={goBack}>
              Cancelar
            </Button>
            <ShopAction
              allowed={canSave}
              reason={`Você não tem permissão para ${editing ? "alterar" : "criar"} produtos.`}
            >
              <Button type="submit" form={FORM_ID} variant="primary" size="sm" busy={saving}>
                Salvar produto
              </Button>
            </ShopAction>
          </>
        }
      />

      {apiError && <Alert>{apiError}</Alert>}

      <form id={FORM_ID} noValidate aria-label={title} onSubmit={submit} className="fb-ui-stack">
        <Card as="section" aria-labelledby="shop-product-data" className="fb-ui-card--form">
          <h2 id="shop-product-data" className="fb-ui-section-title">
            Dados do produto
          </h2>
          <div className="fb-ui-form-grid fb-shop-card-body">
            <Field
              label="Nome"
              value={values.name}
              error={errors.name}
              onChange={(event) => set("name", event.target.value)}
            />
            <Select
              label="Categoria"
              value={values.categoryId}
              error={errors.categoryId}
              onChange={(event) => set("categoryId", event.target.value)}
            >
              <option value="">Sem categoria</option>
              {missingCategory && <option value={missingCategory.id}>{missingCategory.name}</option>}
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </Select>
            <Field
              label="Preço"
              inputMode="decimal"
              placeholder="R$ 89,90"
              value={values.price}
              error={errors.price}
              onChange={(event) => set("price", event.target.value)}
            />
            <Field
              label="Preço promocional (opcional)"
              inputMode="decimal"
              placeholder="R$ 69,90"
              value={values.promoPrice}
              error={errors.promoPrice}
              onChange={(event) => set("promoPrice", event.target.value)}
            />
            <Textarea
              className="fb-ui-field--full"
              label="Descrição"
              rows={3}
              value={values.description}
              error={errors.description}
              onChange={(event) => set("description", event.target.value)}
            />
            <Field
              label="Estoque"
              inputMode="numeric"
              help="Produto simples: uma variação única, com este estoque."
              value={values.stock}
              error={errors.stock}
              onChange={(event) => set("stock", event.target.value)}
            />
          </div>
        </Card>

        <Card as="section" aria-labelledby="shop-product-rules" className="fb-ui-card--form">
          <h2 id="shop-product-rules" className="fb-ui-section-title">
            Regras de venda
          </h2>
          <div className="fb-ui-switch-list fb-shop-card-body">
            <Switch
              label="Permitir mais de uma unidade por pedido"
              description="Se desligado, o cliente leva no máximo 1 unidade do produto."
              checked={values.permiteMaisDeUmaUnidade}
              onChange={(checked) => set("permiteMaisDeUmaUnidade", checked)}
            />
            <Field
              className="fb-ui-field--narrow"
              label="Limite por pedido"
              inputMode="numeric"
              help="Máximo de unidades deste produto num pedido (vazio = só o estoque limita)."
              disabled={!values.permiteMaisDeUmaUnidade}
              value={values.limitePorPedido}
              error={errors.limitePorPedido}
              onChange={(event) => set("limitePorPedido", event.target.value)}
            />
            <Switch
              label="Visível na loja"
              description="Produto oculto continua cadastrado e não aparece para o cliente."
              checked={values.visivel}
              onChange={(checked) => set("visivel", checked)}
            />
            <Switch
              label="Destaque no Início"
              description="No máximo 3 produtos."
              checked={values.destaque}
              onChange={(checked) => set("destaque", checked)}
            />
          </div>
        </Card>
      </form>
    </div>
  );
}
