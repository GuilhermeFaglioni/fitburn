import { Test } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";
import { AppModule } from "../src/app.module.js";
import { configureApp } from "../src/bootstrap/configure-app.js";
import { APP_CONFIG, loadAppConfig } from "../src/config/app-config.js";

export interface TestAppOptions {
  /**
   * Variáveis de ambiente que a configuração da API (cookies, CORS, headers,
   * rate limit) deve enxergar. Sem isso o app sobe com a configuração de teste
   * (NODE_ENV=test), sem as travas de produção. O banco continua sendo o de
   * teste, definido no setup.
   */
  env?: NodeJS.ProcessEnv;
}

export async function createTestApp(options: TestAppOptions = {}): Promise<INestApplication> {
  const config = loadAppConfig(options.env ?? { NODE_ENV: "test" });

  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  })
    .overrideProvider(APP_CONFIG)
    .useValue(config)
    .compile();

  const app = moduleRef.createNestApplication();
  configureApp(app, config);
  // Escuta uma vez, em 127.0.0.1: sem isso o supertest abre uma porta efêmera nova por
  // requisição (em `::`), e no macOS ela pode colidir com um serviço local que já usa a
  // mesma porta em 127.0.0.1 — a resposta vinha de outro processo, e a falha era esporádica.
  await app.listen(0, "127.0.0.1");
  return app;
}
