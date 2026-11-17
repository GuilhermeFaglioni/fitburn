import { Link } from "react-router-dom";
import { BagIcon } from "../../components/icons/BagIcon";
import { Badge } from "../../components/ui/Badge";
import { useCart } from "../../lib/shop/cart";

/** Sacola do cabeçalho do cliente (em qualquer tela): leva ao carrinho e conta os produtos que há nele. */
export function CartLink() {
  const { count } = useCart();
  const label = count === 0 ? "Carrinho vazio" : `Carrinho, ${count} ${count === 1 ? "item" : "itens"}`;
  return (
    <Link to="/loja/carrinho" className="fb-loja-bag" aria-label={label}>
      <BagIcon />
      {count > 0 && (
        <Badge tone="solid" className="fb-loja-bag__count" aria-hidden="true">
          {count}
        </Badge>
      )}
    </Link>
  );
}
