import type { ClientShopProduct } from "@fitburn/contracts";
import { formatCents } from "../../lib/shop/money";

/** Preço do cartão: "a partir de" quando as variações diferem; senão o preço, com o cheio riscado na promoção. */
export function ProductPrice({ product }: { product: ClientShopProduct }) {
  if (product.hasPriceVariation) {
    return (
      <span className="fb-loja-price">
        a partir de {formatCents(product.startingPriceCents)}
      </span>
    );
  }
  return (
    <span className="fb-loja-price">
      {product.originalPriceCents !== null && (
        <>
          <span className="fb-ui-sr-only">De </span>
          <s className="fb-loja-price__was">{formatCents(product.originalPriceCents)}</s>
          <span className="fb-ui-sr-only"> por </span>
        </>
      )}
      {formatCents(product.startingPriceCents)}
    </span>
  );
}
