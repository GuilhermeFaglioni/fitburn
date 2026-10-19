import { Global, Module } from "@nestjs/common";
import { LegalDocumentsController, OnboardingController } from "./onboarding.controller.js";
import { OnboardingService } from "./onboarding.service.js";

@Global()
@Module({
  controllers: [LegalDocumentsController, OnboardingController],
  providers: [OnboardingService],
  exports: [OnboardingService],
})
export class OnboardingModule {}
