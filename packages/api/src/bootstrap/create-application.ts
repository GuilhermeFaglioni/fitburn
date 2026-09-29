import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { AppModule } from "../app.module.js";
import { APP_CONFIG, loadAppConfig, type AppConfig } from "../config/app-config.js";
import { configureApp } from "./configure-app.js";

/**
 * Ponto de entrada da inicialização: valida a configuração ANTES de criar o
 * app (e de conectar no banco), para que a API nunca suba em produção com
 * segredo ausente ou inseguro.
 */
export async function createApplication(
  env: NodeJS.ProcessEnv = process.env,
): Promise<NestExpressApplication> {
  loadAppConfig(env);
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  configureApp(app, app.get<AppConfig>(APP_CONFIG));
  return app;
}
