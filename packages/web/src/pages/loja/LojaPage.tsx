import { Link, useSearchParams } from "react-router-dom";
import type { ClientShopProduct } from "@fitburn/contracts";
import { QueryBlockState } from "../../components/QueryBlockState";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { Pill } from "../../components/ui/Pill";
import { EmptyState } from "../../components/ui/States";
import { useClientCategories, useClientProducts } from "../../lib/shop/client-api";
import { formatCents } from "../../lib/shop/money";
import { ProductImage } from "./ProductImage";
import { ShopTopBar } from "./ShopTopBar";

/** Preço do cartão: "a partir de" quando as variações diferem; senão o preço, com o cheio riscado na promoção. */
function Price({ product }: { product: ClientShopProduct }) {
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

function ProductCard({ product }: { product: ClientShopProduct }) {
  const soldOut = product.availability === "ESGOTADO";
  const promo = product.originalPriceCents !== null;
  return (
    <li>
      <Link
        to={`/loja/${product.id}`}
        className="fb-loja-card"
        data-soldout={soldOut || undefined}
      >
        <span className="fb-loja-card__photo">
          <ProductImage image={product.coverImage} alt={product.name} className="fb-loja-card__img" />
          {soldOut ? (
            <Badge className="fb-loja-card__tag">ESGOTADO</Badge>
          ) : (
            promo && (
              <Badge tone="brand" className="fb-loja-card__tag">
                PROMO
              </Badge>
            )
          )}
        </span>
        <b className="fb-loja-card__name">{product.name}</b>
        <Price product={product} />
      </Link>
    </li>
  );
}

/**
 * Catálogo da loja (L4, #193, proposta-loja): filtro por categoria (na URL, `?categoria=`) e grade de produtos com
 * foto, nome e preço. A API só devolve o que o cliente pode comprar; o estoque exato nunca chega, só a disponibilidade.
 */
export function LojaPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const categoryId = searchParams.get("categoria") ?? "";
  const categories = useClientCategories().data ?? [];
  const productsQuery = useClientProducts(categoryId);
  const products = productsQuery.data;

  const selectCategory = (id: string) => setSearchParams(id ? { categoria: id } : {});

  return (
    <div className="fb-loja">
      <ShopTopBar title="Loja Fitburn" backTo="/" backLabel="Voltar ao início" />

      {categories.length > 0 && (
        <div className="fb-loja-chips" role="group" aria-label="Categorias">
          <Pill pressed={categoryId === ""} onClick={() => selectCategory("")}>
            Tudo
          </Pill>
          {categories.map((category) => (
            <Pill
              key={category.id}
              pressed={categoryId === category.id}
              onClick={() => selectCategory(category.id)}
            >
              {category.name}
            </Pill>
          ))}
        </div>
      )}

      <QueryBlockState
        query={productsQuery}
        loading="Carregando os produtos…"
        error="Não foi possível carregar a loja."
        hasData={products !== undefined}
      />
      {products &&
        (products.length === 0 ? (
          categoryId ? (
            <EmptyState
              title="Nenhum produto nesta categoria."
              action={
                <Button size="sm" onClick={() => selectCategory("")}>
                  Ver todos os produtos
                </Button>
              }
            />
          ) : (
            <EmptyState title="Ainda não há produtos à venda. Volte em breve." />
          )
        ) : (
          <ul className="fb-loja-grid">
            {products.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </ul>
        ))}
    </div>
  );
}
