import {
  ConflictException,
  ForbiddenException,
  HttpException,
  MethodNotAllowedException,
  NotFoundException,
  PayloadTooLargeException,
  UnauthorizedException,
  UnsupportedMediaTypeException,
  type ArgumentsHost,
} from "@nestjs/common";
import { ErrorCode } from "@fitburn/contracts";
import { AllExceptionsFilter } from "../src/common/filters/all-exceptions.filter.js";

function run(exception: unknown): { status: number; body: { code: string; message: string } } {
  let status = 0;
  let body: unknown;
  const response = {
    status(value: number) {
      status = value;
      return this;
    },
    json(value: unknown) {
      body = value;
      return this;
    },
  };
  const host = { switchToHttp: () => ({ getResponse: () => response }) } as unknown as ArgumentsHost;
  new AllExceptionsFilter().catch(exception, host);
  return { status, body: body as { code: string; message: string } };
}

describe("AllExceptionsFilter: código por status 4xx", () => {
  it.each([
    [new UnauthorizedException(), 401, ErrorCode.UNAUTHENTICATED],
    [new ForbiddenException(), 403, ErrorCode.FORBIDDEN],
    [new NotFoundException(), 404, ErrorCode.NOT_FOUND],
    [new MethodNotAllowedException(), 405, ErrorCode.METHOD_NOT_ALLOWED],
    [new ConflictException(), 409, ErrorCode.CONFLICT],
    [new PayloadTooLargeException(), 413, ErrorCode.PAYLOAD_TOO_LARGE],
    [new UnsupportedMediaTypeException(), 415, ErrorCode.UNSUPPORTED_MEDIA_TYPE],
    [new HttpException("Too Many Requests", 429), 429, ErrorCode.TOO_MANY_REQUESTS],
    [new HttpException("Unprocessable", 422), 422, ErrorCode.VALIDATION_ERROR],
    [new HttpException("Bad Request", 400), 400, ErrorCode.VALIDATION_ERROR],
  ])("%s mantém o status e devolve o código %s", (exception, status, code) => {
    const result = run(exception);

    expect(result.status).toBe(status);
    expect(result.body.code).toBe(code);
  });

  it.each([
    [413, ErrorCode.PAYLOAD_TOO_LARGE],
    [415, ErrorCode.UNSUPPORTED_MEDIA_TYPE],
    [429, ErrorCode.TOO_MANY_REQUESTS],
    [400, ErrorCode.VALIDATION_ERROR],
  ])("erro de middleware com status %i vira o código %s", (status, code) => {
    const result = run(Object.assign(new Error("interno"), { status }));

    expect(result.status).toBe(status);
    expect(result.body.code).toBe(code);
    expect(result.body.message).not.toContain("interno");
  });
});
