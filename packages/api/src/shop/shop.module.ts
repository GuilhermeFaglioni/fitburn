import { Module } from "@nestjs/common";
import { PermissionsModule } from "../permissions/permissions.module.js";
import { ShopCategoriesController } from "./shop-categories.controller.js";
import { ShopCategoriesService } from "./shop-categories.service.js";
import { ShopProductsController } from "./shop-products.controller.js";
import { ShopProductsService } from "./shop-products.service.js";

/** Loja (administração): categorias e produtos, sob a permissão LOJA. */
@Module({
  imports: [PermissionsModule],
  controllers: [ShopCategoriesController, ShopProductsController],
  providers: [ShopCategoriesService, ShopProductsService],
})
export class ShopModule {}
