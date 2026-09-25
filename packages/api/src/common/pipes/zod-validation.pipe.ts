import { Injectable, PipeTransform } from "@nestjs/common";
import type { ZodType } from "zod";
import { ErrorCode, ErrorStatus } from "@fitburn/contracts";
import { DomainError } from "../errors/domain-error.js";

@Injectable()
export class ZodValidationPipe implements PipeTransform {
  constructor(private readonly schema: ZodType) {}

  transform(value: unknown) {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      throw new DomainError(
        ErrorCode.VALIDATION_ERROR,
        "Dados inválidos.",
        ErrorStatus.VALIDATION,
        result.error.flatten(),
      );
    }
    return result.data;
  }
}
