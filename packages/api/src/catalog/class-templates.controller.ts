import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  UseGuards,
} from "@nestjs/common";
import {
  createClassTemplateRequestSchema,
  Module,
  PermissionAction,
  updateClassTemplateRequestSchema,
  type ClassTemplateDetail,
  type CreateClassTemplateRequest,
  type InstructorSummary,
  type UpdateClassTemplateRequest,
} from "@fitburn/contracts";
import { JwtAuthGuard } from "../auth/jwt-auth.guard.js";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe.js";
import { PermissionsGuard } from "../permissions/permissions.guard.js";
import { RequirePermission } from "../permissions/require-permission.decorator.js";
import { ClassTemplatesService } from "./class-templates.service.js";
import { InstructorsService } from "./instructors.service.js";

@Controller("class-templates")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ClassTemplatesController {
  constructor(
    private readonly templatesService: ClassTemplatesService,
    private readonly instructorsService: InstructorsService,
  ) {}

  @RequirePermission(Module.TEMPLATES_DE_AULA, PermissionAction.VIEW)
  @Get()
  list(): Promise<ClassTemplateDetail[]> {
    return this.templatesService.list();
  }

  @RequirePermission(Module.TEMPLATES_DE_AULA, PermissionAction.VIEW)
  @Get("instructors")
  instructors(): Promise<InstructorSummary[]> {
    return this.instructorsService.list();
  }

  @RequirePermission(Module.TEMPLATES_DE_AULA, PermissionAction.CREATE)
  @Post()
  create(
    @Body(new ZodValidationPipe(createClassTemplateRequestSchema)) body: CreateClassTemplateRequest,
  ): Promise<ClassTemplateDetail> {
    return this.templatesService.create(body);
  }

  @RequirePermission(Module.TEMPLATES_DE_AULA, PermissionAction.EDIT)
  @Patch(":id")
  update(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updateClassTemplateRequestSchema)) body: UpdateClassTemplateRequest,
  ): Promise<ClassTemplateDetail> {
    return this.templatesService.update(id, body);
  }

  @RequirePermission(Module.TEMPLATES_DE_AULA, PermissionAction.EDIT)
  @Post(":id/activate")
  activate(@Param("id") id: string): Promise<ClassTemplateDetail> {
    return this.templatesService.activate(id);
  }

  @RequirePermission(Module.TEMPLATES_DE_AULA, PermissionAction.EDIT)
  @Post(":id/deactivate")
  deactivate(@Param("id") id: string): Promise<ClassTemplateDetail> {
    return this.templatesService.deactivate(id);
  }

  @RequirePermission(Module.TEMPLATES_DE_AULA, PermissionAction.DELETE)
  @HttpCode(HttpStatus.NO_CONTENT)
  @Delete(":id")
  async remove(@Param("id") id: string): Promise<void> {
    await this.templatesService.delete(id);
  }
}
