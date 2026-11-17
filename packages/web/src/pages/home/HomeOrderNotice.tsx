import { Link } from "react-router-dom";
import { formatOrderNumber, useApprovalNotice } from "../../lib/shop/orders-api";

/**
 * Aviso do Início (L6, #199): "Pedido #N aprovado · retire na recepção" enquanto houver pedido aprovado a retirar;
 * toca para abrir Meus pedidos. Sem pedido aprovado, ou enquanto carrega ou sem conexão, não mostra nada: é um
 * aviso a mais, nunca bloqueia nem substitui o resto da tela.
 */
export function HomeOrderNotice() {
  const notice = useApprovalNotice();
  const number = notice.data?.number;
  if (number == null) return null;

  return (
    <Link to="/pedidos" className="fb-home__order-notice" role="status">
      <span>
        Pedido {formatOrderNumber(number)} aprovado · retire na recepção
      </span>
      <span aria-hidden="true">→</span>
    </Link>
  );
}
