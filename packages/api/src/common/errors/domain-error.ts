import { HttpException } from "@nestjs/common";

/**
 * Erro de negócio com código estável para o envelope { code, message, details? }.
 * Módulos de feature lançam isto em vez de HttpException genérica.
 */
export class DomainError extends HttpException {
  constructor(
    public readonly code: string,
    message: string,
    status: number,
    public readonly details?: unknown,
  ) {
    super({ code, message, details }, status);
  }
}
