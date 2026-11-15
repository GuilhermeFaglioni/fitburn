import { z } from "zod";

const categoryNameSchema = z
  .string()
  .trim()
  .min(1, "O nome da categoria é obrigatório.")
  .max(60, "O nome pode ter no máximo 60 caracteres.");

/** Categoria da loja, com quantos produtos (não excluídos) ela tem. */
export const shopCategorySchema = z.object({
  id: z.string(),
  name: z.string(),
  position: z.number().int(),
  productCount: z.number().int(),
});
export type ShopCategory = z.infer<typeof shopCategorySchema>;

export const createShopCategoryRequestSchema = z.object({ name: categoryNameSchema });
export type CreateShopCategoryRequest = z.infer<typeof createShopCategoryRequestSchema>;

export const renameShopCategoryRequestSchema = z.object({ name: categoryNameSchema });
export type RenameShopCategoryRequest = z.infer<typeof renameShopCategoryRequestSchema>;

/** A lista completa dos ids das categorias, na nova ordem. */
export const reorderShopCategoriesRequestSchema = z.object({ ids: z.array(z.string().min(1)) });
export type ReorderShopCategoriesRequest = z.infer<typeof reorderShopCategoriesRequestSchema>;

const productNameSchema = z
  .string()
  .trim()
  .min(1, "O nome do produto é obrigatório.")
  .max(120, "O nome pode ter no máximo 120 caracteres.");
const productDescriptionSchema = z
  .string()
  .trim()
  .max(2000, "A descrição pode ter no máximo 2000 caracteres.");
const priceCentsSchema = z
  .number()
  .int("O preço deve ser um valor inteiro em centavos.")
  .min(0, "O preço não pode ser negativo.")
  .max(100_000_000, "O preço é alto demais.");
const stockSchema = z
  .number()
  .int("O estoque deve ser um número inteiro.")
  .min(0, "O estoque não pode ser negativo.")
  .max(100_000, "O estoque máximo é 100000.");
const orderLimitSchema = z
  .number()
  .int("O limite deve ser um número inteiro.")
  .min(1, "O limite mínimo é 1.")
  .max(99, "O limite máximo é 99.");

interface ProductRuleFields {
  priceCents?: number;
  promoPriceCents?: number | null;
  permiteMaisDeUmaUnidade?: boolean;
  limitePorPedido?: number | null;
}

/** Regras entre campos: promoção menor que o preço; limite por pedido só com "permite mais de uma unidade". */
function addProductRuleIssues(value: ProductRuleFields, ctx: z.RefinementCtx): void {
  if (
    value.priceCents !== undefined &&
    value.promoPriceCents !== undefined &&
    value.promoPriceCents !== null &&
    value.promoPriceCents >= value.priceCents
  ) {
    ctx.addIssue({
      code: "custom",
      message: "O preço promocional deve ser menor que o preço.",
      path: ["promoPriceCents"],
    });
  }
  if (
    value.permiteMaisDeUmaUnidade === false &&
    value.limitePorPedido !== undefined &&
    value.limitePorPedido !== null
  ) {
    ctx.addIssue({
      code: "custom",
      message: "O limite por pedido só vale quando o produto permite mais de uma unidade.",
      path: ["limitePorPedido"],
    });
  }
}

/** Até 3 opções por produto (Cor, Tamanho, Modelo), cada uma com 1 a 20 valores. */
export const MAX_PRODUCT_OPTIONS = 3;
export const MAX_OPTION_VALUES = 20;

const optionNameSchema = z
  .string()
  .trim()
  .min(1, "O nome da opção é obrigatório.")
  .max(30, "O nome da opção pode ter no máximo 30 caracteres.");
const optionValueSchema = z
  .string()
  .trim()
  .min(1, "O valor é obrigatório.")
  .max(40, "O valor pode ter no máximo 40 caracteres.");

/** Comparação de nomes e valores: sem diferença de maiúsculas e de espaços nas pontas. */
export function normalizeOptionText(text: string): string {
  return text.trim().toLowerCase();
}

export const productOptionInputSchema = z.object({
  name: optionNameSchema,
  values: z
    .array(optionValueSchema)
    .min(1, "Cada opção precisa de pelo menos um valor.")
    .max(MAX_OPTION_VALUES, "Cada opção pode ter no máximo 20 valores."),
});
export type ProductOptionInput = z.infer<typeof productOptionInputSchema>;

