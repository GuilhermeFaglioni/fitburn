-- Opções e variações com estoque (#190). Variações da L1 (produto simples) ficam com
-- combinationKey '' (default), posição 0, não descontinuadas.

-- CreateTable
CREATE TABLE "product_options" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "product_options_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_option_values" (
    "id" TEXT NOT NULL,
    "optionId" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "product_option_values_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "product_variants" ADD COLUMN "combinationKey" TEXT NOT NULL DEFAULT '',
ADD COLUMN "position" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "descontinuada" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "product_options_productId_idx" ON "product_options"("productId");

-- CreateIndex
CREATE INDEX "product_option_values_optionId_idx" ON "product_option_values"("optionId");

-- CreateIndex
CREATE UNIQUE INDEX "product_variants_productId_combinationKey_key" ON "product_variants"("productId", "combinationKey");

-- AddForeignKey
ALTER TABLE "product_options" ADD CONSTRAINT "product_options_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_option_values" ADD CONSTRAINT "product_option_values_optionId_fkey" FOREIGN KEY ("optionId") REFERENCES "product_options"("id") ON DELETE CASCADE ON UPDATE CASCADE;
