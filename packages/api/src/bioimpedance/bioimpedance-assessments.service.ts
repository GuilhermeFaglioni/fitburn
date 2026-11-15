import { Injectable } from "@nestjs/common";
import { AdminAuditAction, Prisma, UserManifestationAction } from "@prisma/client";
import {
  AssessmentsHiddenReason,
  BIOIMPEDANCE_SCHEMA_VERSION,
  ErrorCode,
  ErrorStatus,
  type AssessmentClient,
  type AssessmentMeasures,
  type AssessmentsList,
  type AssessmentsQuery,
  type BioimpedanceAssessment,
  type CreateAssessmentRequest,
  type UpdateAssessmentRequest,
} from "@fitburn/contracts";
import { recordAdminAuditEvent } from "../admin-audit/record-admin-audit-event.js";
import { DomainError } from "../common/errors/domain-error.js";
import {
  ACTIVE_CLIENT_WHERE,
  assertClientInScope,
  clientScopeFilter,
} from "../permissions/client-scope.js";
import type { ScopedRequester } from "../permissions/scoped-requester.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { BioimpedanceConsentService } from "./bioimpedance-consent.service.js";

const INCLUDE = {
  client: { select: { fullName: true } },
  author: { select: { fullName: true } },
} satisfies Prisma.BioimpedanceAssessmentInclude;

type Row = Prisma.BioimpedanceAssessmentGetPayload<{ include: typeof INCLUDE }>;

/**
 * Avaliações de bioimpedância (D-041/D-042). A equipe lê e escreve só dos clientes do seu escopo
 * que têm consentimento vigente; o cliente lê e exclui as próprias avaliações sempre, também
 * depois de revogar. A exclusão é física.
 */
