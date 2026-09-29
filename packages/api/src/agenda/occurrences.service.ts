import { randomUUID } from "node:crypto";
import { Injectable } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import {
  addDays,
  addMonths,
  ErrorCode,
  expandRecurrenceDates,
  ErrorStatus,
  gymDateTimeToUtc,
  OccurrenceStatus,
  ReservationStatus,
  PermissionScope,
  RECURRENCE_MAX_MONTHS,
  type CreateOccurrenceRequest,
  type CreateRecurringOccurrencesRequest,
  type OccurrenceConflict,
  type OccurrenceDetail,
  type OccurrenceFormOptions,
  type OccurrenceReservationsDetails,
  type PermissionScopeName,
  type RecurringOccurrencesResult,
  type UpdateOccurrenceRequest,
  utcToGymDateTime,
} from "@fitburn/contracts";
import { PrismaService } from "../prisma/prisma.service.js";
import { lockOccurrenceRows } from "./occurrence-lock.js";
import { DomainError } from "../common/errors/domain-error.js";
import { ClassTemplatesService } from "../catalog/class-templates.service.js";
import { InstructorsService } from "../catalog/instructors.service.js";

const OCCURRENCE_INCLUDE = {
  modality: { select: { id: true, name: true } },
  instructor: { select: { id: true, fullName: true } },
  _count: { select: { reservations: { where: { status: ReservationStatus.CONFIRMED } } } },
} satisfies Prisma.ClassOccurrenceInclude;

type OccurrenceWithRelations = Prisma.ClassOccurrenceGetPayload<{
  include: typeof OCCURRENCE_INCLUDE;
}>;

export interface Interval {
  startsAt: Date;
  endsAt: Date;
}

