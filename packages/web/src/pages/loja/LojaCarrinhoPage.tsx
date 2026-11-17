import { useQueries } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Button } from "../../components/ui/Button";
import { Field } from "../../components/ui/Field";
import { EmptyState } from "../../components/ui/States";
import { useCart, type CartLine } from "../../lib/shop/cart";
import { clientShopKeys, getClientProduct } from "../../lib/shop/client-api";
import { formatCents } from "../../lib/shop/money";
import { ProductImage } from "./ProductImage";
import { ShopTopBar } from "./ShopTopBar";

/**
 * Preço atual de cada variação do carrinho. Ao abrir o carrinho o app revalida com a API (spec #183); sem conexão,
 * ou se o produto saiu da loja, vale o preço guardado no item. O estoque é conferido pela API ao fazer o pedido.
 */
function useCurrentPrices(lines: CartLine[]): Map<string, number> {
  const productIds = [...new Set(lines.map((line) => line.productId))];
  const results = useQueries({
    queries: productIds.map((id) => ({
      queryKey: clientShopKeys.product(id),
      queryFn: () => getClientProduct(id),
    })),
  });
  const prices = new Map<string, number>();
  for (const { data } of results) {
    for (const variant of data?.variants ?? []) prices.set(variant.id, variant.effectivePriceCents);
  }
  return prices;
}

/**
 * Carrinho (L4, #193, proposta-loja): itens com quantidade e remover, observação para a equipe e total. Fica no
 * aparelho até virar pedido. O botão "Fazer pedido" entra na L5; por ora o aviso diz como será o pedido.
 */
export function LojaCarrinhoPage() {
  const cart = useCart();
  const prices = useCurrentPrices(cart.lines);
  const priceOf = (line: CartLine) => prices.get(line.variantId) ?? line.unitPriceCents;
  const totalCents = cart.lines.reduce((sum, line) => sum + priceOf(line) * line.quantity, 0);

  return (
    <div className="fb-loja fb-loja-cart">
      <ShopTopBar title="Carrinho" backTo="/loja" backLabel="Voltar à loja" />

      {cart.lines.length === 0 ? (
        <EmptyState
          title="Seu carrinho está vazio."
          action={
            <Link to="/loja" className="fb-ui-btn fb-ui-btn--secondary fb-ui-btn--sm">
              Ver a loja
            </Link>
          }
        />
      ) : (
        <>
          <ul className="fb-loja-lines">
            {cart.lines.map((line) => (
              <li key={line.variantId} className="fb-loja-line" aria-label={line.name}>
                <span className="fb-loja-line__photo">
                  <ProductImage
                    url={line.imageUrl}
                    alt={line.name}
                    className="fb-loja-line__img"
                  />
                </span>
                <div className="fb-loja-line__meta">
                  <b className="fb-loja-line__name">{line.name}</b>
                  {(line.variantLabel || line.maxQuantity === 1) && (
                    <span className="fb-loja-line__variant">
                      {[line.variantLabel, line.maxQuantity === 1 ? "1 por pedido" : null]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  )}
                  <div className="fb-loja-line__foot">
                    <span className="fb-loja-price">{formatCents(priceOf(line) * line.quantity)}</span>
                    <div className="fb-loja-line__actions">
                      {line.maxQuantity !== 1 && (
                        <div className="fb-loja-stepper">
                          <button
                            type="button"
                            aria-label={`Diminuir quantidade de ${line.name}`}
                            disabled={line.quantity <= 1}
                            onClick={() => cart.setQuantity(line.variantId, line.quantity - 1)}
                          >
                            −
                          </button>
                          <output>{line.quantity}</output>
                          <button
                            type="button"
                            aria-label={`Aumentar quantidade de ${line.name}`}
                            disabled={line.maxQuantity !== null && line.quantity >= line.maxQuantity}
                            onClick={() => cart.setQuantity(line.variantId, line.quantity + 1)}
                          >
                            +
                          </button>
                        </div>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        aria-label={`Remover ${line.name}`}
                        onClick={() => cart.remove(line.variantId)}
                      >
                        Remover
                      </Button>
                    </div>
                  </div>
                </div>
              </li>
            ))}
          </ul>

          <Field
            label="Observação para a equipe (opcional)"
            placeholder="Ex.: retiro na sexta à noite"
            value={cart.note}
            onChange={(event) => cart.setNote(event.target.value)}
          />

          <div className="fb-loja-summary">
            <div className="fb-loja-total">
              <span>Total</span>
              <strong>{formatCents(totalCents)}</strong>
            </div>
            <p className="fb-ui-note">
              O pedido fica aguardando a aprovação da academia. Pagamento e retirada são feitos na recepção.
            </p>
          </div>
        </>
      )}
    </div>
  );
}
