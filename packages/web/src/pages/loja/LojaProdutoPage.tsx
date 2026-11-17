import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import type { ClientShopProductDetail, ClientShopVariant } from "@fitburn/contracts";
import { QueryBlockState } from "../../components/QueryBlockState";
import { Alert } from "../../components/ui/Alert";
import { Button } from "../../components/ui/Button";
import { Pill } from "../../components/ui/Pill";
import { EmptyState } from "../../components/ui/States";
import { ApiError } from "../../lib/auth/api";
import { useCart } from "../../lib/shop/cart";
import { useClientProduct } from "../../lib/shop/client-api";
import { formatCents } from "../../lib/shop/money";
import { Gallery } from "./Gallery";
import { ShopTopBar } from "./ShopTopBar";

function findVariant(
  product: ClientShopProductDetail,
  values: readonly string[],
): ClientShopVariant | undefined {
  return product.variants.find(
    (variant) =>
      variant.values.length === values.length &&
      variant.values.every((value, index) => value === values[index]),
  );
}

function soldOut(variant: ClientShopVariant | undefined): boolean {
  return !variant || variant.availability === "ESGOTADO";
}

/** A primeira combinação com estoque; sem nenhuma, a primeira (a tela mostra "Esgotado"). */
function initialSelection(product: ClientShopProductDetail): string[] {
  const first = product.variants.find((variant) => !soldOut(variant)) ?? product.variants[0];
  return first ? [...first.values] : product.options.map((option) => option.values[0]?.value ?? "");
}

/**
 * Detalhe do produto (L4, #193, proposta-loja): galeria, preço, opções (a combinação sem estoque fica riscada e
 * desabilitada), aviso de poucas unidades, quantidade conforme as regras do produto e "Adicionar ao carrinho".
 * Adicionar é local (carrinho no aparelho), então não exige conexão; a API confere tudo de novo ao fazer o pedido.
 */
export function LojaProdutoPage() {
  const { id = "" } = useParams();
  const query = useClientProduct(id);
  const product = query.data;
  const notFound = query.error instanceof ApiError && query.error.code === "NOT_FOUND";

  return (
    <div className="fb-loja">
      <ShopTopBar backTo="/loja" backLabel="Voltar à loja" />
      {notFound ? (
        <EmptyState
          title="Este produto não está mais à venda."
          action={
            <Link to="/loja" className="fb-ui-btn fb-ui-btn--secondary fb-ui-btn--sm">
              Ver a loja
            </Link>
          }
        />
      ) : (
        <QueryBlockState
          query={query}
          loading="Carregando o produto…"
          error="Não foi possível carregar o produto."
          hasData={product !== undefined}
        />
      )}
      {/* Trocar de produto zera a escolha (a chave é o id). */}
      {product && <ProductView key={product.id} product={product} />}
    </div>
  );
}

