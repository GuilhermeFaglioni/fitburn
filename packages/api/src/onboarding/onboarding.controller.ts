import { Controller, Get, Param, Post, Req, UseGuards } from "@nestjs/common";
import { JwtAuthGuard, type AuthenticatedRequest } from "../auth/jwt-auth.guard.js";
import { AllowDuringOnboarding } from "./allow-during-onboarding.decorator.js";
import { OnboardingService } from "./onboarding.service.js";

@Controller("legal-documents")
export class LegalDocumentsController {
  constructor(private readonly onboardingService: OnboardingService) {}

  @Get(":document")
  getDocument(@Param("document") document: string) {
    return this.onboardingService.getLegalDocument(document);
  }
}

@Controller("onboarding")
@UseGuards(JwtAuthGuard)
export class OnboardingController {
  constructor(private readonly onboardingService: OnboardingService) {}

  @Post("privacy-acknowledgement")
  @AllowDuringOnboarding()
  acknowledgePrivacy(@Req() req: AuthenticatedRequest) {
    return this.onboardingService.acknowledgePrivacy(req.authUser.sub);
  }

  @Post("terms-acceptance")
  @AllowDuringOnboarding()
  acceptTerms(@Req() req: AuthenticatedRequest) {
    return this.onboardingService.acceptTerms(req.authUser.sub);
  }
}
