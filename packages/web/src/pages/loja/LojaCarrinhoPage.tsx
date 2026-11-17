import { useEffect, useRef, useState } from "react";
import { useMutation, useQueries } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import type { CreateShopOrderRequest, ShopOrder } from "@fitburn/contracts";
import { RequiresNetwork } from "../../components/RequiresNetwork";
import { Alert } from "../../components/ui/Alert";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { Field } from "../../components/ui/Field";
import { EmptyState } from "../../components/ui/States";
import { ApiError, errorMessage } from "../../lib/auth/api";
import { useNetworkRequired } from "../../lib/connectivity/useNetworkRequired";
import { useCart, type CartLine } from "../../lib/shop/cart";
import { clientShopKeys, getClientProduct } from "../../lib/shop/client-api";
import { formatCents } from "../../lib/shop/money";
import { createShopOrder, stockConflictOf } from "../../lib/shop/orders-api";
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

/** "#0043": o número do pedido como a academia o chama. */
export function formatOrderNumber(number: number): string {
  return `#${String(number).padStart(4, "0")}`;
}

function lineLabel(line: CartLine): string {
  return line.variantLabel ? `${line.name} · ${line.variantLabel}` : line.name;
}

/**
 * Uma chave de idempotência por tentativa de compra: a mesma enquanto o pedido a enviar for o mesmo (toque repetido,
 * rede que oscila), nova quando o conteúdo muda (a chave já usada fica ligada ao pedido antigo na API) ou depois de
 * uma recusa da API (a recusa também fica memorizada para a chave).
 */
function useOrderIdempotencyKey() {
  const attempt = useRef<{ signature: string; key: string } | null>(null);
  return {
    keyFor(request: CreateShopOrderRequest): string {
      const signature = JSON.stringify(request);
      if (attempt.current?.signature !== signature) {
        attempt.current = { signature, key: crypto.randomUUID() };
      }
      return attempt.current.key;
    },
    forget() {
      attempt.current = null;
    },
  };
}

/** Frase do aviso para cada item que o estoque não cobre mais. */
function stockNotice(label: string, available: number): string {
  if (available === 0) return `${label} esgotou e saiu do carrinho.`;
  return available === 1
    ? `Restou só 1 unidade de ${label}.`
    : `Restam só ${available} unidades de ${label}.`;
}

/** Tela "Pedido feito" (proposta-loja): número, status e o aviso de que pagamento e retirada são na recepção. */
function OrderPlaced({ order }: { order: ShopOrder }) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => heading.current?.focus({ preventScroll: true }), []);
  return (
    <div className="fb-loja fb-loja-placed">
      <h1 ref={heading} tabIndex={-1} className="fb-loja-placed__title">
        Pedido {formatOrderNumber(order.number)} feito
      </h1>
      <Badge tone="warn">Aguardando aprovação</Badge>
      <p className="fb-loja-placed__text">
        Separamos os itens para você. A academia vai aprovar o pedido. Pagamento e retirada na recepção.
      </p>
      <Link to="/loja" className="fb-ui-btn fb-ui-btn--primary fb-ui-btn--block">
        Voltar à loja
      </Link>
    </div>
  );
}

/**
 * Carrinho (L4, #193; pedido na L5, #196; proposta-loja): itens com quantidade e remover, observação para a equipe,
 * total e "Fazer pedido". O carrinho fica no aparelho até o pedido ser aceito; se o estoque mudou, a API recusa o
 * pedido inteiro, o carrinho é ajustado (nunca limpo) e a pessoa confirma de novo.
 */
export function LojaCarrinhoPage() {
  const cart = useCart();
  const prices = useCurrentPrices(cart.lines);
  const priceOf = (line: CartLine) => prices.get(line.variantId) ?? line.unitPriceCents;
  const totalCents = cart.lines.reduce((sum, line) => sum + priceOf(line) * line.quantity, 0);
  const { offline } = useNetworkRequired();
  const idempotency = useOrderIdempotencyKey();
  const [placed, setPlaced] = useState<ShopOrder | null>(null);
  const [stockNotices, setStockNotices] = useState<string[]>([]);
  const [adjusted, setAdjusted] = useState<ReadonlySet<string>>(new Set());

  const placeOrder = useMutation({
    mutationFn: () => {
      const request: CreateShopOrderRequest = {
        items: cart.lines.map(({ variantId, quantity }) => ({ variantId, quantity })),
        observation: cart.note.trim() || null,
      };
      return createShopOrder(request, idempotency.keyFor(request));
    },
    onMutate: () => {
      setStockNotices([]);
      setAdjusted(new Set());
    },
    onSuccess: (order) => {
      idempotency.forget();
      cart.clear();
      setPlaced(order);
    },
    onError: (error) => {
      // Recusa definitiva da API: a chave ficou memorizada com ela; a próxima tentativa começa uma nova.
      if (error instanceof ApiError && error.code !== "INTERNAL_ERROR") idempotency.forget();
      const conflict = stockConflictOf(error);
      if (!conflict) return;
      const notices: string[] = [];
      const changed = new Set<string>();
      for (const { variantId, availableQuantity } of conflict) {
        const line = cart.lines.find((item) => item.variantId === variantId);
        if (!line || availableQuantity >= line.quantity) continue;
        notices.push(stockNotice(lineLabel(line), availableQuantity));
        changed.add(variantId);
        if (availableQuantity === 0) cart.remove(variantId);
        else cart.setQuantity(variantId, availableQuantity);
      }
      setStockNotices(notices);
      setAdjusted(changed);
    },
  });

  if (placed) return <OrderPlaced order={placed} />;

  const stockConflict = stockConflictOf(placeOrder.error) !== null;
  const failure = placeOrder.error && !stockConflict ? placeOrder.error : null;

  return (
    <div className="fb-loja fb-loja-cart">
      <ShopTopBar title="Carrinho" backTo="/loja" backLabel="Voltar à loja" />

      {stockNotices.length > 0 && (
        <Alert tone="err">
          {stockNotices.join(" ")} Ajustamos o carrinho; confira e faça o pedido de novo.
        </Alert>
      )}

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
              <li
                key={line.variantId}
                className="fb-loja-line"
                aria-label={line.name}
                data-adjusted={adjusted.has(line.variantId) || undefined}
              >
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
            {failure && (
              <Alert tone="err">
                {errorMessage(
                  failure,
                  "Não foi possível enviar o pedido. Seu carrinho foi mantido; tente de novo.",
                )}
              </Alert>
            )}
            <RequiresNetwork>
              <Button
                variant="primary"
                block
                busy={placeOrder.isPending}
                onClick={() => placeOrder.mutate()}
              >
                Fazer pedido
              </Button>
            </RequiresNetwork>
            {offline && <p className="fb-ui-note">Conecte-se para fazer o pedido.</p>}
          </div>
        </>
      )}
    </div>
  );
}
