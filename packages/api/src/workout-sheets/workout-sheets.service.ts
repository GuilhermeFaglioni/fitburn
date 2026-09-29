import { Injectable } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import {
  ErrorCode,
  ErrorStatus,
  WorkoutSheetStatus,
  type ClientSummary,
  type CreateWorkoutSheetRequest,
  type UpdateWorkoutSheetRequest,
  type WorkoutExerciseInput,
  type WorkoutSheet,
  type WorkoutSheetStatusName,
} from "@fitburn/contracts";
import { PrismaService } from "../prisma/prisma.service.js";
import { DomainError } from "../common/errors/domain-error.js";
import {
  ACTIVE_CLIENT_WHERE,
  assertClientInScope,
  clientScopeFilter,
} from "../permissions/client-scope.js";
import type { ScopedRequester } from "../permissions/scoped-requester.js";

const SHEET_INCLUDE = {
  author: { select: { fullName: true } },
  exercises: { orderBy: { position: "asc" } },
} satisfies Prisma.WorkoutSheetInclude;

type SheetRow = Prisma.WorkoutSheetGetPayload<{ include: typeof SHEET_INCLUDE }>;

const STATUS_ORDER: Record<WorkoutSheetStatusName, number> = {
  [WorkoutSheetStatus.ACTIVE]: 0,
  [WorkoutSheetStatus.COMPLETED]: 1,
  [WorkoutSheetStatus.ARCHIVED]: 2,
};

/** Ativas primeiro, depois as concluídas e as arquivadas; em cada grupo, as mais recentes antes. */
function orderSheets(sheets: SheetRow[]): SheetRow[] {
  return [...sheets].sort(
    (a, b) =>
      STATUS_ORDER[a.status] - STATUS_ORDER[b.status] ||
      b.createdAt.getTime() - a.createdAt.getTime(),
  );
}

/** Campo em branco vale como "não informado". */
function blankToNull(value: string | undefined): string | null {
  return value ? value : null;
}

/**
 * Fichas de treino: a equipe monta as fichas dos clientes do seu escopo; o
 * cliente só lê as próprias. Os exercícios são uma lista ordenada que a
 * edição substitui inteira (dentro da transação da própria edição).
 */
@Injectable()
export class WorkoutSheetsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Os clientes ativos do escopo de quem pede: a lista "meus alunos" da tela. */
  async clientsInScope(requester: ScopedRequester): Promise<ClientSummary[]> {
    return this.prisma.user.findMany({
      where: { AND: [ACTIVE_CLIENT_WHERE, clientScopeFilter(requester)] },
      select: { id: true, fullName: true, email: true },
      orderBy: { fullName: "asc" },
    });
  }

  async listForClient(clientId: string, requester: ScopedRequester): Promise<WorkoutSheet[]> {
    await assertClientInScope(this.prisma, clientId, requester);
    return this.listOf(clientId);
  }

  /** As fichas do próprio cliente, todas (ele vê também as concluídas e arquivadas). */
  listMine(clientId: string): Promise<WorkoutSheet[]> {
    return this.listOf(clientId);
  }

  async findMine(id: string, clientId: string): Promise<WorkoutSheet> {
    const sheet = await this.prisma.workoutSheet.findFirst({
      where: { id, clientId },
      include: SHEET_INCLUDE,
    });
    if (!sheet) throw this.notFound();
    return this.toDetail(sheet);
  }

  async create(
    input: CreateWorkoutSheetRequest,
    authorId: string,
    requester: ScopedRequester,
  ): Promise<WorkoutSheet> {
    await assertClientInScope(this.prisma, input.clientId, requester);
    const sheet = await this.prisma.workoutSheet.create({
      data: {
        clientId: input.clientId,
        authorId,
        title: input.title,
        notes: blankToNull(input.notes),
        status: input.status ?? WorkoutSheetStatus.ACTIVE,
        exercises: { create: this.exerciseRows(input.exercises ?? []) },
      },
      include: SHEET_INCLUDE,
    });
    return this.toDetail(sheet);
  }

  async update(
    id: string,
    input: UpdateWorkoutSheetRequest,
    requester: ScopedRequester,
  ): Promise<WorkoutSheet> {
    await this.assertSheetInScope(id, requester);
    const sheet = await this.prisma.$transaction(async (tx) => {
      // Trava a linha da ficha: edições simultâneas esperam a fila em vez de
      // apagar e recriar os exercícios ao mesmo tempo (e violar (ficha, posição)).
      const locked = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT id FROM workout_sheets WHERE id = ${id} FOR UPDATE`;
      if (locked.length === 0) throw this.notFound();
      if (input.exercises) {
        await tx.workoutExercise.deleteMany({ where: { sheetId: id } });
      }
      return tx.workoutSheet.update({
        where: { id },
        data: {
          title: input.title,
          notes: input.notes === undefined ? undefined : blankToNull(input.notes ?? undefined),
          status: input.status,
          exercises: input.exercises ? { create: this.exerciseRows(input.exercises) } : undefined,
        },
        include: SHEET_INCLUDE,
      });
    });
    return this.toDetail(sheet);
  }

  async remove(id: string, requester: ScopedRequester): Promise<void> {
    await this.assertSheetInScope(id, requester);
    await this.prisma.workoutSheet.delete({ where: { id } });
  }

  private async listOf(clientId: string): Promise<WorkoutSheet[]> {
    const sheets = await this.prisma.workoutSheet.findMany({
      where: { clientId },
      include: SHEET_INCLUDE,
    });
    return orderSheets(sheets).map((sheet) => this.toDetail(sheet));
  }

  private async assertSheetInScope(id: string, requester: ScopedRequester): Promise<void> {
    const sheet = await this.prisma.workoutSheet.findUnique({
      where: { id },
      select: { clientId: true },
    });
    if (!sheet) throw this.notFound();
    await assertClientInScope(this.prisma, sheet.clientId, requester);
  }

  private notFound(): DomainError {
    return new DomainError(
      ErrorCode.NOT_FOUND,
      "Ficha de treino não encontrada.",
      ErrorStatus.NOT_FOUND,
    );
  }

  /** A posição de cada exercício é o índice dele na lista enviada. */
  private exerciseRows(
    exercises: WorkoutExerciseInput[],
  ): Prisma.WorkoutExerciseCreateWithoutSheetInput[] {
    return exercises.map((exercise, position) => ({
      position,
      name: exercise.name,
      sets: blankToNull(exercise.sets),
      reps: blankToNull(exercise.reps),
      load: blankToNull(exercise.load),
      duration: blankToNull(exercise.duration),
      distance: blankToNull(exercise.distance),
      notes: blankToNull(exercise.notes),
    }));
  }

  private toDetail(sheet: SheetRow): WorkoutSheet {
    return {
      id: sheet.id,
      clientId: sheet.clientId,
      title: sheet.title,
      notes: sheet.notes,
      status: sheet.status,
      authorName: sheet.author.fullName,
      createdAt: sheet.createdAt.toISOString(),
      updatedAt: sheet.updatedAt.toISOString(),
      exercises: sheet.exercises.map((exercise) => ({
        id: exercise.id,
        name: exercise.name,
        sets: exercise.sets,
        reps: exercise.reps,
        load: exercise.load,
        duration: exercise.duration,
        distance: exercise.distance,
        notes: exercise.notes,
      })),
    };
  }
}