function ProductView({ product }: { product: ClientShopProductDetail }) {
  const cart = useCart();
  const [selected, setSelected] = useState(() => initialSelection(product));
  const [wanted, setWanted] = useState(1);
  const [added, setAdded] = useState(false);

  const variant = findVariant(product, selected);
  const unitPrice = variant?.effectivePriceCents ?? product.startingPriceCents;
  const wasPrice =
    product.originalPriceCents !== null && unitPrice === product.startingPriceCents
      ? product.originalPriceCents
      : null;

  // Regras de quantidade: a API valida de novo; aqui só ajudamos. Sem "mais de uma unidade", é 1 por pedido.
  const maxQuantity = product.permiteMaisDeUmaUnidade ? product.limitePorPedido : 1;
  const inCart = cart.lines.find((line) => line.variantId === variant?.id)?.quantity ?? 0;
  const remaining = maxQuantity === null ? Infinity : maxQuantity - inCart;
  const quantity = Math.min(wanted, Math.max(remaining, 1));
  const unavailable = soldOut(variant);
  const canAdd = !unavailable && remaining > 0;

  const label = variant?.label ?? null;

  function select(optionIndex: number, value: string) {
    setSelected((current) => current.map((item, index) => (index === optionIndex ? value : item)));
    setAdded(false);
  }

  function add() {
    if (!variant || !canAdd) return;
    cart.add(
      {
        productId: product.id,
        variantId: variant.id,
        name: product.name,
        variantLabel: label,
        unitPriceCents: variant.effectivePriceCents,
        imageUrl: product.coverImage?.url ?? product.images[0]?.url ?? null,
        maxQuantity,
      },
      quantity,
    );
    setWanted(1);
    setAdded(true);
  }

  return (
    <div className="fb-loja-product">
      <Gallery images={product.images} promo={product.originalPriceCents !== null} />

      <div className="fb-loja-info">
        <div className="fb-loja-info__head">
          {product.category && <p className="fb-loja-kicker">{product.category.name}</p>}
          <h1 className="fb-loja-info__name">{product.name}</h1>
          <p className="fb-loja-price fb-loja-price--big">
            {wasPrice !== null && (
              <>
                <span className="fb-ui-sr-only">De </span>
                <s className="fb-loja-price__was">{formatCents(wasPrice)}</s>
                <span className="fb-ui-sr-only"> por </span>
              </>
            )}
            {formatCents(unitPrice)}
          </p>
        </div>

        {product.options.length > 0 && (
          <div className="fb-loja-options">
            {product.options.map((option, optionIndex) => (
              <fieldset key={option.id} className="fb-loja-group">
                <legend className="fb-loja-group__label">
                  {option.name}
                  <small>{selected[optionIndex]}</small>
                </legend>
                <div className="fb-loja-values">
                  {option.values.map(({ id, value }) => {
                    const candidate = selected.map((item, index) => (index === optionIndex ? value : item));
                    const outOfStock = soldOut(findVariant(product, candidate));
                    return (
                      <Pill
                        key={id}
                        className="fb-loja-value"
                        pressed={selected[optionIndex] === value}
                        disabled={outOfStock}
                        aria-label={outOfStock ? `${value}, esgotado` : undefined}
                        onClick={() => select(optionIndex, value)}
                      >
                        {value}
                      </Pill>
                    );
                  })}
                </div>
              </fieldset>
            ))}
          </div>
        )}

        {variant?.availability === "POUCAS_UNIDADES" && (
          <p className="fb-loja-warn">
            Restam poucas unidades{label ? ` de ${label}` : ""}.
          </p>
        )}

        {product.permiteMaisDeUmaUnidade ? (
          <fieldset className="fb-loja-group">
            <legend className="fb-loja-group__label">
              Quantidade
              {product.limitePorPedido !== null && <small>até {product.limitePorPedido} por pedido</small>}
            </legend>
            <div className="fb-loja-stepper">
              <button
                type="button"
                aria-label="Diminuir"
                disabled={quantity <= 1}
                onClick={() => setWanted(quantity - 1)}
              >
                −
              </button>
              <output>{quantity}</output>
              <button
                type="button"
                aria-label="Aumentar"
                disabled={quantity >= remaining}
                onClick={() => setWanted(quantity + 1)}
              >
                +
              </button>
            </div>
          </fieldset>
        ) : (
          <p className="fb-ui-note">Limite de 1 unidade por pedido.</p>
        )}

        <div className="fb-loja-actions">
          {added && (
            <Alert tone="ok">
              Adicionado ao carrinho. <Link to="/loja/carrinho">Ver carrinho</Link>
            </Alert>
          )}
          <Button variant="primary" block disabled={!canAdd} onClick={add}>
            {unavailable
              ? "Esgotado"
              : canAdd
                ? `Adicionar ao carrinho · ${formatCents(unitPrice * quantity)}`
                : "Já está no carrinho"}
          </Button>
        </div>

        {product.description && <p className="fb-loja-desc">{product.description}</p>}
      </div>
    </div>
  );
}
