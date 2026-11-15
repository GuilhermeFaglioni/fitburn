/** Campos de preço de uma variação e do produto que definem o preço que o cliente paga. */
export interface ShopPriceFields {
  /** Preço do produto, em centavos. */
  priceCents: number;
  /** Preço promocional do produto (null se não houver). */
  promoPriceCents: number | null;
  /** Preço próprio da variação (null se ela usa o do produto). */
  variantPriceCents: number | null;
}

/**
 * Preço efetivo em centavos: preço próprio da variação, senão preço promocional
 * do produto, senão preço do produto. Única regra de preço da loja: a API devolve
 * o resultado em cada variação e o app só exibe.
 */
export function effectivePriceCents(fields: ShopPriceFields): number {
  if (fields.variantPriceCents !== null) return fields.variantPriceCents;
  if (fields.promoPriceCents !== null) return fields.promoPriceCents;
  return fields.priceCents;
}
