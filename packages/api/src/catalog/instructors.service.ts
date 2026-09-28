import { Injectable } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import {
  ErrorCode,
  ErrorStatus,
  SystemProfileName,
  type InstructorSummary,
} from "@fitburn/contracts";
import { PrismaService } from "../prisma/prisma.service.js";
import { DomainError } from "../common/errors/domain-error.js";

/** Professor = qualquer usuário de equipe ativo (não existe perfil "Professor" fixo). */
const INSTRUCTOR_WHERE: Prisma.UserWhereInput = {
  status: "ACTIVE",
  NOT: { profile: { isSystem: true, name: SystemProfileName.CLIENT } },
};

@Injectable()
export class InstructorsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(): Promise<InstructorSummary[]> {
    return this.prisma.user.findMany({
      where: INSTRUCTOR_WHERE,
      select: { id: true, fullName: true },
      orderBy: { fullName: "asc" },
    });
  }

  async assertIsInstructor(userId: string): Promise<void> {
    const instructor = await this.prisma.user.findFirst({
      where: { id: userId, ...INSTRUCTOR_WHERE },
    });
    if (!instructor) {
      throw new DomainError(
        ErrorCode.VALIDATION_ERROR,
        "O professor precisa ser um usuário de equipe ativo.",
        ErrorStatus.VALIDATION,
      );
    }
  }
}
