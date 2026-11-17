import { Module } from "@nestjs/common";
import { PermissionsModule } from "../permissions/permissions.module.js";
import { ShopCategoriesController } from "./shop-categories.controller.js";
import { ShopCategoriesService } from "./shop-categories.service.js";
import { ShopClientController } from "./shop-client.controller.js";
import { ShopProductsController } from "./shop-products.controller.js";
import { ShopProductsService } from "./shop-products.service.js";
import {
  ShopProductImageContentController,
  ShopProductImagesController,
} from "./shop-product-images.controller.js";
import { ShopProductImagesService } from "./shop-product-images.service.js";
import { ShopOrdersController } from "./shop-orders.controller.js";
import { ShopOrdersService } from "./shop-orders.service.js";
import { ShopAdminOrdersController } from "./shop-admin-orders.controller.js";

/** Loja (administração): categorias e produtos, sob a permissão LOJA. */
@Module({
  imports: [PermissionsModule],
  controllers: [
    ShopCategoriesController,
    ShopClientController,
    ShopProductsController,
    ShopProductImagesController,
    ShopProductImageContentController,
    ShopOrdersController,
    ShopAdminOrdersController,
  ],
  providers: [ShopCategoriesService, ShopProductsService, ShopProductImagesService, ShopOrdersService],
})
export class ShopModule {}
