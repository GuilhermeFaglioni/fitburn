import { QueryBlockState } from "../../components/QueryBlockState";
import { BagIcon } from "../../components/icons/BagIcon";
import { Badge } from "../../components/ui/Badge";
import { ShortcutCarousel, ShortcutFrame } from "../../components/ui/ShortcutCarousel";
import { useFeaturedProducts } from "../../lib/shop/client-api";
import { ProductImage } from "../loja/ProductImage";
import { ProductPrice } from "../loja/ProductPrice";
import { ShortcutLabel } from "./HomeBodyShortcut";

/** Quantos destaques entram no carrossel (a API já limita; o cartão final "Ver loja" vem depois). */
const MAX_PRODUCTS = 3;
const SHOP_LABEL = "Loja Fitburn";

/**
 * Atalho Loja do Início (N2, #201): a foto de capa, o nome e o preço dos destaques (até 3, ou os 3 mais recentes, a
 * API decide), com o selo PROMO; tocar abre o produto. O último slide é o cartão "Ver loja". Sem produtos, o atalho
 * some e o Corpo ocupa a largura toda. Carrega, falha e fica sem conexão sozinho.
 */
export function HomeShopShortcut() {
  const query = useFeaturedProducts();
  const products = query.data;

  if (products === undefined) {
    return (
      <ShortcutFrame label={SHOP_LABEL} className="fb-home-shortcut__frame">
        <div className="fb-home-shortcut__frame-body">
          <ShortcutLabel icon={<BagIcon />}>Loja</ShortcutLabel>
          <QueryBlockState
            className="fb-home__state fb-home-shortcut__state"
            query={query}
            loading="Carregando…"
            error="Não foi possível carregar a loja."
            hasData={false}
          />
        </div>
      </ShortcutFrame>
    );
  }

  if (products.length === 0) return null;

  return (
    <ShortcutCarousel
      label={SHOP_LABEL}
      footLink={{ to: "/loja", label: "Ver loja →" }}
      slides={[
        ...products.slice(0, MAX_PRODUCTS).map((product) => {
          const soldOut = product.availability === "ESGOTADO";
          return {
            key: product.id,
            to: `/loja/${product.id}`,
            className: "fb-home-shortcut__link--photo",
            children: (
              <>
                <span className="fb-home-shortcut__photo" data-soldout={soldOut || undefined}>
                  <ProductImage url={product.coverImage?.url} alt="" className="fb-home-shortcut__img" />
                </span>
                {soldOut ? (
                  <Badge className="fb-home-shortcut__tag">ESGOTADO</Badge>
                ) : (
                  product.originalPriceCents !== null && (
                    <Badge tone="brand" className="fb-home-shortcut__tag">
                      PROMO
                    </Badge>
                  )
                )}
                <span className="fb-home-shortcut__text">
                  <span className="fb-home-shortcut__name">{product.name}</span>
                  <ProductPrice product={product} />
                </span>
              </>
            ),
          };
        }),
        {
          key: "ver-loja",
          to: "/loja",
          className: "fb-home-shortcut__link--more",
          children: (
            <>
              <ShortcutLabel icon={<BagIcon />}>Loja</ShortcutLabel>
              <b className="fb-home-shortcut__headline">Veja todos os produtos</b>
              <em className="fb-home-shortcut__go">Ver loja →</em>
            </>
          ),
        },
      ]}
    />
  );
}
