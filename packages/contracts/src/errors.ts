export const ErrorCode = {
  VALIDATION_ERROR: "VALIDATION_ERROR",
  INTERNAL_ERROR: "INTERNAL_ERROR",
  NOT_FOUND: "NOT_FOUND",
  UNAUTHENTICATED: "UNAUTHENTICATED",
  INVALID_CREDENTIALS: "INVALID_CREDENTIALS",
  USER_INACTIVE: "USER_INACTIVE",
  FORBIDDEN: "FORBIDDEN",
  OUT_OF_SCOPE: "OUT_OF_SCOPE",
} as const;

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

export interface ApiErrorBody {
  code: string;
  message: string;
  details?: unknown;
}

/**
 * Faixas de status HTTP por categoria de erro de negócio (mvp-web-pwa.md).
 * Códigos específicos de cada módulo escolhem o status dentro da faixa certa.
 */
export const ErrorStatus = {
  VALIDATION: 400,
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  UNPROCESSABLE: 422,
  INTERNAL: 500,
} as const;
