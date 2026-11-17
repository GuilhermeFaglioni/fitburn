import { useEffect, useState } from "react";
import {
  addDays,
  gymToday,
  Module,
  PermissionAction,
  startOfWeek,
  utcToGymDateTime,
  type AdminShopOrder,
  type ShopOrderStatus,
} from "@fitburn/contracts";
import { QueryBlockState } from "../../components/QueryBlockState";
import { Alert } from "../../components/ui/Alert";
import { Badge, type BadgeTone } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { Field } from "../../components/ui/Field";
import { Select } from "../../components/ui/Select";
import { EmptyState } from "../../components/ui/States";
import { Table, type TableColumn } from "../../components/ui/Table";
import { Toolbar } from "../../components/ui/Toolbar";
import { errorMessage } from "../../lib/auth/api";
import { useAuth } from "../../lib/auth/AuthContext";
import { formatDayMonth } from "../../lib/agenda/format";
import {
  hasAdminOrderFilters,
  useAdminOrders,
  useApproveOrder,
  useDeliverOrder,
  type AdminOrderFilters,
  type AdminOrderStatusFilter,
} from "../../lib/shop/admin-orders-api";
import { formatCents } from "../../lib/shop/money";
import { formatOrderNumber, ORDER_STATUS_LABEL } from "../../lib/shop/orders-api";
import { RejectOrderDialog } from "./RejectOrderDialog";
import { ShopAction } from "./ShopAction";

/** Espera da digitação antes de buscar: uma consulta por pausa, não por tecla. */
const SEARCH_DEBOUNCE_MS = 300;

export type OrderPeriod = "all" | "last30" | "week";

const PERIOD_LABEL: Record<OrderPeriod, string> = {
  all: "Todo o período",
  last30: "Últimos 30 dias",
  week: "Esta semana",
};

/** Datas locais da academia (inclusivas) de cada período; `all` não limita. */
export function periodRange(period: OrderPeriod, today: string = gymToday()): { from: string; to: string } {
  if (period === "last30") return { from: addDays(today, -29), to: today };
  if (period === "week") return { from: startOfWeek(today), to: today };
  return { from: "", to: "" };
}

const STATUS_TONE: Record<ShopOrderStatus, BadgeTone> = {
  AGUARDANDO_APROVACAO: "warn",
  APROVADO: "ok",
  ENTREGUE: "solid",
  RECUSADO: "err",
  CANCELADO: "neutral",
};

const STATUS_FILTERS: ShopOrderStatus[] = ["AGUARDANDO_APROVACAO", "APROVADO", "ENTREGUE", "RECUSADO", "CANCELADO"];

/** "11/11 · 09:12": quando o pedido foi feito, no horário da academia. */
function formatCreatedAt(iso: string): string {
  const { date, time } = utcToGymDateTime(iso);
  return `${formatDayMonth(date)} · ${time}`;
}

function Items({ order }: { order: AdminShopOrder }) {
  return (
    <ul className="fb-shop-order-items">
      {order.items.map((item) => (
        <li key={item.id}>
          {item.productName}
          {item.variantLabel && <span className="fb-shop-soft"> ({item.variantLabel})</span>} ×{item.quantity}
        </li>
      ))}
    </ul>
  );
}

/**
 * Fila de pedidos (D-039, #200, docs/design/proposta-loja.html): busca por cliente ou número, filtros de status e
 * período e a tabela com Aprovar, Recusar (diálogo com motivo opcional) e Marcar como entregue. Cada botão só aparece
 * quando a transição vale para o status do pedido; gravar exige Executar da Loja e rede. Depois de uma ação a lista
 * recarrega; se a API recusar (transição inválida, pedido mudou), a mensagem dela aparece acima da lista. O período
 * vive na página (`LojaAdminPage`), que o usa também como padrão do "Exportar pedidos (CSV)".
 */
