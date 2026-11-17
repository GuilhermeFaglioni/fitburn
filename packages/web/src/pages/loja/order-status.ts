import type { ShopOrderStatus } from "@fitburn/contracts";
import type { BadgeTone } from "../../components/ui/Badge";

/** Cor do selo de cada status do pedido (o significado vai sempre no texto do selo). */
export const ORDER_STATUS_TONE: Record<ShopOrderStatus, BadgeTone> = {
  AGUARDANDO_APROVACAO: "warn",
  APROVADO: "ok",
  RECUSADO: "err",
  ENTREGUE: "neutral",
  CANCELADO: "neutral",
};
