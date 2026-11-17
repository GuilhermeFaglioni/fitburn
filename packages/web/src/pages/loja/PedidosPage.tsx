import { Link } from "react-router-dom";
import { QueryBlockState } from "../../components/QueryBlockState";
import { Badge } from "../../components/ui/Badge";
import { EmptyState } from "../../components/ui/States";
import { formatInstantDate } from "../../lib/agenda/format";
import { formatCents } from "../../lib/shop/money";
import { formatOrderNumber, ORDER_STATUS_LABEL, useMyOrders } from "../../lib/shop/orders-api";
import { ORDER_STATUS_TONE } from "./order-status";
import { ShopTopBar } from "./ShopTopBar";

/**
 * Meus pedidos (L6, #199): os pedidos do cliente, do mais novo para o mais antigo, cada um com número, status, data
 * e total; tocar abre o detalhe. A lista vem da API já ordenada.
 */
export function PedidosPage() {
  const ordersQuery = useMyOrders();
  const orders = ordersQuery.data;

  return (
    <div className="fb-loja fb-loja-orders">
      <ShopTopBar title="Meus pedidos" backTo="/perfil" backLabel="Voltar ao perfil" />

      <QueryBlockState
        query={ordersQuery}
        loading="Carregando seus pedidos…"
        error="Não foi possível carregar seus pedidos."
        hasData={orders !== undefined}
      />

      {orders && orders.length === 0 && (
        <EmptyState
          title="Você ainda não fez nenhum pedido."
          action={
            <Link to="/loja" className="fb-ui-btn fb-ui-btn--secondary fb-ui-btn--sm">
              Ver a loja
            </Link>
          }
        />
      )}

      {orders && orders.length > 0 && (
        <ul className="fb-loja-orders__list">
          {orders.map((order) => {
            const count = order.items.reduce((sum, item) => sum + item.quantity, 0);
            return (
              <li key={order.id}>
                <Link
                  to={`/pedidos/${order.id}`}
                  className="fb-loja-order"
                  aria-label={`Pedido ${formatOrderNumber(order.number)}, ${ORDER_STATUS_LABEL[order.status]}`}
                >
                  <span className="fb-loja-order__head">
                    <b className="fb-loja-order__number">Pedido {formatOrderNumber(order.number)}</b>
                    <Badge tone={ORDER_STATUS_TONE[order.status]}>{ORDER_STATUS_LABEL[order.status]}</Badge>
                  </span>
                  <span className="fb-loja-order__meta">
                    {formatInstantDate(order.createdAt)} · {count === 1 ? "1 item" : `${count} itens`}
                  </span>
                  <span className="fb-loja-price">{formatCents(order.totalCents)}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
