import { Body, Controller, Get, Patch, Req, UseGuards } from "@nestjs/common";
import {
  bioimpedanceConsentRequestSchema,
  type BioimpedanceConsentRequest,
  type BioimpedanceConsentResponse,
} from "@fitburn/contracts";
import { JwtAuthGuard, type AuthenticatedRequest } from "../auth/jwt-auth.guard.js";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe.js";
import { BioimpedanceConsentService } from "./bioimpedance-consent.service.js";

/** Consentimento de bioimpedância do próprio cliente (D-042): o dono é sempre quem está autenticado. */
@Controller("bioimpedance/consent")
@UseGuards(JwtAuthGuard)
export class BioimpedanceConsentController {
  constructor(private readonly consentService: BioimpedanceConsentService) {}

  @Get()
  read(@Req() req: AuthenticatedRequest): Promise<BioimpedanceConsentResponse> {
    return this.consentService.read(req.authUser.sub);
  }

  @Patch()
  update(
    @Body(new ZodValidationPipe(bioimpedanceConsentRequestSchema))
    body: BioimpedanceConsentRequest,
    @Req() req: AuthenticatedRequest,
  ): Promise<BioimpedanceConsentResponse> {
    return this.consentService.set(req.authUser.sub, body.consented);
  }
}