/** Lista de opções do produto: sem nome de opção repetido, e sem valor repetido dentro da opção. */
export const productOptionsInputSchema = z
  .array(productOptionInputSchema)
  .max(MAX_PRODUCT_OPTIONS, "O produto pode ter no máximo 3 opções.")
  .superRefine((options, ctx) => {
    const names = new Set<string>();
    options.forEach((option, index) => {
      const name = normalizeOptionText(option.name);
      if (names.has(name)) {
        ctx.addIssue({
          code: "custom",
          message: "Já existe uma opção com esse nome.",
          path: [index, "name"],
        });
      }
      names.add(name);

      const values = new Set<string>();
      option.values.forEach((value, valueIndex) => {
        const normalized = normalizeOptionText(value);
        if (values.has(normalized)) {
          ctx.addIssue({
            code: "custom",
            message: "Esse valor está repetido nesta opção.",
            path: [index, "values", valueIndex],
          });
        }
        values.add(normalized);
      });
    });
  });
export type ProductOptionsInput = z.infer<typeof productOptionsInputSchema>;

/**
 * Sobreposição de uma variação ao gravar as opções. `combination` lista os valores
 * na ordem das opções enviadas. Campos ausentes mantêm o que a variação já tinha
 * (ou, se for combinação nova, o padrão: estoque 0, sem preço próprio, ativa).
 */
export const shopVariantOverrideSchema = z.object({
  combination: z.array(optionValueSchema),
  stock: stockSchema.optional(),
  priceCents: priceCentsSchema.nullable().optional(),
  ativa: z.boolean().optional(),
});
export type ShopVariantOverride = z.infer<typeof shopVariantOverrideSchema>;

/**
 * Regras de sobreposição que não dependem do banco: cada combinação tem um valor
 * por opção enviada, e não se repete.
 */
function addVariantOverrideIssues(
  variants: ShopVariantOverride[],
  optionCount: number,
  ctx: z.RefinementCtx,
  basePath: (string | number)[],
): void {
  const seen = new Set<string>();
  variants.forEach((variant, index) => {
    if (variant.combination.length !== optionCount) {
      ctx.addIssue({
        code: "custom",
        message: "A combinação deve ter um valor para cada opção.",
        path: [...basePath, index, "combination"],
      });
    }
    const key = JSON.stringify(variant.combination.map(normalizeOptionText));
    if (seen.has(key)) {
      ctx.addIssue({
        code: "custom",
        message: "Combinação repetida.",
        path: [...basePath, index, "combination"],
      });
    }
    seen.add(key);
  });
}

/** Criação: `options` e `variants` são opcionais. Com opções, o estoque é por variação (`stock` = 0). */
export const createShopProductRequestSchema = z
  .object({
    name: productNameSchema,
    description: productDescriptionSchema.optional(),
    categoryId: z.string().min(1).nullable().default(null),
    priceCents: priceCentsSchema,
    promoPriceCents: priceCentsSchema.nullable().default(null),
    stock: stockSchema,
    visivel: z.boolean().default(true),
    destaque: z.boolean().default(false),
    permiteMaisDeUmaUnidade: z.boolean().default(false),
    limitePorPedido: orderLimitSchema.nullable().default(null),
    options: productOptionsInputSchema.optional(),
    variants: z.array(shopVariantOverrideSchema).optional(),
  })
  .superRefine(addProductRuleIssues)
  .superRefine((value, ctx) => {
    const optionCount = value.options?.length ?? 0;
    if (optionCount > 0 && value.stock !== 0) {
      ctx.addIssue({
        code: "custom",
        message: "Defina o estoque por variação.",
        path: ["stock"],
      });
    }
    if (value.variants !== undefined && optionCount === 0) {
      ctx.addIssue({
        code: "custom",
        message: "Variações exigem pelo menos uma opção.",
        path: ["variants"],
      });
    }
    if (value.variants !== undefined && optionCount > 0) {
      addVariantOverrideIssues(value.variants, optionCount, ctx, ["variants"]);
    }
  });
export type CreateShopProductRequest = z.infer<typeof createShopProductRequestSchema>;

