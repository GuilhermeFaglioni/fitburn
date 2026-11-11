-- Promoção não pode ser negativa: a API já recusa; esta é a última defesa no banco.
ALTER TABLE "products" ADD CONSTRAINT "products_promo_nonnegative" CHECK ("promoPriceCents" IS NULL OR "promoPriceCents" >= 0);
