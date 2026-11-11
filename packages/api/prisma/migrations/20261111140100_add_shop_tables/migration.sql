-- CreateTable
CREATE TABLE "shop_categories" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shop_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "products" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "categoryId" TEXT,
    "priceCents" INTEGER NOT NULL,
    "promoPriceCents" INTEGER,
    "visivel" BOOLEAN NOT NULL DEFAULT true,
    "destaque" BOOLEAN NOT NULL DEFAULT false,
    "permiteMaisDeUmaUnidade" BOOLEAN NOT NULL DEFAULT false,
    "limitePorPedido" INTEGER,
    "excluidoEm" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_variants" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "label" TEXT,
    "stock" INTEGER NOT NULL DEFAULT 0,
    "priceCents" INTEGER,
    "ativa" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "product_variants_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "shop_categories_name_key" ON "shop_categories"("name");

-- CreateIndex
CREATE INDEX "products_excluidoEm_idx" ON "products"("excluidoEm");

-- CreateIndex
CREATE INDEX "products_categoryId_idx" ON "products"("categoryId");

-- CreateIndex
CREATE INDEX "product_variants_productId_idx" ON "product_variants"("productId");

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "shop_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_variants" ADD CONSTRAINT "product_variants_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Regras que o Prisma não modela (última defesa; a API valida antes).
ALTER TABLE "products" ADD CONSTRAINT "products_price_nonnegative" CHECK ("priceCents" >= 0);
ALTER TABLE "products" ADD CONSTRAINT "products_promo_below_price" CHECK ("promoPriceCents" IS NULL OR "promoPriceCents" < "priceCents");
ALTER TABLE "products" ADD CONSTRAINT "products_limit_range" CHECK ("limitePorPedido" IS NULL OR ("limitePorPedido" BETWEEN 1 AND 99));
ALTER TABLE "product_variants" ADD CONSTRAINT "product_variants_stock_nonnegative" CHECK ("stock" >= 0);
ALTER TABLE "product_variants" ADD CONSTRAINT "product_variants_price_nonnegative" CHECK ("priceCents" IS NULL OR "priceCents" >= 0);