export function OrdersTab({ period, onPeriodChange }: { period: OrderPeriod; onPeriodChange: (next: OrderPeriod) => void }) {
  const { can } = useAuth();
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [status, setStatus] = useState<AdminOrderStatusFilter>("AGUARDANDO_APROVACAO");
  const [rejecting, setRejecting] = useState<AdminShopOrder | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [search]);

  const filters: AdminOrderFilters = { q: debouncedSearch, status, ...periodRange(period) };
  const ordersQuery = useAdminOrders(filters);
  const approveMutation = useApproveOrder();
  const deliverMutation = useDeliverOrder();
  const busy = approveMutation.isPending || deliverMutation.isPending;
  const canExecute = can(Module.LOJA, PermissionAction.EXECUTE);

  function run(order: AdminShopOrder, mutation: typeof approveMutation, fallback: string) {
    setActionError(null);
    mutation.mutate(order.id, { onError: (error) => setActionError(errorMessage(error, fallback)) });
  }

  const columns: TableColumn<AdminShopOrder>[] = [
    {
      key: "number",
      header: "Pedido",
      className: "fb-ui-table__name",
      cell: (order) => formatOrderNumber(order.number),
    },
    { key: "client", header: "Cliente", cell: (order) => order.client.fullName },
    { key: "items", header: "Itens", cell: (order) => <Items order={order} /> },
    { key: "total", header: "Total", cell: (order) => formatCents(order.totalCents) },
    {
      key: "createdAt",
      header: "Feito em",
      className: "fb-ui-table__muted",
      cell: (order) => formatCreatedAt(order.createdAt),
    },
    {
      key: "status",
      header: "Status",
      cell: (order) => (
        <Badge tone={STATUS_TONE[order.status]} dot={order.status === "APROVADO"}>
          {ORDER_STATUS_LABEL[order.status].toUpperCase()}
        </Badge>
      ),
    },
    {
      key: "actions",
      header: "Ações",
      actions: true,
      cell: (order) => {
        const label = formatOrderNumber(order.number);
        const reason = "Você não tem permissão para aprovar, recusar ou entregar pedidos.";
        if (order.status === "AGUARDANDO_APROVACAO") {
          return (
            <div className="fb-ui-row-actions">
              <ShopAction allowed={canExecute} reason={reason}>
                <Button
                  size="sm"
                  variant="primary"
                  aria-label={`Aprovar pedido ${label}`}
                  disabled={busy}
                  onClick={() => run(order, approveMutation, "Não foi possível aprovar o pedido.")}
                >
                  Aprovar
                </Button>
              </ShopAction>
              <ShopAction allowed={canExecute} reason={reason}>
                <Button
                  size="sm"
                  variant="ghost-danger"
                  aria-label={`Recusar pedido ${label}`}
                  disabled={busy}
                  onClick={() => {
                    setActionError(null);
                    setRejecting(order);
                  }}
                >
                  Recusar
                </Button>
              </ShopAction>
            </div>
          );
        }
        if (order.status === "APROVADO") {
          return (
            <div className="fb-ui-row-actions">
              <ShopAction allowed={canExecute} reason={reason}>
                <Button
                  size="sm"
                  aria-label={`Marcar pedido ${label} como entregue`}
                  disabled={busy}
                  onClick={() => run(order, deliverMutation, "Não foi possível marcar o pedido como entregue.")}
                >
                  Marcar como entregue
                </Button>
              </ShopAction>
            </div>
          );
        }
        return null;
      },
    },
  ];

  const orders = ordersQuery.data;
  const filtered = hasAdminOrderFilters(filters);

  return (
    <div className="fb-ui-stack">
      <Toolbar role="search" aria-label="Filtrar pedidos">
        <Field
          hideLabel
          label="Buscar pedido"
          type="search"
          placeholder="Buscar por cliente ou nº do pedido"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <Select
          hideLabel
          label="Status"
          value={status}
          onChange={(event) => setStatus(event.target.value as AdminOrderStatusFilter)}
        >
          {STATUS_FILTERS.map((value) => (
            <option key={value} value={value}>
              {value === "AGUARDANDO_APROVACAO" ? "Status: aguardando" : ORDER_STATUS_LABEL[value]}
            </option>
          ))}
          <option value="">Todos os status</option>
        </Select>
        <Select
          hideLabel
          label="Período"
          value={period}
          onChange={(event) => onPeriodChange(event.target.value as OrderPeriod)}
        >
          {(Object.keys(PERIOD_LABEL) as OrderPeriod[]).map((value) => (
            <option key={value} value={value}>
              {PERIOD_LABEL[value]}
            </option>
          ))}
        </Select>
      </Toolbar>

      {actionError && <Alert>{actionError}</Alert>}

      <QueryBlockState
        query={ordersQuery}
        hasData={orders !== undefined}
        loading="Carregando pedidos…"
        error="Não foi possível carregar os pedidos."
      />
      {orders && orders.length === 0 && (
        <EmptyState
          title={filtered ? "Nenhum pedido encontrado." : "Nenhum pedido ainda."}
          description={filtered ? "Ajuste a busca ou os filtros." : undefined}
        />
      )}
      {orders && orders.length > 0 && (
        <Table label="Pedidos" columns={columns} rows={orders} rowKey={(order) => order.id} />
      )}

      {rejecting && <RejectOrderDialog order={rejecting} onClose={() => setRejecting(null)} />}
    </div>
  );
}
