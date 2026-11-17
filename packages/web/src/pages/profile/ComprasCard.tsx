import { Link } from "react-router-dom";
import { Badge } from "../../components/ui/Badge";
import { Card } from "../../components/ui/Card";
import { formatOrderNumber, ORDER_STATUS_LABEL, useMyOrders } from "../../lib/shop/orders-api";
import { ORDER_STATUS_TONE } from "../loja/order-status";

/**
 * Bloco "Compras" do Perfil (L6, #199): link para Meus pedidos e o status do pedido mais recente.
 * Sem pedidos, ou enquanto carrega ou sem conexão, mostra só os links: o status é um extra, não bloqueia o Perfil.
 */
export function ComprasCard() {
  const orders = useMyOrders();
  const latest = orders.data?.[0];

  return (
    <Card as="section" flat className="fb-profile__card" aria-labelledby="fb-profile-compras">
      <h2 id="fb-profile-compras" className="fb-profile__card-title">
        Compras
      </h2>
      <nav aria-label="Compras" className="fb-profile__compras-links">
        <Link to="/pedidos">Meus pedidos</Link>
        <Link to="/loja">Loja Fitburn</Link>
      </nav>
      {latest && (
        <p className="fb-profile__password-hint">
          Último pedido {formatOrderNumber(latest.number)}{" "}
          <Badge tone={ORDER_STATUS_TONE[latest.status]}>{ORDER_STATUS_LABEL[latest.status]}</Badge>
        </p>
      )}
    </Card>
  );
}
