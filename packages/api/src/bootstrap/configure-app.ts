import type { INestApplication } from "@nestjs/common";
import cookieParser from "cookie-parser";
import type { Express, NextFunction, Request, Response } from "express";
import { rateLimit } from "express-rate-limit";
import helmet from "helmet";
import { ErrorCode, type ApiErrorBody } from "@fitburn/contracts";
import { AllExceptionsFilter } from "../common/filters/all-exceptions.filter.js";
import type { AppConfig } from "../config/app-config.js";

const RATE_LIMITED_PATHS = ["/api/auth/login", "/api/auth/refresh"] as const;

/**
 * Configuração de HTTP compartilhada entre o main.ts e os testes e2e, para
 * que os testes exercitem exatamente o que roda em produção.
 */
export function configureApp(app: INestApplication, config: AppConfig): void {
  const server = app.getHttpAdapter().getInstance() as Express;
  server.disable("x-powered-by");
  server.set("trust proxy", config.trustProxyHops);

  app.setGlobalPrefix("api");

  app.use(
    helmet({
      // A API só devolve JSON: nada dela deve ser renderizado, embutido ou carregar recursos.
      contentSecurityPolicy: {
        useDefaults: false,
        directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] },
      },
      // HSTS só faz sentido atrás de HTTPS (produção); em http://localhost o navegador o ignora.
      strictTransportSecurity: config.isProduction,
    }),
  );
  // Respostas carregam tokens e dados pessoais: nenhum cache (navegador ou proxy) deve guardá-las.
  app.use((_req: Request, res: Response, next: NextFunction) => {
    res.setHeader("Cache-Control", "no-store");
    next();
  });

  // CORS antes do rate limit: o preflight não gasta cota e o 429 leva os headers de CORS.
  app.enableCors({
    origin: config.corsOrigins === "any" ? true : config.corsOrigins,
    credentials: true,
  });

  if (config.authRateLimit.enabled) {
    for (const path of RATE_LIMITED_PATHS) {
      // Um limiter (e sua contagem em memória) por endpoint e por app.
      app.use(path, authRateLimiter(config));
    }
  }

  app.use(cookieParser());
  app.useGlobalFilters(new AllExceptionsFilter());
}

function authRateLimiter(config: AppConfig) {
  return rateLimit({
    windowMs: config.authRateLimit.windowMs,
    limit: config.authRateLimit.max,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    skip: (req) => req.method === "OPTIONS",
    handler: (_req, res) => {
      const body: ApiErrorBody = {
        code: ErrorCode.TOO_MANY_REQUESTS,
        message: "Muitas tentativas. Aguarde um pouco e tente novamente.",
      };
      res.status(429).json(body);
    },
  });
}
