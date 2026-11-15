import { Module } from "@nestjs/common";
import { BioimpedanceConsentController } from "./bioimpedance-consent.controller.js";
import { BioimpedanceConsentService } from "./bioimpedance-consent.service.js";

@Module({
  controllers: [BioimpedanceConsentController],
  providers: [BioimpedanceConsentService],
  exports: [BioimpedanceConsentService],
})
export class BioimpedanceModule {}
