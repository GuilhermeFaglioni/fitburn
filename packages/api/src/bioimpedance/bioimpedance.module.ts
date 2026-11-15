import { Module } from "@nestjs/common";
import { PermissionsModule } from "../permissions/permissions.module.js";
import { BioimpedanceAssessmentsController } from "./bioimpedance-assessments.controller.js";
import { BioimpedanceAssessmentsService } from "./bioimpedance-assessments.service.js";
import { BioimpedanceConsentController } from "./bioimpedance-consent.controller.js";
import { BioimpedanceConsentService } from "./bioimpedance-consent.service.js";

@Module({
  imports: [PermissionsModule],
  controllers: [BioimpedanceConsentController, BioimpedanceAssessmentsController],
  providers: [BioimpedanceConsentService, BioimpedanceAssessmentsService],
  exports: [BioimpedanceConsentService, BioimpedanceAssessmentsService],
})
export class BioimpedanceModule {}
