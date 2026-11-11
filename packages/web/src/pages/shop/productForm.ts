import {
  createShopProductRequestSchema,
  normalizeOptionText,
  productOptionsInputSchema,
  setShopProductOptionsRequestSchema,
  shopVariantCombinations,
  shopVariantLabel,
  updateShopProductRequestSchema,
  type CreateShopProductRequest,
  type SetShopProductOptionsRequest,
  type ShopProductDetail,
  type UpdateShopProductRequest,
} from "@fitburn/contracts";
import { centsToInput, parseMoneyToCents } from "../../lib/shop/money";

// ---- Opções e variações (L2, #190) ----

/** Uma opção na tela. `key` é local (React); o ID da API muda a cada gravação e não é guardado. */
export interface OptionDraft {
  key: string;
  name: string;
  values: string[];
  /** Texto digitado no campo "Novo valor", ainda sem Enter. */
  draft: string;
  /** Recusa ao adicionar o valor (repetido, limite de 20). */
  draftError: string;
}

/** O que a equipe digitou numa variação, em texto até a conversão (estoque inteiro, preço em reais). */
export interface VariantDraft {
  stock: string;
  price: string;
  ativa: boolean;
}

/** Só os campos que a equipe editou (ou que vieram da API): o que falta não vai na sobreposição, a API mantém o que já existe. */
export type VariantDraftPatch = Partial<VariantDraft>;

/** Variações digitadas, por combinação (`variantKey`): sobrevivem a adicionar ou tirar valores das opções. */
export type VariantDrafts = Record<string, VariantDraftPatch>;

export const DEFAULT_VARIANT_DRAFT: VariantDraft = { stock: "0", price: "", ativa: true };

let optionKeyCounter = 0;

export function newOption(name = "", values: string[] = []): OptionDraft {
  optionKeyCounter += 1;
  return { key: `option-${optionKeyCounter}`, name, values, draft: "", draftError: "" };
}

/**
 * Identidade da combinação na tela, igual à da API (`combinationKey`): pares nome da opção e valor, normalizados e
 * ordenados pelo nome da opção. Renomear a opção ou um valor (além da capitalização) muda a identidade.
 */
export function variantKey(optionNames: string[], values: string[]): string {
  if (optionNames.length === 0) return "";
  const pairs = optionNames.map(
    (name, index) =>
      [normalizeOptionText(name), normalizeOptionText(values[index] ?? "")] as [string, string],
  );
  pairs.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return JSON.stringify(pairs);
}

/** Opções que entram no produto cartesiano: as que já têm ao menos um valor. */
function optionsWithValues(options: OptionDraft[]): OptionDraft[] {
  return options.filter((option) => option.values.length > 0);
}

export interface VariantRow {
  key: string;
  values: string[];
  label: string;
}

/** Combinações atuais das opções (produto cartesiano, a primeira opção varia mais devagar). Sem opções, nenhuma. */
export function variantRows(options: OptionDraft[]): VariantRow[] {
  const filled = optionsWithValues(options);
  if (filled.length === 0) return [];
  return shopVariantCombinations(filled.map((option) => option.values)).map((values) => ({
    key: variantKey(
      filled.map((option) => option.name),
      values,
    ),
    values,
    label: shopVariantLabel(values) ?? "",
  }));
}

/** Estado inicial da tela de edição, a partir do que a API devolveu (variações já com estoque, preço e ativa). */
export function detailToVariations(product: ShopProductDetail): {
  options: OptionDraft[];
  variants: VariantDrafts;
} {
  const options = product.options.map((option) =>
    newOption(
      option.name,
      option.values.map((item) => item.value),
    ),
  );
  const variants: VariantDrafts = {};
  if (options.length > 0) {
    for (const variant of product.variants) {
      variants[
        variantKey(
          options.map((option) => option.name),
          variant.values,
        )
      ] = {
        stock: String(variant.stock),
        price: variant.priceCents === null ? "" : centsToInput(variant.priceCents),
        ativa: variant.ativa,
      };
    }
  }
  return { options, variants };
}

