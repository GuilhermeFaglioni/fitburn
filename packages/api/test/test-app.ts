import { Test } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";
import cookieParser from "cookie-parser";
import { AppModule } from "../src/app.module.js";
import { AllExceptionsFilter } from "../src/common/filters/all-exceptions.filter.js";

export async function createTestApp(): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  const app = moduleRef.createNestApplication();
  app.setGlobalPrefix("api");
  app.use(cookieParser());
  app.useGlobalFilters(new AllExceptionsFilter());
  // Escuta uma vez, em 127.0.0.1: sem isso o supertest abre uma porta efêmera nova por
  // requisição (em `::`), e no macOS ela pode colidir com um serviço local que já usa a
  // mesma porta em 127.0.0.1 — a resposta vinha de outro processo, e a falha era esporádica.
  await app.listen(0, "127.0.0.1");
  return app;
}
