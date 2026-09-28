import { createParamDecorator, type ExecutionContext } from "@nestjs/common";
import type { Request } from "express";
import { IDEMPOTENCY_KEY_HEADER, idempotencyKeySchema } from "@fitburn/contracts";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe.js";

/**
 * O header `Idempotency-Key`, obrigatório e validado como UUID (400 se
 * ausente ou inválido). `@Headers()` do Nest não aceita pipes, daí o decorator.
 */
export const IdempotencyKey = createParamDecorator(
  (_data: unknown, context: ExecutionContext): string =>
    new ZodValidationPipe(idempotencyKeySchema).transform(
      context.switchToHttp().getRequest<Request>().headers[IDEMPOTENCY_KEY_HEADER.toLowerCase()],
    ) as string,
);