@Injectable()
export class BioimpedanceAssessmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly consent: BioimpedanceConsentService,
  ) {}

  /** Clientes ativos do escopo, com a situação do consentimento (passo "Cliente" da Nova avaliação). */
  async clientsInScope(requester: ScopedRequester): Promise<AssessmentClient[]> {
    const clients = await this.prisma.user.findMany({
      where: { AND: [ACTIVE_CLIENT_WHERE, clientScopeFilter(requester)] },
      select: { id: true, fullName: true, email: true },
      orderBy: { fullName: "asc" },
    });
    const states = await this.consent.latestByClient(clients.map((c) => c.id));
    return clients.map((client) => {
      const state = states.get(client.id);
      const granted = state?.action === UserManifestationAction.GRANTED;
      return {
        ...client,
        consented: granted,
        consentedAt: granted ? state.createdAt.toISOString() : null,
      };
    });
  }

  /**
   * Avaliações recentes. Com `clientId`: as de um cliente do escopo (vazio e com o motivo se ele não
   * tem consentimento vigente). Sem: as dos clientes do escopo com consentimento vigente.
   */
  async list(query: AssessmentsQuery, requester: ScopedRequester): Promise<AssessmentsList> {
    const from = query.from ? { measuredAt: { gte: new Date(query.from) } } : {};
    if (query.clientId) {
      await assertClientInScope(this.prisma, query.clientId, requester);
      const reason = await this.consent.missingReason(query.clientId);
      if (reason) return { items: [], hiddenReason: AssessmentsHiddenReason[reason] };
      return { items: await this.find({ clientId: query.clientId, ...from }, query.limit), hiddenReason: null };
    }
    const consenting = await this.consent.consentingClientIds();
    const items = await this.find(
      { clientId: { in: consenting }, client: clientScopeFilter(requester), ...from },
      query.limit,
    );
    return { items, hiddenReason: null };
  }

  async findOne(id: string, requester: ScopedRequester): Promise<BioimpedanceAssessment> {
    const row = await this.rowInScope(id, requester);
    await this.assertConsent(row.clientId);
    return toDto(row);
  }

  async create(
    input: CreateAssessmentRequest,
    authorId: string,
    requester: ScopedRequester,
  ): Promise<BioimpedanceAssessment> {
    await assertClientInScope(this.prisma, input.clientId, requester);
    await this.assertConsent(input.clientId);
    try {
      const row = await this.prisma.bioimpedanceAssessment.create({
        data: {
          clientId: input.clientId,
          authorId,
          measuredAt: new Date(input.measuredAt),
          heightCm: input.heightCm ?? null,
          age: input.age ?? null,
          source: input.source,
          schemaVersion: BIOIMPEDANCE_SCHEMA_VERSION,
          measures: input.measures as Prisma.InputJsonObject,
        },
        include: INCLUDE,
      });
      return toDto(row);
    } catch (error) {
      throw this.translateConflict(error);
    }
  }

  async update(
    id: string,
    input: UpdateAssessmentRequest,
    requester: ScopedRequester,
  ): Promise<BioimpedanceAssessment> {
    const current = await this.rowInScope(id, requester);
    await this.assertConsent(current.clientId);
    try {
      const row = await this.prisma.bioimpedanceAssessment.update({
        where: { id },
        data: {
          measuredAt: input.measuredAt ? new Date(input.measuredAt) : undefined,
          heightCm: input.heightCm,
          age: input.age,
          measures: input.measures ? (input.measures as Prisma.InputJsonObject) : undefined,
          schemaVersion: input.measures ? BIOIMPEDANCE_SCHEMA_VERSION : undefined,
        },
        include: INCLUDE,
      });
      return toDto(row);
    } catch (error) {
      throw this.translateConflict(error);
    }
  }

  /** Exclusão física pela equipe, registrada na trilha administrativa sem os valores. */
  async remove(id: string, actorId: string, requester: ScopedRequester): Promise<void> {
    const current = await this.rowInScope(id, requester);
    await this.assertConsent(current.clientId);
    await this.prisma.$transaction(async (tx) => {
      await tx.bioimpedanceAssessment.delete({ where: { id } });
      await recordAdminAuditEvent(tx, {
        actorId,
        action: AdminAuditAction.BIOIMPEDANCE_ASSESSMENT_DELETED,
        targetId: current.clientId,
      });
    });
  }

  // --- Cliente: as próprias avaliações, independentemente do consentimento ---

  async listMine(clientId: string): Promise<BioimpedanceAssessment[]> {
    return this.find({ clientId }, 500);
  }

  async findMine(id: string, clientId: string): Promise<BioimpedanceAssessment> {
    const row = await this.prisma.bioimpedanceAssessment.findFirst({
      where: { id, clientId },
      include: INCLUDE,
    });
    if (!row) throw this.notFound();
    return toDto(row);
  }

  async removeMine(id: string, clientId: string): Promise<void> {
    const { count } = await this.prisma.bioimpedanceAssessment.deleteMany({ where: { id, clientId } });
    if (count === 0) throw this.notFound();
  }

  // --- internos ---

  private async find(where: Prisma.BioimpedanceAssessmentWhereInput, limit: number) {
    const rows = await this.prisma.bioimpedanceAssessment.findMany({
      where,
      include: INCLUDE,
      orderBy: [{ measuredAt: "desc" }],
      take: limit,
    });
    return rows.map(toDto);
  }

  private async rowInScope(id: string, requester: ScopedRequester): Promise<Row> {
    const row = await this.prisma.bioimpedanceAssessment.findUnique({ where: { id }, include: INCLUDE });
    if (!row) throw this.notFound();
    await assertClientInScope(this.prisma, row.clientId, requester);
    return row;
  }

  private async assertConsent(clientId: string): Promise<void> {
    const reason = await this.consent.missingReason(clientId);
    if (!reason) return;
    throw new DomainError(
      ErrorCode.BIOIMPEDANCE_CONSENT_REQUIRED,
      reason === "CONSENT_REVOKED"
        ? "Este cliente revogou a autorização da bioimpedância. Peça para ele ligar de novo em Perfil › Privacidade no app."
        : "Este cliente ainda não autorizou o registro da bioimpedância. Peça para ele ligar em Perfil › Privacidade no app.",
      ErrorStatus.FORBIDDEN,
    );
  }

  private translateConflict(error: unknown): unknown {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return new DomainError(
        ErrorCode.ASSESSMENT_ALREADY_EXISTS,
        "Já existe uma avaliação deste cliente nessa data e hora.",
        ErrorStatus.CONFLICT,
      );
    }
    return error;
  }

  private notFound(): DomainError {
    return new DomainError(
      ErrorCode.NOT_FOUND,
      "Avaliação de bioimpedância não encontrada.",
      ErrorStatus.NOT_FOUND,
    );
  }
}

function toDto(row: Row): BioimpedanceAssessment {
  return {
    id: row.id,
    clientId: row.clientId,
    clientName: row.client.fullName,
    measuredAt: row.measuredAt.toISOString(),
    heightCm: row.heightCm,
    age: row.age,
    source: row.source,
    authorName: row.author.fullName,
    schemaVersion: row.schemaVersion,
    measures: row.measures as unknown as AssessmentMeasures,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
