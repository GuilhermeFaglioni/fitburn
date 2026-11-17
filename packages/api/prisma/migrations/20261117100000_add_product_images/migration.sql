CREATE TABLE "product_images" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "content" BYTEA NOT NULL,
    "position" INTEGER NOT NULL,
    "isCover" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "product_images_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "product_images_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "product_images_mimeType_check" CHECK ("mimeType" IN ('image/jpeg', 'image/png', 'image/webp')),
    CONSTRAINT "product_images_sizeBytes_check" CHECK ("sizeBytes" > 0 AND "sizeBytes" <= 1500000),
    CONSTRAINT "product_images_position_check" CHECK ("position" >= 0)
);

CREATE UNIQUE INDEX "product_images_productId_position_key" ON "product_images"("productId", "position");
CREATE UNIQUE INDEX "product_images_one_cover_per_product_key" ON "product_images"("productId") WHERE "isCover" = true;