function intervalAt(date: string, startTime: string, durationMinutes: number): Interval {
  const startsAt = gymDateTimeToUtc(date, startTime);
  return { startsAt, endsAt: new Date(startsAt.getTime() + durationMinutes * 60_000) };
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
      // Uma aula cancelada e a que ocupou o horário dela começam juntas:
      // o desempate por criação mantém a ordem estável.
      orderBy: [{ startsAt: "asc" }, { createdAt: "asc" }, { id: "asc" }],
    });
    return occurrences.map((occurrence) => this.toDetail(occurrence));
  }

  async create(
    input: CreateOccurrenceRequest,
    requester: OccurrenceRequester,
  ): Promise<OccurrenceDetail> {
    const settings = await this.resolveSettings(input, requester);
    const interval = intervalAt(input.date, input.startTime, settings.durationMinutes);
    await this.assertNoOverlap([interval]);

    const occurrence = await this.withOverlapTranslation([interval], () =>
      this.prisma.classOccurrence.create({
        data: { ...settings, ...interval },
        include: OCCURRENCE_INCLUDE,
      }),
    );
    return this.toDetail(occurrence);
  }

  async update(
    id: string,
    input: UpdateOccurrenceRequest,
    requester: OccurrenceRequester,
  ): Promise<OccurrenceDetail> {
    const current = await this.findScheduledInScope(id, requester);

    const instructorId =
      input.instructorId === undefined ? current.instructorId : input.instructorId;
    if (instructorId && instructorId !== current.instructorId) {
      await this.instructors.assertIsInstructor(instructorId);
    }
    this.assertInScope(instructorId, requester);

    const planned = plannedSchedule(current, input);
    if (planned.changed) await this.assertNoOverlap([planned.interval], id);

    // Escrita condicional: se a aula for cancelada entre a leitura e a
    // escrita, nada é alterado (não se edita o histórico).
    const { count } = await this.withOverlapTranslation([planned.interval], () =>
      this.prisma.$transaction(async (tx) => {
        const confirmed = await this.lockAndCountConfirmed(tx, id);
        // Relida depois do lock: o que muda é decidido sobre o estado atual.
        const locked = await tx.classOccurrence.findUnique({ where: { id } });
        if (!locked) return { count: 0 };
        const schedule = plannedSchedule(locked, input);
        if (confirmed > 0 && schedule.changed) {
          throw this.reservationsError(
            ErrorCode.CHANGE_INVALIDATES_RESERVATIONS,
            confirmed,
            `Esta aula tem ${confirmed} ${pluralReservations(confirmed)}: horário e duração não podem mudar.`,
          );
        }
        if (input.capacity !== undefined && input.capacity < confirmed) {
          throw this.reservationsError(
            ErrorCode.CHANGE_INVALIDATES_RESERVATIONS,
            confirmed,
            `A capacidade não pode ficar abaixo de ${confirmed} ${pluralReservations(confirmed)}.`,
          );
        }
        return tx.classOccurrence.updateMany({
          where: { id, status: OccurrenceStatus.SCHEDULED },
          data: {
            ...(schedule.changed
              ? { ...schedule.interval, durationMinutes: schedule.durationMinutes }
              : {}),
            instructorId,
            ...(input.capacity !== undefined ? { capacity: input.capacity } : {}),
          },
        });
      }),
    );
    if (count === 0) await this.findScheduledInScope(id, requester);
    return this.detailById(id);
  }

  /** Sai da agenda do cliente, continua no histórico e libera o horário. */
  async cancel(id: string, requester: OccurrenceRequester): Promise<OccurrenceDetail> {
    await this.findScheduledInScope(id, requester);
    const { count } = await this.prisma.$transaction(async (tx) => {
      const confirmed = await this.lockAndCountConfirmed(tx, id);
      if (confirmed > 0) {
        throw this.reservationsError(
          ErrorCode.OCCURRENCE_HAS_RESERVATIONS,
          confirmed,
          `Esta aula tem ${confirmed} ${pluralReservations(confirmed)} e não pode ser cancelada.`,
        );
      }
      return tx.classOccurrence.updateMany({
        where: { id, status: OccurrenceStatus.SCHEDULED },
        data: { status: OccurrenceStatus.CANCELLED },
      });
    });
    if (count === 0) await this.findScheduledInScope(id, requester);
    return this.detailById(id);
  }

  /**
   * Exclusão definitiva (aula criada por engano), inclusive do histórico: as
   * reservas canceladas saem junto. Reserva confirmada ou com presença
   * registrada bloqueia — é compromisso ou histórico de um cliente.
   */
  async delete(id: string, requester: OccurrenceRequester): Promise<void> {
    await this.findInScope(id, requester);
    const { count } = await this.prisma.$transaction(async (tx) => {
      await lockOccurrenceRows(tx, [id]);
      const byStatus = await tx.reservation.groupBy({
        by: ["status"],
        where: { occurrenceId: id },
        _count: { _all: true },
      });
      const countOf = (status: string) =>
        byStatus.find((row) => row.status === status)?._count._all ?? 0;
      const confirmed = countOf(ReservationStatus.CONFIRMED);
      const kept = byStatus.reduce(
        (sum, row) => (row.status === ReservationStatus.CANCELLED ? sum : sum + row._count._all),
        0,
      );
      if (kept > 0) {
        throw this.reservationsError(
          ErrorCode.OCCURRENCE_HAS_RESERVATIONS,
          confirmed,
          confirmed > 0
            ? `Esta aula tem ${confirmed} ${pluralReservations(confirmed)} e não pode ser excluída.`
            : "Esta aula tem presenças registradas e não pode ser excluída.",
        );
      }
      await tx.reservation.deleteMany({ where: { occurrenceId: id } });
      return tx.classOccurrence.deleteMany({ where: { id } });
    });
    if (count === 0) throw this.notFound();
  }

  /**
   * Trava a linha da ocorrência (FOR UPDATE) e conta as reservas confirmadas.
   * O motor de reserva trava a mesma linha antes de confirmar, então a
   * contagem vale até o fim da transação: não entra reserva entre a checagem
   * e a alteração.
   */
  private async lockAndCountConfirmed(tx: Prisma.TransactionClient, id: string): Promise<number> {
    await lockOccurrenceRows(tx, [id]);
    return tx.reservation.count({
      where: { occurrenceId: id, status: ReservationStatus.CONFIRMED },
    });
  }

  /** OCCURRENCE_HAS_RESERVATIONS ou CHANGE_INVALIDATES_RESERVATIONS, com as confirmadas em details. */
  private reservationsError(code: ErrorCode, confirmed: number, message: string): DomainError {
    return new DomainError(code, message, ErrorStatus.CONFLICT, {
      confirmedReservations: confirmed,
    } satisfies OccurrenceReservationsDetails);
  }
  private async detailById(id: string): Promise<OccurrenceDetail> {
    const occurrence = await this.prisma.classOccurrence.findUnique({
      where: { id },
      include: OCCURRENCE_INCLUDE,
    });
    if (!occurrence) throw this.notFound();
    return this.toDetail(occurrence);
  }

  private notFound(): DomainError {
    return new DomainError(ErrorCode.NOT_FOUND, "Aula não encontrada.", ErrorStatus.NOT_FOUND);
  }

  private async findInScope(id: string, requester: OccurrenceRequester) {
    const occurrence = await this.prisma.classOccurrence.findUnique({ where: { id } });
    if (!occurrence) throw this.notFound();
    this.assertInScope(occurrence.instructorId, requester);
    return occurrence;
  }

  private async findScheduledInScope(id: string, requester: OccurrenceRequester) {
    const occurrence = await this.findInScope(id, requester);
    if (occurrence.status === OccurrenceStatus.CANCELLED) {
      throw new DomainError(
        ErrorCode.OCCURRENCE_CANCELLED,
        "Esta aula foi cancelada e não pode ser alterada.",
        ErrorStatus.UNPROCESSABLE,
      );
    }
    return occurrence;
  }

  /**
   * Recorrência materializada: uma ocorrência concreta por data, ligadas por
   * um seriesId só para rastreabilidade. Tudo ou nada — qualquer conflito
   * recusa a operação inteira, listando todas as datas em conflito.
   */
  async createRecurring(
    input: CreateRecurringOccurrencesRequest,
    requester: OccurrenceRequester,
  ): Promise<RecurringOccurrencesResult> {
    const dates = this.recurrenceDates(input);
    const settings = await this.resolveSettings(input, requester);
    const intervals = dates.map((date) =>
      intervalAt(date, input.startTime, settings.durationMinutes),
    );
    await this.assertNoOverlap(intervals);

    const seriesId = randomUUID();
    const occurrences = await this.withOverlapTranslation(intervals, () =>
      this.prisma.$transaction(
        intervals.map((interval) =>
          this.prisma.classOccurrence.create({
            data: { ...settings, ...interval, seriesId },
            include: OCCURRENCE_INCLUDE,
          }),
        ),
      ),
    );
    return { seriesId, occurrences: occurrences.map((occurrence) => this.toDetail(occurrence)) };
  }

  private recurrenceDates(input: CreateRecurringOccurrencesRequest): string[] {
    const invalid = (message: string) =>
      new DomainError(ErrorCode.INVALID_RECURRENCE, message, ErrorStatus.VALIDATION);

    if (input.weekdays.length === 0) throw invalid("Escolha ao menos um dia da semana.");
    if (new Set(input.weekdays).size !== input.weekdays.length) {
      throw invalid("Os dias da semana não podem se repetir.");
    }
    if (input.endDate < input.startDate)
      throw invalid("A data final precisa ser depois da inicial.");
    if (input.endDate > addMonths(input.startDate, RECURRENCE_MAX_MONTHS)) {
      throw new DomainError(
        ErrorCode.RECURRENCE_HORIZON_EXCEEDED,
        `O período de uma recorrência pode ter no máximo ${RECURRENCE_MAX_MONTHS} meses.`,
        ErrorStatus.UNPROCESSABLE,
      );
    }

    const dates = expandRecurrenceDates(input.startDate, input.endDate, input.weekdays);
    if (dates.length === 0) throw invalid("Nenhuma data do período cai nos dias escolhidos.");
    return dates;
  }

  /** Dados copiados do template, com os ajustes de professor e capacidade permitidos. */
  private async resolveSettings(
    input: { templateId: string; instructorId?: string | null; capacity?: number },
    requester: OccurrenceRequester,
  ) {
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

    return {
      templateId: template.id,
      name: template.name,
      description: template.description,
      modalityId: template.modalityId,
      instructorId,
      durationMinutes: template.durationMinutes,
      capacity: input.capacity ?? template.capacity,
    };
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
      bookedCount: occurrence._count.reservations,
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

/**
 * Horário resultante de uma edição, na mesma unidade da entrada (data, hora
 * e duração locais): `changed` só quando algum deles de fato muda.
 */
function plannedSchedule(
  occurrence: { startsAt: Date; durationMinutes: number },
  input: UpdateOccurrenceRequest,
): { interval: Interval; durationMinutes: number; changed: boolean } {
  const local = utcToGymDateTime(occurrence.startsAt);
  const date = input.date ?? local.date;
  const time = input.startTime ?? local.time;
  const durationMinutes = input.durationMinutes ?? occurrence.durationMinutes;
  return {
    interval: intervalAt(date, time, durationMinutes),
    durationMinutes,
    changed:
      date !== local.date || time !== local.time || durationMinutes !== occurrence.durationMinutes,
  };
}

function pluralReservations(count: number): string {
  return count === 1 ? "reserva confirmada" : "reservas confirmadas";
}
