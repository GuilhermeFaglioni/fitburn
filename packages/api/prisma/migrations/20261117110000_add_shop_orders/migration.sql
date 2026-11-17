CREATE TYPE "ShopOrderStatus" AS ENUM (
  'AGUARDANDO_APROVACAO',
  'APROVADO',
  'RECUSADO',
  'ENTREGUE',
  'CANCELADO'
);

CREATE TABLE "shop_orders" (
  "id" TEXT NOT NULL,
  "number" INTEGER NOT NULL,
  "status" "ShopOrderStatus" NOT NULL DEFAULT 'AGUARDANDO_APROVACAO',
  "observation" TEXT,
  "totalCents" INTEGER NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  "clientId" TEXT NOT NULL,
  CONSTRAINT "shop_orders_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "shop_orders_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "shop_orders_number_key" ON "shop_orders"("number");
CREATE INDEX "shop_orders_clientId_createdAt_idx" ON "shop_orders"("clientId", "createdAt");
CREATE INDEX "shop_orders_status_createdAt_idx" ON "shop_orders"("status", "createdAt");

CREATE TABLE "shop_order_items" (
  "id" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "variantId" TEXT NOT NULL,
  "productName" TEXT NOT NULL,
  "variantLabel" TEXT,
  "optionsSnapshot" JSONB NOT NULL,
  "unitPriceCents" INTEGER NOT NULL,
  "quantity" INTEGER NOT NULL,
  "subtotalCents" INTEGER NOT NULL,
  CONSTRAINT "shop_order_items_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "shop_order_items_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "shop_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "shop_order_items_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "product_variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "shop_order_items_orderId_idx" ON "shop_order_items"("orderId");

CREATE TABLE "shop_order_events" (
  "id" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "fromStatus" "ShopOrderStatus",
  "toStatus" "ShopOrderStatus" NOT NULL,
  "actorId" TEXT NOT NULL,
  "note" TEXT,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "shop_order_events_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "shop_order_events_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "shop_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "shop_order_events_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "shop_order_events_orderId_createdAt_idx" ON "shop_order_events"("orderId", "createdAt");

CREATE TABLE "shop_order_counters" (
  "id" INTEGER NOT NULL DEFAULT 1,
  "lastNumber" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "shop_order_counters_pkey" PRIMARY KEY ("id")
);
INSERT INTO "shop_order_counters" ("id", "lastNumber") VALUES (1, 0);
