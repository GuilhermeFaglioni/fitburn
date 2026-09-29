import { Injectable } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import {
  ErrorCode,
  ErrorStatus,
  PermissionScope,
  type Assignment,
  type AssignmentOptions,
  type AssignmentsQuery,
  type CreateAssignmentRequest,
} from "@fitburn/contracts";
import { PrismaService } from "../prisma/prisma.service.js";
import { DomainError } from "../common/errors/domain-error.js";
import { InstructorsService } from "../catalog/instructors.service.js";
import { isUniqueViolation } from "../prisma/unique-violation.js";
import { ACTIVE_CLIENT_WHERE, assertIsActiveClient } from "../permissions/client-scope.js";
import { assertFullScope, type ScopedRequester } from "../permissions/scoped-requester.js";

const ASSIGNMENT_INCLUDE = {
  teacher: { select: { id: true, fullName: true } },
  client: { select: { id: true, fullName: true, email: true } },
} satisfies Prisma.TeacherClientAssignmentInclude;

type AssignmentWithPeople = Prisma.TeacherClientAssignmentGetPayload<{
  include: typeof ASSIGNMENT_INCLUDE;
}>;

const FULL_SCOPE_MESSAGE = "Só quem tem acesso a todos os clientes gerencia atribuições.";

/**
 * Atribuição manual de clientes a professores, feita pela administração. Junto
 * dos clientes com reserva nas aulas do professor, é o que forma o escopo
 * "clientes atribuídos" (ver clientScopeFilter).
 */
@Injectable()
export class AssignmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly instructors: InstructorsService,
  ) {}

  /**
   * As atribuições, opcionalmente de um professor. Com escopo total, todas;
   * com qualquer outro escopo, só as do próprio professor.
   */
  async list(query: AssignmentsQuery, requester: ScopedRequester): Promise<Assignment[]> {
    const inScope: Prisma.TeacherClientAssignmentWhereInput =
      requester.scope === PermissionScope.ALL ? {} : { teacherId: requester.userId };
    const assignments = await this.prisma.teacherClientAssignment.findMany({
      where: { AND: [inScope, query.teacherId ? { teacherId: query.teacherId } : {}] },
      include: ASSIGNMENT_INCLUDE,
      orderBy: [{ teacher: { fullName: "asc" } }, { client: { fullName: "asc" } }, { id: "asc" }],
    });
    return assignments.map((assignment) => this.toAssignment(assignment));
  }

  /** Professores (equipe ativa) e clientes ativos, para o formulário de atribuição. */
  async options(requester: ScopedRequester): Promise<AssignmentOptions> {
    assertFullScope(requester, FULL_SCOPE_MESSAGE);
    const [teachers, clients] = await Promise.all([
      this.instructors.list(),
      this.prisma.user.findMany({
        where: ACTIVE_CLIENT_WHERE,
        select: { id: true, fullName: true, email: true },
        orderBy: { fullName: "asc" },
      }),
    ]);
    return { teachers, clients };
  }

  async create(input: CreateAssignmentRequest, requester: ScopedRequester): Promise<Assignment> {
    assertFullScope(requester, FULL_SCOPE_MESSAGE);
    await this.instructors.assertIsInstructor(input.teacherId);
    await assertIsActiveClient(this.prisma, input.clientId);

    // A checagem prévia dá a resposta certa; o índice único é a última defesa
    // contra duas atribuições simultâneas (meta.target vem vazio com adapter-pg).
    const existing = await this.prisma.teacherClientAssignment.findUnique({
      where: { teacherId_clientId: { teacherId: input.teacherId, clientId: input.clientId } },
    });
    if (existing) throw this.alreadyAssigned();

    try {
      const created = await this.prisma.teacherClientAssignment.create({
        data: { teacherId: input.teacherId, clientId: input.clientId },
        include: ASSIGNMENT_INCLUDE,
      });
      return this.toAssignment(created);
    } catch (error) {
      if (isUniqueViolation(error)) throw this.alreadyAssigned();
      throw error;
    }
  }

  async remove(id: string, requester: ScopedRequester): Promise<void> {
    assertFullScope(requester, FULL_SCOPE_MESSAGE);
    const { count } = await this.prisma.teacherClientAssignment.deleteMany({ where: { id } });
    if (count === 0) {
      throw new DomainError(
        ErrorCode.NOT_FOUND,
        "Atribuição não encontrada.",
        ErrorStatus.NOT_FOUND,
      );
    }
  }

  private alreadyAssigned(): DomainError {
    return new DomainError(
      ErrorCode.CLIENT_ALREADY_ASSIGNED,
      "Este cliente já está atribuído a este professor.",
      ErrorStatus.CONFLICT,
    );
  }

  private toAssignment(assignment: AssignmentWithPeople): Assignment {
    return {
      id: assignment.id,
      teacher: assignment.teacher,
      client: assignment.client,
      createdAt: assignment.createdAt.toISOString(),
    };
  }
}
