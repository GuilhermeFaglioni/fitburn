import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from "@nestjs/common";
import type { Response } from "express";
import { ErrorCode, type ApiErrorBody } from "@fitburn/contracts";

/**
 * Único ponto que formata qualquer erro lançado na API para o envelope
 * padrão { code, message, details? }. DomainError já chega com esse shape
 * em getResponse(); exceptions nativas do Nest (validação, 404 de rota
 * inexistente etc.) e erros inesperados são normalizados aqui.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse();
      const payload: ApiErrorBody = this.isApiErrorBody(body)
        ? body
        : { code: this.codeForStatus(status), message: exception.message };
      response.status(status).json(payload);
      return;
    }

    this.logger.error(exception instanceof Error ? exception.stack : exception);
    const payload: ApiErrorBody = {
      code: ErrorCode.INTERNAL_ERROR,
      message: "Erro interno inesperado.",
    };
    response.status(HttpStatus.INTERNAL_SERVER_ERROR).json(payload);
  }

  private isApiErrorBody(body: unknown): body is ApiErrorBody {
    return typeof body === "object" && body !== null && "code" in body && "message" in body;
  }

  private codeForStatus(status: number): string {
    switch (status) {
      case HttpStatus.BAD_REQUEST:
        return ErrorCode.VALIDATION_ERROR;
      case HttpStatus.NOT_FOUND:
        return ErrorCode.NOT_FOUND;
      default:
        return ErrorCode.INTERNAL_ERROR;
    }
  }
}
