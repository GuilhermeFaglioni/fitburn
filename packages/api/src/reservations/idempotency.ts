import { createHash } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { ErrorCode, ErrorStatus, type ApiErrorBody } from "@fitburn/contracts";
import { DomainError } from "../common/errors/domain-error.js";

/** A intenção identificada pela chave: a operação e o corpo que a definem. */
export type IdempotentIntent = { operation: "create"; occurrenceId: string };

/** Resultado memorizado: o corpo de sucesso ou a recusa de negócio. */
export type MemorizedOutcome<T> =
  { kind: "succeeded"; body: T } | { kind: "refused"; statusCode: number; error: ApiErrorBody };

/**
 * Executa `operation` uma única vez por (cliente, chave) e memoriza o
 * resultado — sucesso ou recusa de negócio — na mesma transação `tx`.
 * Precisa rodar com o lock do cliente já adquirido: é ele que serializa
 * repetições concorrentes da mesma chave. Erros inesperados não são
 * memorizados (a transação inteira é desfeita).
 *
 * A operação roda num SAVEPOINT: numa recusa, o que ela já tiver escrito é
 * desfeito (e uma transação abortada por erro do banco volta a aceitar
 * comandos) antes de gravar o registro da recusa.
 */
export async function runIdempotent<T>(
  tx: Prisma.TransactionClient,
  clientId: string,
  key: string,
  intent: IdempotentIntent,
  successStatus: number,
  operation: () => Promise<T>,
): Promise<MemorizedOutcome<T>> {
  const fingerprint = createHash("sha256").update(JSON.stringify(intent)).digest("hex");
  const existing = await tx.idempotencyRecord.findUnique({
    where: { clientId_key: { clientId, key } },
  });
  if (existing) {
    if (existing.fingerprint !== fingerprint) {
      throw new DomainError(
        ErrorCode.IDEMPOTENCY_KEY_REUSED,
        "Esta chave de idempotência já foi usada para outra solicitação.",
        ErrorStatus.UNPROCESSABLE,
      );
    }
    return existing.statusCode === successStatus
      ? { kind: "succeeded", body: existing.responseBody as T }
      : {
          kind: "refused",
          statusCode: existing.statusCode,
          error: existing.responseBody as unknown as ApiErrorBody,
        };
  }

  let outcome: MemorizedOutcome<T>;
  await tx.$executeRaw`SAVEPOINT idempotent_operation`;
  try {
    outcome = { kind: "succeeded", body: await operation() };
    await tx.$executeRaw`RELEASE SAVEPOINT idempotent_operation`;
  } catch (error) {
    if (!(error instanceof DomainError)) throw error;
    await tx.$executeRaw`ROLLBACK TO SAVEPOINT idempotent_operation`;
    outcome = {
      kind: "refused",
      statusCode: error.getStatus(),
      error: error.getResponse() as ApiErrorBody,
    };
  }

  // Ida e volta por JSON: o que se grava é exatamente o que a repetição devolve.
  const memorized =
    outcome.kind === "succeeded"
      ? { statusCode: successStatus, body: outcome.body }
      : { statusCode: outcome.statusCode, body: outcome.error };
  const responseBody = JSON.parse(JSON.stringify(memorized.body)) as Prisma.InputJsonValue;
  await tx.idempotencyRecord.create({
    data: { clientId, key, fingerprint, statusCode: memorized.statusCode, responseBody },
  });
  return outcome.kind === "succeeded"
    ? { kind: "succeeded", body: responseBody as T }
    : {
        kind: "refused",
        statusCode: outcome.statusCode,
        error: responseBody as unknown as ApiErrorBody,
      };
}

/** Devolve o resultado memorizado: o corpo em caso de sucesso, ou a mesma recusa. */
export function replay<T>(outcome: MemorizedOutcome<T>): T {
  if (outcome.kind === "refused") {
    const { code, message, details } = outcome.error;
    throw new DomainError(code, message, outcome.statusCode, details);
  }
  return outcome.body;
}
