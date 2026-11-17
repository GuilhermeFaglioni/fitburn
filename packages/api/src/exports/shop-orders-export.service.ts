import { Injectable } from "@nestjs/common";
import { SHOP_ORDERS_EXPORT_COLUMNS, utcToGymDateTime } from "@fitburn/contracts";
import { PrismaService } from "../prisma/prisma.service.js";
import { assertFullScope, type ScopedRequester } from "../permissions/scoped-requester.js";
import { SHOP_FULL_SCOPE_MESSAGE } from "../shop/shop-constants.js";
import { serializeCsv, type CsvCell } from "./csv.js";
import type { ExportPeriod } from "./export-period.js";

/** Linha da exportação: um item, com os dados do pedido repetidos para leitura no CSV. */
export interface ShopOrderExportRecord {
  number: number;
  createdAt: Date;
  clientName: string;
  status: string;
  productName: string;
  variantLabel: string | null;
  quantity: number;
  unitPriceCents: number;
  subtotalCents: number;
  totalCents: number;
}

/** Mapeia um item para colunas em português e valores monetários em reais. */
export function shopOrderExportCsvRow(record: ShopOrderExportRecord): CsvCell[] {
  const { date } = utcToGymDateTime(record.createdAt);
  return [
    record.number,
    date,
    record.clientName,
    record.status,
    record.productName,
    record.variantLabel,
    record.quantity,
    record.unitPriceCents / 100,
    record.subtotalCents / 100,
    record.totalCents / 100,
  ];
}

@Injectable()
export class ShopOrdersExportService {
  constructor(private readonly prisma: PrismaService) {}

  /** CSV dos pedidos criados no período; uma linha por item e somente com escopo total da Loja. */
  async buildCsv(period: ExportPeriod, requester: ScopedRequester): Promise<string> {
    assertFullScope(requester, SHOP_FULL_SCOPE_MESSAGE);

    const orders = await this.prisma.shopOrder.findMany({
      where: { createdAt: { gte: period.startsAtGte, lt: period.startsAtLt } },
      select: {
        number: true,
        status: true,
        createdAt: true,
        totalCents: true,
        client: { select: { fullName: true } },
        items: {
          select: {
            productName: true,
            variantLabel: true,
            quantity: true,
            unitPriceCents: true,
            subtotalCents: true,
          },
          orderBy: { id: "asc" },
        },
      },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });

    const records = orders.flatMap((order) =>
      order.items.map((item) => ({
        number: order.number,
        createdAt: order.createdAt,
        clientName: order.client.fullName,
        status: order.status,
        productName: item.productName,
        variantLabel: item.variantLabel,
        quantity: item.quantity,
        unitPriceCents: item.unitPriceCents,
        subtotalCents: item.subtotalCents,
        totalCents: order.totalCents,
      })),
    );

    return serializeCsv(SHOP_ORDERS_EXPORT_COLUMNS, records.map(shopOrderExportCsvRow));
  }
}
