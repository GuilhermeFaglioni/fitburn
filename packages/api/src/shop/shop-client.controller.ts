import { Controller, Get, Param, Query, UseGuards } from "@nestjs/common";
import {
  clientShopCatalogQuerySchema,
  type ClientShopCatalogQuery,
  type ClientShopCategory,
  type ClientShopProduct,
  type ClientShopProductDetail,
} from "@fitburn/contracts";
import { JwtAuthGuard } from "../auth/jwt-auth.guard.js";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe.js";
import { ShopProductsService } from "./shop-products.service.js";

/** Leitura da Loja para usuários autenticados, sem permissão administrativa LOJA. */
@Controller("shop")
@UseGuards(JwtAuthGuard)
export class ShopClientController {
  constructor(private readonly productsService: ShopProductsService) {}

  @Get("products")
  list(
    @Query(new ZodValidationPipe(clientShopCatalogQuerySchema)) query: ClientShopCatalogQuery,
  ): Promise<ClientShopProduct[]> {
    return this.productsService.listForClient(query);
  }

  @Get("products/:id")
  get(@Param("id") id: string): Promise<ClientShopProductDetail> {
    return this.productsService.getForClient(id);
  }

  @Get("featured")
  featured(): Promise<ClientShopProduct[]> {
    return this.productsService.featuredForClient();
  }

  @Get("categories")
  categories(): Promise<ClientShopCategory[]> {
    return this.productsService.categoriesForClient();
  }
}
