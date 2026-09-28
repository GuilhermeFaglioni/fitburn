import { Injectable } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import {
  ErrorCode,
  ErrorStatus,
  type ClassTemplateDetail,
  type CreateClassTemplateRequest,
  type UpdateClassTemplateRequest,
} from "@fitburn/contracts";
import { PrismaService } from "../prisma/prisma.service.js";
import { DomainError } from "../common/errors/domain-error.js";
import { InstructorsService } from "./instructors.service.js";

const TEMPLATE_INCLUDE = {
  modality: { select: { id: true, name: true } },
  defaultInstructor: { select: { id: true, fullName: true } },
} satisfies Prisma.ClassTemplateInclude;

type TemplateWithRelations = Prisma.ClassTemplateGetPayload<{ include: typeof TEMPLATE_INCLUDE }>;

@Injectable()
export class ClassTemplatesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly instructors: InstructorsService,
  ) {}

  async list(): Promise<ClassTemplateDetail[]> {
    const templates = await this.prisma.classTemplate.findMany({
      include: TEMPLATE_INCLUDE,
      orderBy: { name: "asc" },
    });
    return templates.map((template) => this.toDetail(template));
  }

  async create(input: CreateClassTemplateRequest): Promise<ClassTemplateDetail> {
    await this.assertActiveModality(input.modalityId);
    if (input.defaultInstructorId)
      await this.instructors.assertIsInstructor(input.defaultInstructorId);

    const template = await this.prisma.classTemplate.create({
      data: {
        name: input.name,
        description: input.description,
        durationMinutes: input.durationMinutes,
        capacity: input.capacity,
        modalityId: input.modalityId,
        defaultInstructorId: input.defaultInstructorId ?? null,
      },
      include: TEMPLATE_INCLUDE,
    });
    return this.toDetail(template);
  }

  async update(id: string, input: UpdateClassTemplateRequest): Promise<ClassTemplateDetail> {
    const current = await this.findByIdOrThrow(id);
    // Só valida o que mudou: um template continua editável mesmo que sua
    // modalidade ou seu professor padrão tenham sido desativados depois.
    if (input.modalityId !== undefined && input.modalityId !== current.modalityId) {
      await this.assertActiveModality(input.modalityId);
    }
    if (input.defaultInstructorId && input.defaultInstructorId !== current.defaultInstructorId) {
      await this.instructors.assertIsInstructor(input.defaultInstructorId);
    }

    const template = await this.prisma.classTemplate.update({
      where: { id },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.durationMinutes !== undefined ? { durationMinutes: input.durationMinutes } : {}),
        ...(input.capacity !== undefined ? { capacity: input.capacity } : {}),
        ...(input.modalityId !== undefined ? { modalityId: input.modalityId } : {}),
        ...(input.defaultInstructorId !== undefined
          ? { defaultInstructorId: input.defaultInstructorId }
          : {}),
      },
      include: TEMPLATE_INCLUDE,
    });
    return this.toDetail(template);
  }

  activate(id: string): Promise<ClassTemplateDetail> {
    return this.updateIsActive(id, true);
  }

  deactivate(id: string): Promise<ClassTemplateDetail> {
    return this.updateIsActive(id, false);
  }

  private async updateIsActive(id: string, isActive: boolean): Promise<ClassTemplateDetail> {
    await this.findByIdOrThrow(id);
    const template = await this.prisma.classTemplate.update({
      where: { id },
      data: { isActive },
      include: TEMPLATE_INCLUDE,
    });
    return this.toDetail(template);
  }

  async delete(id: string): Promise<void> {
    await this.findByIdOrThrow(id);
    await this.prisma.classTemplate.delete({ where: { id } });
  }

  private async findByIdOrThrow(id: string) {
    const template = await this.prisma.classTemplate.findUnique({ where: { id } });
    if (!template) {
      throw new DomainError(ErrorCode.NOT_FOUND, "Template não encontrado.", ErrorStatus.NOT_FOUND);
    }
    return template;
  }

  private async assertActiveModality(modalityId: string): Promise<void> {
    const modality = await this.prisma.modality.findUnique({ where: { id: modalityId } });
    if (!modality || !modality.isActive) {
      throw new DomainError(
        ErrorCode.VALIDATION_ERROR,
        "Selecione uma modalidade ativa.",
        ErrorStatus.VALIDATION,
      );
    }
  }

  private toDetail(template: TemplateWithRelations): ClassTemplateDetail {
    return {
      id: template.id,
      name: template.name,
      description: template.description,
      durationMinutes: template.durationMinutes,
      capacity: template.capacity,
      isActive: template.isActive,
      modality: template.modality,
      defaultInstructor: template.defaultInstructor,
    };
  }
}
