import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { PrismaModule } from "./prisma/prisma.module.js";
import { HealthModule } from "./health/health.module.js";
import { AuthModule } from "./auth/auth.module.js";
import { JwtAuthModule } from "./auth/jwt-auth.module.js";
import { UsersModule } from "./users/users.module.js";
import { PermissionsModule } from "./permissions/permissions.module.js";
import { ProfilesModule } from "./profiles/profiles.module.js";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: "../../.env" }),
    PrismaModule,
    JwtAuthModule,
    HealthModule,
    PermissionsModule,
    UsersModule,
    ProfilesModule,
    AuthModule,
  ],
})
export class AppModule {}