/** Gravação completa das opções (e das sobreposições de variação) do produto, numa chamada. */
export const setShopProductOptionsRequestSchema = z
  .object({
    options: productOptionsInputSchema,
    variants: z.array(shopVariantOverrideSchema).optional(),
  })
  .superRefine((value, ctx) => {
    if (value.variants !== undefined) {
      addVariantOverrideIssues(value.variants, value.options.length, ctx, ["variants"]);
    }
  });
export type SetShopProductOptionsRequest = z.infer<typeof setShopProductOptionsRequestSchema>;

/**
 * Combinações do produto cartesiano, na ordem das opções (a primeira varia mais devagar).
 * Sem opções, uma única combinação vazia (variação única).
 */
export function shopVariantCombinations(optionValues: string[][]): string[][] {
  return optionValues.reduce<string[][]>(
    (combinations, values) =>
      combinations.flatMap((combination) => values.map((value) => [...combination, value])),
    [[]],
  );
}

/** Rótulo da variação: valores unidos por " · " (ex.: "Preta · M"). Sem opções, nulo. */
export function shopVariantLabel(values: string[]): string | null {
  return values.length === 0 ? null : values.join(" · ");
}

/** Todos os campos opcionais; null limpa descrição, categoria, promoção e limite. */
export const updateShopProductRequestSchema = z
  .object({
    name: productNameSchema.optional(),
    description: productDescriptionSchema.nullable().optional(),
    categoryId: z.string().min(1).nullable().optional(),
    priceCents: priceCentsSchema.optional(),
    promoPriceCents: priceCentsSchema.nullable().optional(),
    stock: stockSchema.optional(),
    visivel: z.boolean().optional(),
    destaque: z.boolean().optional(),
    permiteMaisDeUmaUnidade: z.boolean().optional(),
    limitePorPedido: orderLimitSchema.nullable().optional(),
  })
  .superRefine(addProductRuleIssues);
export type UpdateShopProductRequest = z.infer<typeof updateShopProductRequestSchema>;

/** Um produto na administração da loja (produto simples: uma variação única com estoque). */
export const shopProductSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  category: z.object({ id: z.string(), name: z.string() }).nullable(),
  priceCents: z.number().int(),
  promoPriceCents: z.number().int().nullable(),
  visivel: z.boolean(),
  destaque: z.boolean(),
  permiteMaisDeUmaUnidade: z.boolean(),
  limitePorPedido: z.number().int().nullable(),
  variantCount: z.number().int(),
  /** Soma do estoque das variações ativas. */
  stock: z.number().int(),
  soldOutVariantCount: z.number().int(),
  createdAt: z.string(),
});
export type ShopProduct = z.infer<typeof shopProductSchema>;

/** Uma opção do produto, com os valores na ordem de exibição. */
export const shopProductOptionSchema = z.object({
  id: z.string(),
  name: z.string(),
  values: z.array(z.object({ id: z.string(), value: z.string() })),
});
export type ShopProductOption = z.infer<typeof shopProductOptionSchema>;

/**
 * Uma variação do produto. `values` segue a ordem das opções; `priceCents` é o
 * preço próprio (ou null); `effectivePriceCents` é o preço que o cliente paga.
 */
export const shopProductVariantSchema = z.object({
  id: z.string(),
  label: z.string().nullable(),
  values: z.array(z.string()),
  stock: z.number().int(),
  priceCents: z.number().int().nullable(),
  effectivePriceCents: z.number().int(),
  ativa: z.boolean(),
});
export type ShopProductVariant = z.infer<typeof shopProductVariantSchema>;

/** Produto com opções e variações (sem as descontinuadas), para a tela de edição. */
export const shopProductDetailSchema = shopProductSchema.extend({
  options: z.array(shopProductOptionSchema),
  variants: z.array(shopProductVariantSchema),
});
export type ShopProductDetail = z.infer<typeof shopProductDetailSchema>;

export const ShopProductVisibility = { ALL: "all", VISIBLE: "visible", HIDDEN: "hidden" } as const;

export const listShopProductsQuerySchema = z.object({
  q: z.string().trim().optional(),
  categoryId: z.string().min(1).optional(),
  visibility: z.enum(["all", "visible", "hidden"]).default("all"),
});
export type ListShopProductsQuery = z.infer<typeof listShopProductsQuerySchema>;
