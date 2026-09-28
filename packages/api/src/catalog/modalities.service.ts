import { Injectable } from "@nestjs/common";
import type { Modality } from "@prisma/client";
import {
  ErrorCode,
  ErrorStatus,
  type CreateModalityRequest,
  type ModalityDetail,
  type UpdateModalityRequest,
} from "@fitburn/contracts";
import { PrismaService } from "../prisma/prisma.service.js";
import { DomainError } from "../common/errors/domain-error.js";

interface TemplateCounts {
  templateCount: number;
  activeTemplateCount: number;
}

@Injectable()
export class ModalitiesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(): Promise<ModalityDetail[]> {
    const [modalities, counts] = await Promise.all([
      this.prisma.modality.findMany({ orderBy: { name: "asc" } }),
      this.countTemplatesByModality(),
    ]);
    return modalities.map((modality) => this.toDetail(modality, counts.get(modality.id)));
  }

  async create(input: CreateModalityRequest): Promise<ModalityDetail> {
    await this.assertNameAvailable(input.name);
    const modality = await this.prisma.modality.create({
      data: { name: input.name, description: input.description },
    });
    return this.toDetail(modality);
  }

  async update(id: string, input: UpdateModalityRequest): Promise<ModalityDetail> {
    await this.findByIdOrThrow(id);
    if (input.name !== undefined) await this.assertNameAvailable(input.name, id);

    const modality = await this.prisma.modality.update({
      where: { id },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
      },
    });
    return this.detailWithCounts(modality);
  }

  activate(id: string): Promise<ModalityDetail> {
    return this.updateIsActive(id, true);
  }

  deactivate(id: string): Promise<ModalityDetail> {
    return this.updateIsActive(id, false);
  }

  async delete(id: string): Promise<void> {
    await this.findByIdOrThrow(id);
    const templateCount = await this.prisma.classTemplate.count({ where: { modalityId: id } });
    if (templateCount > 0) {
      throw new DomainError(
        ErrorCode.MODALITY_IN_USE,
        "Esta modalidade tem templates vinculados e não pode ser excluída.",
        ErrorStatus.CONFLICT,
        { templateCount },
      );
    }
    await this.prisma.modality.delete({ where: { id } });
  }

  private async updateIsActive(id: string, isActive: boolean): Promise<ModalityDetail> {
    await this.findByIdOrThrow(id);
    const modality = await this.prisma.modality.update({ where: { id }, data: { isActive } });
    return this.detailWithCounts(modality);
  }

  private async findByIdOrThrow(id: string): Promise<Modality> {
    const modality = await this.prisma.modality.findUnique({ where: { id } });
    if (!modality) {
      throw new DomainError(
        ErrorCode.NOT_FOUND,
        "Modalidade não encontrada.",
        ErrorStatus.NOT_FOUND,
      );
    }
    return modality;
  }

  private async assertNameAvailable(name: string, exceptId?: string): Promise<void> {
    const existing = await this.prisma.modality.findUnique({ where: { name } });
    if (existing && existing.id !== exceptId) {
      throw new DomainError(
        ErrorCode.VALIDATION_ERROR,
        "Já existe uma modalidade com este nome.",
        ErrorStatus.VALIDATION,
      );
    }
  }

  private async countTemplatesByModality(
    modalityId?: string,
  ): Promise<Map<string, TemplateCounts>> {
    const groups = await this.prisma.classTemplate.groupBy({
      by: ["modalityId", "isActive"],
      where: modalityId ? { modalityId } : undefined,
      _count: { _all: true },
    });
    const counts = new Map<string, TemplateCounts>();
    for (const group of groups) {
      const entry = counts.get(group.modalityId) ?? { templateCount: 0, activeTemplateCount: 0 };
      entry.templateCount += group._count._all;
      if (group.isActive) entry.activeTemplateCount += group._count._all;
      counts.set(group.modalityId, entry);
    }
    return counts;
  }

  private async detailWithCounts(modality: Modality): Promise<ModalityDetail> {
    const counts = await this.countTemplatesByModality(modality.id);
    return this.toDetail(modality, counts.get(modality.id));
  }

  private toDetail(modality: Modality, counts?: TemplateCounts): ModalityDetail {
    return {
      id: modality.id,
      name: modality.name,
      description: modality.description,
      isActive: modality.isActive,
      templateCount: counts?.templateCount ?? 0,
      activeTemplateCount: counts?.activeTemplateCount ?? 0,
    };
  }
}
