import { useState } from "react";
import { useParams } from "react-router-dom";
import { ErrorCode, type ShopOrder, type ShopOrderStatus } from "@fitburn/contracts";
import { QueryBlockState } from "../../components/QueryBlockState";
import { RequiresNetwork } from "../../components/RequiresNetwork";
import { Alert } from "../../components/ui/Alert";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { ApiError } from "../../lib/auth/api";
import { formatInstantDate, formatInstantHour } from "../../lib/agenda/format";
import { useNetworkRequired } from "../../lib/connectivity/useNetworkRequired";
import { formatCents } from "../../lib/shop/money";
import { formatOrderNumber, ORDER_STATUS_LABEL, useMyOrder } from "../../lib/shop/orders-api";
import { CancelOrderDialog } from "./CancelOrderDialog";
import { ORDER_STATUS_TONE } from "./order-status";
import { ShopTopBar } from "./ShopTopBar";

/** O que cada status significa para o cliente, em uma frase. */
const STATUS_HINT: Record<ShopOrderStatus, string> = {
  AGUARDANDO_APROVACAO: "A academia ainda vai aprovar o pedido. Pagamento e retirada na recepção.",
  APROVADO: "Pedido aprovado. Retire na recepção e faça o pagamento por lá.",
  RECUSADO: "A academia não aprovou este pedido.",
  ENTREGUE: "Pedido entregue.",
  CANCELADO: "Pedido cancelado.",
};

/** Nome de cada etapa da linha do tempo: o primeiro evento é a criação do pedido. */
function eventLabel(status: ShopOrderStatus): string {
  return status === "AGUARDANDO_APROVACAO" ? "Pedido feito" : ORDER_STATUS_LABEL[status];
}

function Timeline({ order }: { order: ShopOrder }) {
  const events = [...order.events].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  return (
    <section className="fb-loja-order-section" aria-labelledby="fb-pedido-historico">
      <h2 id="fb-pedido-historico" className="fb-ui-section-title">
        Acompanhamento
      </h2>
      <ol className="fb-loja-timeline">
        {events.map((event) => (
          <li key={event.id} className="fb-loja-timeline__item" data-status={event.toStatus}>
            <span className="fb-loja-timeline__dot" aria-hidden="true" />
            <div className="fb-loja-timeline__body">
              <b className="fb-loja-timeline__title">{eventLabel(event.toStatus)}</b>
              <span className="fb-loja-timeline__when">
                {formatInstantDate(event.createdAt)} às {formatInstantHour(event.createdAt)}
              </span>
              {event.note && (
                <p className="fb-loja-timeline__note">
                  {event.toStatus === "RECUSADO" ? "Motivo: " : ""}
                  {event.note}
                </p>
              )}
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

/**
 * Detalhe do pedido (L6, #199): status, itens, total, observação e a linha do tempo dos status; a nota do evento
 * "Recusado" é o motivo da recusa. Só o pedido aguardando aprovação pode ser cancelado, com confirmação.
 */
export function PedidoDetalhePage() {
  const { id = "" } = useParams();
  const orderQuery = useMyOrder(id);
  const order = orderQuery.data;
  const { offline } = useNetworkRequired();
  const [cancelling, setCancelling] = useState(false);
  const notFound = orderQuery.error instanceof ApiError && orderQuery.error.code === ErrorCode.ORDER_NOT_FOUND;

  return (
    <div className="fb-loja fb-loja-order-detail">
      <ShopTopBar backTo="/pedidos" backLabel="Voltar para Meus pedidos" />

      {notFound ? (
        <Alert>Pedido não encontrado.</Alert>
      ) : (
        <QueryBlockState
          query={orderQuery}
          loading="Carregando o pedido…"
          error="Não foi possível carregar o pedido."
          hasData={order !== undefined}
        />
      )}

      {order && (
        <>
          <div className="fb-loja-order-detail__head">
            <h1 className="fb-loja-top__title">Pedido {formatOrderNumber(order.number)}</h1>
            <Badge tone={ORDER_STATUS_TONE[order.status]}>{ORDER_STATUS_LABEL[order.status]}</Badge>
            <p className="fb-ui-note">
              Feito em {formatInstantDate(order.createdAt)}. {STATUS_HINT[order.status]}
            </p>
          </div>

          <section className="fb-loja-order-section" aria-labelledby="fb-pedido-itens">
            <h2 id="fb-pedido-itens" className="fb-ui-section-title">
              Itens
            </h2>
            <ul className="fb-loja-order-items">
              {order.items.map((item) => (
                <li key={item.id} className="fb-loja-order-item">
                  <span className="fb-loja-order-item__meta">
                    <b>{item.productName}</b>
                    {item.variantLabel && <span className="fb-ui-note">{item.variantLabel}</span>}
                    <span className="fb-ui-note">
                      {item.quantity} × {formatCents(item.unitPriceCents)}
                    </span>
                  </span>
                  <span className="fb-loja-price">{formatCents(item.subtotalCents)}</span>
                </li>
              ))}
            </ul>
            <div className="fb-loja-total">
              <span>Total</span>
              <strong>{formatCents(order.totalCents)}</strong>
            </div>
            {order.observation && <p className="fb-ui-note">Sua observação: {order.observation}</p>}
          </section>

          <Timeline order={order} />

          {order.status === "AGUARDANDO_APROVACAO" && (
            <div className="fb-loja-order-detail__cancel">
              <RequiresNetwork>
                <Button variant="danger" block onClick={() => setCancelling(true)}>
                  Cancelar pedido
                </Button>
              </RequiresNetwork>
              {offline && <p className="fb-ui-note">Conecte-se para cancelar o pedido.</p>}
            </div>
          )}

          {cancelling && (
            <CancelOrderDialog
              orderId={order.id}
              orderNumber={order.number}
              onClose={() => setCancelling(false)}
            />
          )}
        </>
      )}
    </div>
  );
}
