import { Module } from "@nestjs/common";
import { PermissionsModule } from "../permissions/permissions.module.js";
import { ShopCategoriesController } from "./shop-categories.controller.js";
import { ShopCategoriesService } from "./shop-categories.service.js";

/** Loja (administração): categorias e produtos, sob a permissão LOJA. */
@Module({
  imports: [PermissionsModule],
  controllers: [ShopCategoriesController],
  providers: [ShopCategoriesService],
})
export class ShopModule {}