export interface OptionFieldErrors {
  name?: string;
  values?: string;
}
export interface VariationErrors {
  /** Erro da lista de opções como um todo (ex.: mais de 3 opções). */
  options?: string;
  /** Por `OptionDraft.key`. */
  optionFields: Record<string, OptionFieldErrors>;
  /** Por `variantKey`. */
  variantRows: Record<string, { stock?: string; price?: string }>;
}

export const NO_VARIATION_ERRORS: VariationErrors = { optionFields: {}, variantRows: {} };

type VariationsResult =
  { ok: true; data: SetShopProductOptionsRequest } | { ok: false; errors: VariationErrors };

/**
 * Valida e converte opções e variações para o corpo da API (`PUT .../options` e a criação): nome e valores pelo
 * schema do contrato, estoque inteiro e preço em reais → centavos por linha. O valor ainda digitado no campo "Novo
 * valor" entra como valor (quem salva sem apertar Enter não o perde). Sem opções, devolve listas vazias.
 */
export function buildVariationsRequest(
  options: OptionDraft[],
  variants: VariantDrafts,
): VariationsResult {
  const errors: VariationErrors = { optionFields: {}, variantRows: {} };
  const cleaned = options.map((option) => {
    const pending = option.draft.trim();
    return {
      key: option.key,
      name: option.name.trim(),
      values: pending === "" ? option.values : [...option.values, pending],
    };
  });

  const parsedOptions = productOptionsInputSchema.safeParse(
    cleaned.map(({ name, values }) => ({ name, values })),
  );
  if (!parsedOptions.success) {
    for (const issue of parsedOptions.error.issues) {
      const [index, field] = issue.path;
      const target = typeof index === "number" ? cleaned[index] : undefined;
      if (!target) {
        errors.options ??= issue.message;
        continue;
      }
      const current = (errors.optionFields[target.key] ??= {});
      if (field === "name") current.name ??= issue.message;
      else current.values ??= issue.message;
    }
    return { ok: false, errors };
  }

  const rows = variantRows(cleaned.map((option) => ({ ...option, draft: "", draftError: "" })));
  const variantRequests: NonNullable<SetShopProductOptionsRequest["variants"]> = [];
  for (const row of rows) {
    const draft = variants[row.key];
    // Linha que a equipe não editou (e que a API não conhece) não vai: a API recupera a variação ou cria com o padrão.
    if (!draft) continue;
    const rowErrors: { stock?: string; price?: string } = {};
    const override: NonNullable<SetShopProductOptionsRequest["variants"]>[number] = {
      combination: row.values,
    };

    if (draft.stock !== undefined) {
      if (!/^\d+$/.test(draft.stock.trim()))
        rowErrors.stock = "O estoque deve ser um número inteiro.";
      else override.stock = Number(draft.stock.trim());
    }

    if (draft.price !== undefined) {
      if (draft.price.trim() === "") override.priceCents = null;
      else {
        const parsed = parseMoneyToCents(draft.price);
        if (parsed === null) rowErrors.price = "Preço inválido. Use o formato 89,90.";
        else override.priceCents = parsed;
      }
    }

    if (draft.ativa !== undefined) override.ativa = draft.ativa;

    if (rowErrors.stock || rowErrors.price) errors.variantRows[row.key] = rowErrors;
    variantRequests.push(override);
  }
  if (Object.keys(errors.variantRows).length > 0) return { ok: false, errors };

  const parsed = setShopProductOptionsRequestSchema.safeParse({
    options: parsedOptions.data,
    variants: variantRequests,
  });
  if (!parsed.success) {
    // O schema do contrato já foi aplicado por partes; o que sobra (estoque ou preço fora do limite) vai na primeira linha.
    const first = rows[0];
    const message = parsed.error.issues[0]?.message ?? "Confira as variações.";
    if (first) errors.variantRows[first.key] = { stock: message };
    else errors.options = message;
    return { ok: false, errors };
  }
  return { ok: true, data: parsed.data };
}

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
  "name" | "categoryId" | "price" | "promoPrice" | "description" | "stock" | "limitePorPedido";
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

