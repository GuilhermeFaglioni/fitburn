import { Module } from "@nestjs/common";
import { PermissionsModule } from "../permissions/permissions.module.js";
import { ShopCategoriesController } from "./shop-categories.controller.js";
import { ShopCategoriesService } from "./shop-categories.service.js";
import { ShopProductsController } from "./shop-products.controller.js";
import { ShopProductsService } from "./shop-products.service.js";
import {
  ShopProductImageContentController,
  ShopProductImagesController,
} from "./shop-product-images.controller.js";
import { ShopProductImagesService } from "./shop-product-images.service.js";

/** Loja (administração): categorias e produtos, sob a permissão LOJA. */
@Module({
  imports: [PermissionsModule],
  controllers: [
    ShopCategoriesController,
    ShopProductsController,
    ShopProductImagesController,
    ShopProductImageContentController,
  ],
  providers: [ShopCategoriesService, ShopProductsService, ShopProductImagesService],
})
export class ShopModule {}
