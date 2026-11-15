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
