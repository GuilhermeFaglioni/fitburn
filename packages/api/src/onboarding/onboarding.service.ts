import { readFileSync } from "node:fs";
import { Inject, Injectable } from "@nestjs/common";
import {
  UserManifestationAction,
  UserManifestationType,
  type UserManifestation as PrismaUserManifestation,
} from "@prisma/client";
import {
  ErrorCode,
  ErrorStatus,
  LegalDocumentType,
  type LegalDocumentResponse,
  type OnboardingManifestationResponse,
  type UserManifestationType as UserManifestationTypeName,
} from "@fitburn/contracts";
import { DomainError } from "../common/errors/domain-error.js";
import { APP_CONFIG, type AppConfig } from "../config/app-config.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { getOnboardingPending } from "./onboarding-requirements.js";

const LEGAL_DOCUMENTS = {
  "privacy-policy": {
    type: LegalDocumentType.PRIVACY_POLICY,
    title: "Política de privacidade",
    contentDirectory: "privacy-policy",
    manifestationType: UserManifestationType.PRIVACY_ACKNOWLEDGED,
    configKey: "privacyPolicy",
  },
  "terms-of-use": {
    type: LegalDocumentType.TERMS_OF_USE,
    title: "Termos de uso",
    contentDirectory: "terms-of-use",
    manifestationType: UserManifestationType.TERMS_ACCEPTED,
    configKey: "termsOfUse",
  },
} as const;

type LegalDocumentKey = keyof typeof LEGAL_DOCUMENTS;

@Injectable()
export class OnboardingService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  getLegalDocument(key: string): LegalDocumentResponse {
    if (!Object.prototype.hasOwnProperty.call(LEGAL_DOCUMENTS, key)) {
      throw new DomainError(
        ErrorCode.NOT_FOUND,
        "Documento legal não encontrado.",
        ErrorStatus.NOT_FOUND,
      );
    }

    const documentKey = key as LegalDocumentKey;
    const document = LEGAL_DOCUMENTS[documentKey];
    const settings = this.config.legalDocuments[document.configKey];
    const content = readFileSync(
      new URL(
        `../../legal-documents/${document.contentDirectory}/${settings.version}.md`,
        import.meta.url,
      ),
      "utf8",
    );

    return {
      type: document.type,
      title: document.title,
      version: settings.version,
      requiresNewManifestation: settings.requiresNewManifestation,
      content: content.trim(),
    };
  }

  async getPending(userId: string, mustChangePassword: boolean) {
    const [mustAcknowledgePrivacy, mustAcceptTerms] = await Promise.all([
      this.needsManifestation(
        userId,
        UserManifestationType.PRIVACY_ACKNOWLEDGED,
        this.config.legalDocuments.privacyPolicy,
      ),
      this.needsManifestation(
        userId,
        UserManifestationType.TERMS_ACCEPTED,
        this.config.legalDocuments.termsOfUse,
      ),
    ]);

    return getOnboardingPending({
      mustChangePassword,
      mustAcknowledgePrivacy,
      mustAcceptTerms,
    });
  }

  async acknowledgePrivacy(userId: string): Promise<OnboardingManifestationResponse> {
    return this.recordManifestation(userId, "privacy-policy");
  }

  async acceptTerms(userId: string): Promise<OnboardingManifestationResponse> {
    return this.recordManifestation(userId, "terms-of-use");
  }

  private async recordManifestation(
    userId: string,
    key: LegalDocumentKey,
  ): Promise<OnboardingManifestationResponse> {
    const document = LEGAL_DOCUMENTS[key];
    const settings = this.config.legalDocuments[document.configKey];
    const record = await this.prisma.userManifestation.create({
      data: {
        userId,
        type: document.manifestationType,
        version: settings.version,
        action: UserManifestationAction.GRANTED,
      },
    });
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { mustChangePassword: true },
    });
    if (!user) {
      throw new DomainError(
        ErrorCode.UNAUTHENTICATED,
        "Sessão inválida ou expirada.",
        ErrorStatus.UNAUTHENTICATED,
      );
    }

    return {
      manifestation: this.toResponse(record),
      onboardingPending: await this.getPending(userId, user.mustChangePassword),
    };
  }

  private async latestManifestation(
    userId: string,
    type: UserManifestationTypeName,
    version: string,
  ): Promise<PrismaUserManifestation | null> {
    return this.prisma.userManifestation.findFirst({
      where: { userId, type, version },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    });
  }

  private async needsManifestation(
    userId: string,
    type: UserManifestationTypeName,
    settings: AppConfig["legalDocuments"]["privacyPolicy"],
  ): Promise<boolean> {
    if (!settings.requiresNewManifestation) return false;
    const latest = await this.latestManifestation(userId, type, settings.version);
    return !this.wasGranted(latest);
  }

  private wasGranted(record: PrismaUserManifestation | null): boolean {
    return record?.action === UserManifestationAction.GRANTED;
  }

  private toResponse(record: PrismaUserManifestation) {
    return {
      id: record.id,
      userId: record.userId,
      type: record.type,
      version: record.version,
      action: record.action,
      createdAt: record.createdAt.toISOString(),
    };
  }
}
