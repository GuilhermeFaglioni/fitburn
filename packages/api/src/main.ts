import "reflect-metadata";
import { createApplication } from "./bootstrap/create-application.js";
import { AppConfigError } from "./config/app-config.js";

async function bootstrap(): Promise<void> {
  const app = await createApplication();
  const port = process.env.PORT ? Number(process.env.PORT) : 3333;
  await app.listen(port);
  console.log(`Fitburn API rodando em http://localhost:${port}/api`);
}

bootstrap().catch((error: unknown) => {
  // Configuração inválida: mensagem objetiva, sem stack, e saída com erro (falha rápida).
  console.error(error instanceof AppConfigError ? error.message : error);
  process.exit(1);
});
