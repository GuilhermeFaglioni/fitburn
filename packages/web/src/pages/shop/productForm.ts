import {
  createShopProductRequestSchema,
  updateShopProductRequestSchema,
  type CreateShopProductRequest,
  type ShopProduct,
  type UpdateShopProductRequest,
} from "@fitburn/contracts";
import { centsToInput, parseMoneyToCents } from "../../lib/shop/money";

/** O que a equipe digita no formulário de produto, tudo em texto (reais, números) até a conversão. */
export interface ProductFormValues {
  name: string;
  categoryId: string;
  price: string;
  promoPrice: string;
  description: string;
  stock: string;
  permiteMaisDeUmaUnidade: boolean;
  limitePorPedido: string;
  visivel: boolean;
  destaque: boolean;
}

export type ProductFormField =
  | "name"
  | "categoryId"
  | "price"
  | "promoPrice"
  | "description"
  | "stock"
  | "limitePorPedido";
export type ProductFormErrors = Partial<Record<ProductFormField, string>>;

export const EMPTY_PRODUCT_FORM: ProductFormValues = {
  name: "",
  categoryId: "",
  price: "",
  promoPrice: "",
  description: "",
  stock: "",
  permiteMaisDeUmaUnidade: false,
  limitePorPedido: "",
  visivel: true,
  destaque: false,
};

export function productToFormValues(product: ShopProduct): ProductFormValues {
  return {
    name: product.name,
    categoryId: product.category?.id ?? "",
    price: centsToInput(product.priceCents),
    promoPrice: product.promoPriceCents === null ? "" : centsToInput(product.promoPriceCents),
    description: product.description ?? "",
    stock: String(product.stock),
    permiteMaisDeUmaUnidade: product.permiteMaisDeUmaUnidade,
    limitePorPedido: product.limitePorPedido === null ? "" : String(product.limitePorPedido),
    visivel: product.visivel,
    destaque: product.destaque,
  };
}

/** Campo do contrato → campo da tela (o preço e a promoção, em centavos no contrato, são texto em reais aqui). */
const FIELD_OF_PATH: Record<string, ProductFormField> = {
  name: "name",
  categoryId: "categoryId",
  priceCents: "price",
  promoPriceCents: "promoPrice",
  description: "description",
  stock: "stock",
  limitePorPedido: "limitePorPedido",
};

type ProductFormResult<T> = { ok: true; data: T } | { ok: false; errors: ProductFormErrors };

/** Converte e valida o formulário antes de enviar: primeiro o texto (reais, inteiros), depois o schema do contrato. */
export function buildProductRequest(
  values: ProductFormValues,
  mode: "create",
): ProductFormResult<CreateShopProductRequest>;
export function buildProductRequest(
  values: ProductFormValues,
  mode: "update",
): ProductFormResult<UpdateShopProductRequest>;
export function buildProductRequest(
  values: ProductFormValues,
  mode: "create" | "update",
): ProductFormResult<CreateShopProductRequest | UpdateShopProductRequest> {
  const errors: ProductFormErrors = {};

  let priceCents: number | undefined;
  if (values.price.trim() === "") errors.price = "Informe o preço.";
  else {
    const parsed = parseMoneyToCents(values.price);
    if (parsed === null) errors.price = "Preço inválido. Use o formato 89,90.";
    else priceCents = parsed;
  }

  let promoPriceCents: number | null = null;
  if (values.promoPrice.trim() !== "") {
    const parsed = parseMoneyToCents(values.promoPrice);
    if (parsed === null) errors.promoPrice = "Preço promocional inválido. Use o formato 69,90.";
    else promoPriceCents = parsed;
  }

  let stock: number | undefined;
  if (values.stock.trim() === "") errors.stock = "Informe o estoque.";
  else if (!/^\d+$/.test(values.stock.trim())) errors.stock = "O estoque deve ser um número inteiro.";
  else stock = Number(values.stock.trim());

  // Sem "permitir mais de uma unidade" o limite não vale: vai null (limpa o que já existia).
  let limitePorPedido: number | null = null;
  if (values.permiteMaisDeUmaUnidade && values.limitePorPedido.trim() !== "") {
    if (!/^\d+$/.test(values.limitePorPedido.trim())) errors.limitePorPedido = "O limite deve ser um número inteiro.";
    else limitePorPedido = Number(values.limitePorPedido.trim());
  }

  const description = values.description.trim();
  const base = {
    name: values.name,
    categoryId: values.categoryId === "" ? null : values.categoryId,
    priceCents,
    promoPriceCents,
    stock,
    visivel: values.visivel,
    destaque: values.destaque,
    permiteMaisDeUmaUnidade: values.permiteMaisDeUmaUnidade,
    limitePorPedido,
  };
  const candidate =
    mode === "create"
      ? { ...base, description: description || undefined }
      : { ...base, description: description || null };

  const schema = mode === "create" ? createShopProductRequestSchema : updateShopProductRequestSchema;
  const parsed = schema.safeParse(candidate);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const field = FIELD_OF_PATH[String(issue.path[0])];
      // A conversão do texto já explicou o campo; o schema só acrescenta o que ainda não tem mensagem.
      if (field && !errors[field]) errors[field] = issue.message;
    }
  }
  if (Object.keys(errors).length > 0) return { ok: false, errors };
  if (!parsed.success) return { ok: false, errors: { name: "Confira os dados do produto." } };
  return { ok: true, data: parsed.data };
}
