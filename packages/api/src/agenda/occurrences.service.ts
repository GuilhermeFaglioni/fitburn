import { Injectable } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import {
  addDays,
  ErrorCode,
  ErrorStatus,
  gymDateTimeToUtc,
  OccurrenceStatus,
  PermissionScope,
  type CreateOccurrenceRequest,
  type OccurrenceConflict,
  type OccurrenceDetail,
  type OccurrenceFormOptions,
  type PermissionScopeName,
} from "@fitburn/contracts";
import { PrismaService } from "../prisma/prisma.service.js";
import { DomainError } from "../common/errors/domain-error.js";
import { ClassTemplatesService } from "../catalog/class-templates.service.js";
import { InstructorsService } from "../catalog/instructors.service.js";

const OCCURRENCE_INCLUDE = {
  modality: { select: { id: true, name: true } },
  instructor: { select: { id: true, fullName: true } },
} satisfies Prisma.ClassOccurrenceInclude;

type OccurrenceWithRelations = Prisma.ClassOccurrenceGetPayload<{
  include: typeof OCCURRENCE_INCLUDE;
}>;

export interface Interval {
  startsAt: Date;
  endsAt: Date;
}

/** Quem está pedindo, com o escopo efetivo no módulo "ocorrências/agendamento". */
export interface OccurrenceRequester {
  userId: string;
  scope: PermissionScopeName;
}

