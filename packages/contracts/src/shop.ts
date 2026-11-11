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
  })
  .superRefine(addProductRuleIssues);
export type CreateShopProductRequest = z.infer<typeof createShopProductRequestSchema>;

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

export const ShopProductVisibility = { ALL: "all", VISIBLE: "visible", HIDDEN: "hidden" } as const;

export const listShopProductsQuerySchema = z.object({
  q: z.string().trim().optional(),
  categoryId: z.string().min(1).optional(),
  visibility: z.enum(["all", "visible", "hidden"]).default("all"),
});
export type ListShopProductsQuery = z.infer<typeof listShopProductsQuerySchema>;