export function productToFormValues(product: ShopProductDetail): ProductFormValues {
  return {
    name: product.name,
    categoryId: product.category?.id ?? "",
    price: centsToInput(product.priceCents),
    promoPrice: product.promoPriceCents === null ? "" : centsToInput(product.promoPriceCents),
    description: product.description ?? "",
    // Com opções o estoque é por variação: se a equipe tirar todas as opções, ela informa o estoque único de novo.
    // Produto simples: o estoque é o da variação única (o agregado `product.stock` soma só as ativas e viraria 0 se ela estiver inativa).
    stock: product.options.length > 0 ? "" : String(product.variants[0]?.stock ?? product.stock),
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

/** `variations`: a gravação de opções e variações (só com opções); na criação ela já vai dentro de `data`. */
type ProductFormResult<T> =
  | { ok: true; data: T; variations: SetShopProductOptionsRequest | null }
  | { ok: false; errors: ProductFormErrors; variationErrors: VariationErrors };

export interface ProductVariationsInput {
  options: OptionDraft[];
  variants: VariantDrafts;
}

/**
 * Converte e valida o formulário antes de enviar: primeiro o texto (reais, inteiros), depois o schema do contrato.
 * Com opções, o estoque sai do campo único e vai por variação: a criação manda `stock: 0` com `options` e
 * `variants`; a edição não manda `stock` no `PATCH` (a API recusa) e devolve a gravação das opções em `variations`.
 */
export function buildProductRequest(
  values: ProductFormValues,
  mode: "create",
  variations?: ProductVariationsInput,
): ProductFormResult<CreateShopProductRequest>;
export function buildProductRequest(
  values: ProductFormValues,
  mode: "update",
  variations?: ProductVariationsInput,
): ProductFormResult<UpdateShopProductRequest>;
export function buildProductRequest(
  values: ProductFormValues,
  mode: "create" | "update",
  variations?: ProductVariationsInput,
): ProductFormResult<CreateShopProductRequest | UpdateShopProductRequest> {
  const errors: ProductFormErrors = {};
  const hasOptions = (variations?.options.length ?? 0) > 0;

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
  if (hasOptions) stock = mode === "create" ? 0 : undefined;
  else if (values.stock.trim() === "") errors.stock = "Informe o estoque.";
  else if (!/^\d+$/.test(values.stock.trim()))
    errors.stock = "O estoque deve ser um número inteiro.";
  else stock = Number(values.stock.trim());

  // Sem "permitir mais de uma unidade" o limite não vale: vai null (limpa o que já existia).
  let limitePorPedido: number | null = null;
  if (values.permiteMaisDeUmaUnidade && values.limitePorPedido.trim() !== "") {
    if (!/^\d+$/.test(values.limitePorPedido.trim()))
      errors.limitePorPedido = "O limite deve ser um número inteiro.";
    else limitePorPedido = Number(values.limitePorPedido.trim());
  }

  let variationsRequest: SetShopProductOptionsRequest | null = null;
  let variationErrors: VariationErrors = NO_VARIATION_ERRORS;
  if (variations && hasOptions) {
    const built = buildVariationsRequest(variations.options, variations.variants);
    if (built.ok) variationsRequest = built.data;
    else variationErrors = built.errors;
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
      ? {
          ...base,
          description: description || undefined,
          ...(variationsRequest
            ? { options: variationsRequest.options, variants: variationsRequest.variants }
            : {}),
        }
      : { ...base, description: description || null };

  const schema =
    mode === "create" ? createShopProductRequestSchema : updateShopProductRequestSchema;
  const parsed = schema.safeParse(candidate);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const field = FIELD_OF_PATH[String(issue.path[0])];
      // A conversão do texto já explicou o campo; o schema só acrescenta o que ainda não tem mensagem.
      if (field && !errors[field]) errors[field] = issue.message;
    }
  }
  const hasVariationErrors = variationErrors !== NO_VARIATION_ERRORS;
  if (Object.keys(errors).length > 0 || hasVariationErrors)
    return { ok: false, errors, variationErrors };
  if (!parsed.success)
    return { ok: false, errors: { name: "Confira os dados do produto." }, variationErrors };
  return { ok: true, data: parsed.data, variations: mode === "update" ? variationsRequest : null };
}