@Injectable()
export class OccurrencesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly templates: ClassTemplatesService,
    private readonly instructors: InstructorsService,
  ) {}

  async formOptions(): Promise<OccurrenceFormOptions> {
    const [templates, instructors] = await Promise.all([
      this.templates.list({ activeOnly: true }),
      this.instructors.list(),
    ]);
    return { templates, instructors };
  }

  /** Listagem administrativa por intervalo de dias locais (inclusive), com canceladas. */
  async list(
    from: string,
    to: string,
    requester: OccurrenceRequester,
  ): Promise<OccurrenceDetail[]> {
    const occurrences = await this.prisma.classOccurrence.findMany({
      where: {
        startsAt: {
          gte: gymDateTimeToUtc(from, "00:00"),
          lt: gymDateTimeToUtc(addDays(to, 1), "00:00"),
        },
        ...this.scopeFilter(requester),
      },
      include: OCCURRENCE_INCLUDE,
      orderBy: { startsAt: "asc" },
    });
    return occurrences.map((occurrence) => this.toDetail(occurrence));
  }

  async create(
    input: CreateOccurrenceRequest,
    requester: OccurrenceRequester,
  ): Promise<OccurrenceDetail> {
    const template = await this.prisma.classTemplate.findUnique({
      where: { id: input.templateId },
    });
    if (!template || !template.isActive) {
      throw new DomainError(
        ErrorCode.VALIDATION_ERROR,
        "Selecione um template ativo.",
        ErrorStatus.VALIDATION,
      );
    }

    const instructorId =
      input.instructorId === undefined ? template.defaultInstructorId : input.instructorId;
    if (instructorId) await this.instructors.assertIsInstructor(instructorId);
    this.assertInScope(instructorId, requester);

    const startsAt = gymDateTimeToUtc(input.date, input.startTime);
    const interval = {
      startsAt,
      endsAt: new Date(startsAt.getTime() + template.durationMinutes * 60_000),
    };
    await this.assertNoOverlap([interval]);

    const occurrence = await this.withOverlapTranslation([interval], () =>
      this.prisma.classOccurrence.create({
        data: {
          templateId: template.id,
          name: template.name,
          description: template.description,
          modalityId: template.modalityId,
          instructorId,
          durationMinutes: template.durationMinutes,
          capacity: input.capacity ?? template.capacity,
          ...interval,
        },
        include: OCCURRENCE_INCLUDE,
      }),
    );
    return this.toDetail(occurrence);
  }

  /**
   * Verificação antecipada: devolve a lista de conflitos no erro. A garantia
   * real (inclusive contra criações concorrentes) é a exclusion constraint
   * do banco — ver withOverlapTranslation.
   */
  async assertNoOverlap(intervals: Interval[], exceptId?: string): Promise<void> {
    const conflicts = await this.findConflicts(intervals, exceptId);
    if (conflicts.length > 0) throw this.overlapError(conflicts);
  }

  /** Converte a violação da constraint de exclusão no mesmo erro da verificação antecipada. */
  async withOverlapTranslation<T>(intervals: Interval[], write: () => Promise<T>): Promise<T> {
    try {
      return await write();
    } catch (error) {
      if (!isOverlapViolation(error)) throw error;
      throw this.overlapError(await this.findConflicts(intervals));
    }
  }

  private async findConflicts(
    intervals: Interval[],
    exceptId?: string,
  ): Promise<OccurrenceConflict[]> {
    if (intervals.length === 0) return [];
    const rows = await this.prisma.classOccurrence.findMany({
      where: {
        status: OccurrenceStatus.SCHEDULED,
        ...(exceptId ? { id: { not: exceptId } } : {}),
        OR: intervals.map((interval) => ({
          startsAt: { lt: interval.endsAt },
          endsAt: { gt: interval.startsAt },
        })),
      },
      select: { id: true, name: true, startsAt: true, endsAt: true },
      orderBy: { startsAt: "asc" },
    });
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      startsAt: row.startsAt.toISOString(),
      endsAt: row.endsAt.toISOString(),
    }));
  }

  private overlapError(conflicts: OccurrenceConflict[]): DomainError {
    return new DomainError(
      ErrorCode.OCCURRENCE_OVERLAP,
      "O horário se sobrepõe a outra aula — o espaço é exclusivo.",
      ErrorStatus.CONFLICT,
      { conflicts },
    );
  }

  private scopeFilter(requester: OccurrenceRequester): Prisma.ClassOccurrenceWhereInput {
    switch (requester.scope) {
      case PermissionScope.ALL:
        return {};
      // "Aulas atribuídas": a ocorrência é do professor definido nela.
      case PermissionScope.ASSIGNED_CLASSES:
      case PermissionScope.OWN:
        return { instructorId: requester.userId };
      default:
        throw new DomainError(
          ErrorCode.FORBIDDEN,
          "Escopo sem acesso à agenda.",
          ErrorStatus.FORBIDDEN,
        );
    }
  }

  private assertInScope(instructorId: string | null, requester: OccurrenceRequester): void {
    if (Object.keys(this.scopeFilter(requester)).length === 0) return;
    if (instructorId !== requester.userId) {
      throw new DomainError(
        ErrorCode.OUT_OF_SCOPE,
        "Você só pode gerenciar as aulas em que é o professor.",
        ErrorStatus.FORBIDDEN,
      );
    }
  }

  toDetail(occurrence: OccurrenceWithRelations): OccurrenceDetail {
    return {
      id: occurrence.id,
      templateId: occurrence.templateId,
      seriesId: occurrence.seriesId,
      name: occurrence.name,
      description: occurrence.description,
      modality: occurrence.modality,
      instructor: occurrence.instructor,
      startsAt: occurrence.startsAt.toISOString(),
      endsAt: occurrence.endsAt.toISOString(),
      durationMinutes: occurrence.durationMinutes,
      capacity: occurrence.capacity,
      bookedCount: 0,
      status: occurrence.status,
    };
  }
}

/**
 * O driver adapter do Prisma não mapeia a exclusion_violation (SQLSTATE
 * 23P01) para um código P2xxx estável, então o reconhecimento é pelo
 * código original ou pelo nome da constraint.
 */
function isOverlapViolation(error: unknown): boolean {
  const serialized = JSON.stringify(error, Object.getOwnPropertyNames(error ?? {})) ?? "";
  return serialized.includes("23P01") || serialized.includes("class_occurrences_no_overlap");
}
