import { effectivePriceCents } from "../src/shop/shop-pricing.js";

describe("Loja: preço efetivo da variação", () => {
  it("usa o preço próprio da variação antes de qualquer outro", () => {
    expect(
      effectivePriceCents({ priceCents: 15_000, promoPriceCents: 12_000, variantPriceCents: 9_900 }),
    ).toBe(9_900);
  });

  it("sem preço próprio, usa o promocional do produto", () => {
    expect(
      effectivePriceCents({ priceCents: 15_000, promoPriceCents: 12_000, variantPriceCents: null }),
    ).toBe(12_000);
  });

  it("sem preço próprio nem promoção, usa o preço do produto", () => {
    expect(
      effectivePriceCents({ priceCents: 15_000, promoPriceCents: null, variantPriceCents: null }),
    ).toBe(15_000);
  });

  it("preço próprio zero vale (gratuito), não cai para o promocional", () => {
    expect(
      effectivePriceCents({ priceCents: 15_000, promoPriceCents: 12_000, variantPriceCents: 0 }),
    ).toBe(0);
  });
});
