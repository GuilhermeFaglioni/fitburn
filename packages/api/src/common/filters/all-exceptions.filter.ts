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
import { redactSensitive } from "../logging/redact-sensitive.js";

const INTERNAL_ERROR_MESSAGE = "Erro interno inesperado.";

/**
 * Único ponto que formata qualquer erro lançado na API para o envelope
 * padrão { code, message, details? }. DomainError já chega com esse shape
 * em getResponse(); exceptions nativas do Nest (validação, 404 de rota
 * inexistente etc.) e erros inesperados são normalizados aqui.
 *
 * Erros de servidor (5xx) nunca devolvem a mensagem original nem stack: o
 * detalhe vai só para o log (com segredos mascarados), e o cliente recebe
 * uma mensagem genérica.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
        this.respondInternalError(response, exception, status);
        return;
      }
      const body = exception.getResponse();
      const payload: ApiErrorBody = this.isApiErrorBody(body)
        ? body
        : { code: this.codeForStatus(status), message: exception.message };
      response.status(status).json(payload);
      return;
    }

    // Erros de middleware (ex.: body-parser: corpo grande demais) trazem o status HTTP no próprio erro.
    const clientStatus = this.clientErrorStatus(exception);
    if (clientStatus) {
      response.status(clientStatus).json({
        code: this.codeForStatus(clientStatus),
        message: this.messageForClientStatus(clientStatus),
      } satisfies ApiErrorBody);
      return;
    }

    this.respondInternalError(response, exception, HttpStatus.INTERNAL_SERVER_ERROR);
  }

  private respondInternalError(response: Response, exception: unknown, status: number): void {
    this.logger.error(redactSensitive(this.describe(exception)));
    const payload: ApiErrorBody = {
      code: ErrorCode.INTERNAL_ERROR,
      message: INTERNAL_ERROR_MESSAGE,
    };
    response.status(status).json(payload);
  }

  private describe(exception: unknown): string {
    if (exception instanceof Error) return exception.stack ?? `${exception.name}: ${exception.message}`;
    try {
      return typeof exception === "string" ? exception : JSON.stringify(exception);
    } catch {
      return String(exception);
    }
  }

  private clientErrorStatus(exception: unknown): number | undefined {
    if (typeof exception !== "object" || exception === null) return undefined;
    const status = (exception as { status?: unknown; statusCode?: unknown }).status ??
      (exception as { statusCode?: unknown }).statusCode;
    return typeof status === "number" && status >= 400 && status < 500 ? status : undefined;
  }

  private isApiErrorBody(body: unknown): body is ApiErrorBody {
    return typeof body === "object" && body !== null && "code" in body && "message" in body;
  }

  private messageForClientStatus(status: number): string {
    switch (status) {
      case HttpStatus.PAYLOAD_TOO_LARGE:
        return "O corpo da requisição é grande demais.";
      case HttpStatus.UNSUPPORTED_MEDIA_TYPE:
        return "Tipo de conteúdo não suportado.";
      case HttpStatus.TOO_MANY_REQUESTS:
        return "Muitas requisições. Aguarde um pouco e tente novamente.";
      default:
        return "Requisição inválida.";
    }
  }

  private codeForStatus(status: number): string {
    switch (status) {
      case HttpStatus.BAD_REQUEST:
        return ErrorCode.VALIDATION_ERROR;
      case HttpStatus.NOT_FOUND:
        return ErrorCode.NOT_FOUND;
      case HttpStatus.UNAUTHORIZED:
        return ErrorCode.UNAUTHENTICATED;
      case HttpStatus.FORBIDDEN:
        return ErrorCode.FORBIDDEN;
      case HttpStatus.METHOD_NOT_ALLOWED:
        return ErrorCode.METHOD_NOT_ALLOWED;
      case HttpStatus.CONFLICT:
        return ErrorCode.CONFLICT;
      case HttpStatus.PAYLOAD_TOO_LARGE:
        return ErrorCode.PAYLOAD_TOO_LARGE;
      case HttpStatus.UNSUPPORTED_MEDIA_TYPE:
        return ErrorCode.UNSUPPORTED_MEDIA_TYPE;
      case HttpStatus.TOO_MANY_REQUESTS:
        return ErrorCode.TOO_MANY_REQUESTS;
      default:
        return status >= HttpStatus.INTERNAL_SERVER_ERROR
          ? ErrorCode.INTERNAL_ERROR
          : ErrorCode.VALIDATION_ERROR;
    }
  }
}
