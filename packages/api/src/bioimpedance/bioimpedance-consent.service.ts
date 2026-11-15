import { Injectable } from "@nestjs/common";
import {
  UserManifestationAction,
  UserManifestationType,
  type Prisma,
  type UserManifestation as PrismaUserManifestation,
} from "@prisma/client";
import {
  BIOIMPEDANCE_CONSENT_VERSION,
  ErrorCode,
  ErrorStatus,
  type BioimpedanceConsentResponse,
} from "@fitburn/contracts";
import { DomainError } from "../common/errors/domain-error.js";
import { lockAdvisory } from "../prisma/advisory-lock.js";
import { PrismaService } from "../prisma/prisma.service.js";

/**
 * Consentimento de bioimpedância (D-042). Cada mudança é uma manifestação nova e imutável;
 * a última decide. Autorizar grava a versão vigente do texto; repetir o mesmo estado
 * não cria registro (idempotente).
 */
@Injectable()
export class BioimpedanceConsentService {
  constructor(private readonly prisma: PrismaService) {}

  async read(clientId: string): Promise<BioimpedanceConsentResponse> {
    await this.assertClient(clientId);
    return toResponse(await this.latest(this.prisma, clientId));
  }

  async set(clientId: string, consented: boolean): Promise<BioimpedanceConsentResponse> {
    await this.assertClient(clientId);
    return this.prisma.$transaction(async (tx) => {
      await lockAdvisory(tx, `bioimpedance-consent:${clientId}`);
      const current = await this.latest(tx, clientId);
      const granted = current?.action === UserManifestationAction.GRANTED;
      const unchanged = consented ? granted && current?.version === BIOIMPEDANCE_CONSENT_VERSION : !granted;
      if (unchanged) return toResponse(current);

      const manifestation = await tx.userManifestation.create({
        data: {
          userId: clientId,
          type: UserManifestationType.CONSENT_BIOIMPEDANCE,
          version: BIOIMPEDANCE_CONSENT_VERSION,
          action: consented ? UserManifestationAction.GRANTED : UserManifestationAction.REVOKED,
        },
      });
      return toResponse(manifestation);
    });
  }

  /** Consentimento vigente: base para a API recusar registros e esconder avaliações da equipe. */
  async hasActiveConsent(
    clientId: string,
    prisma: PrismaService | Prisma.TransactionClient = this.prisma,
  ): Promise<boolean> {
    return (await this.latest(prisma, clientId))?.action === UserManifestationAction.GRANTED;
  }

  /**
   * Última manifestação de consentimento de cada cliente informado (quem nunca decidiu não aparece).
   * Base para a equipe ver só quem autorizou (D-042).
   */
  async latestByClient(
    clientIds: string[],
    prisma: PrismaService | Prisma.TransactionClient = this.prisma,
  ): Promise<Map<string, PrismaUserManifestation>> {
    if (clientIds.length === 0) return new Map();
    const rows = await prisma.userManifestation.findMany({
      where: { type: UserManifestationType.CONSENT_BIOIMPEDANCE, userId: { in: clientIds } },
      orderBy: [{ userId: "asc" }, { sequence: "desc" }],
      distinct: ["userId"],
    });
    return new Map(rows.map((row) => [row.userId, row]));
  }

  /** Ids de todos os clientes com consentimento vigente. */
  async consentingClientIds(
    prisma: PrismaService | Prisma.TransactionClient = this.prisma,
  ): Promise<string[]> {
    const rows = await prisma.userManifestation.findMany({
      where: { type: UserManifestationType.CONSENT_BIOIMPEDANCE },
      orderBy: [{ userId: "asc" }, { sequence: "desc" }],
      distinct: ["userId"],
      select: { userId: true, action: true },
    });
    return rows.filter((row) => row.action === UserManifestationAction.GRANTED).map((r) => r.userId);
  }

  /** Por que o consentimento não está vigente: nunca decidiu ou revogou. */
  async missingReason(
    clientId: string,
    prisma: PrismaService | Prisma.TransactionClient = this.prisma,
  ): Promise<"CONSENT_MISSING" | "CONSENT_REVOKED" | null> {
    const latest = await this.latest(prisma, clientId);
    if (!latest) return "CONSENT_MISSING";
    return latest.action === UserManifestationAction.GRANTED ? null : "CONSENT_REVOKED";
  }

  private async assertClient(userId: string): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { profile: { select: { name: true } } },
    });
    if (user?.profile.name !== "Cliente") {
      throw new DomainError(
        ErrorCode.FORBIDDEN,
        "O consentimento de bioimpedância está disponível apenas para clientes.",
        ErrorStatus.FORBIDDEN,
      );
    }
  }

  private latest(
    prisma: PrismaService | Prisma.TransactionClient,
    userId: string,
  ): Promise<PrismaUserManifestation | null> {
    return prisma.userManifestation.findFirst({
      where: { userId, type: UserManifestationType.CONSENT_BIOIMPEDANCE },
      orderBy: { sequence: "desc" },
    });
  }
}

function toResponse(manifestation: PrismaUserManifestation | null): BioimpedanceConsentResponse {
  return {
    consented: manifestation?.action === UserManifestationAction.GRANTED,
    currentVersion: BIOIMPEDANCE_CONSENT_VERSION,
    manifestation: manifestation
      ? {
          id: manifestation.id,
          userId: manifestation.userId,
          type: manifestation.type,
          version: manifestation.version,
          action: manifestation.action,
          createdAt: manifestation.createdAt.toISOString(),
        }
      : null,
  };
}
