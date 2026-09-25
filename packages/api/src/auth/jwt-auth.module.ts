import { Global, Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { JwtAuthGuard } from "./jwt-auth.guard.js";

/**
 * JwtAuthGuard é usado por controllers de vários módulos de feature
 * (UsersController, e os que vierem depois). Global evita um ciclo de
 * import: sem isso, cada módulo consumidor precisaria importar o AuthModule,
 * que por sua vez importa UsersModule — mesmo padrão do PrismaModule.
 */
@Global()
@Module({
  imports: [
    JwtModule.register({
      secret: process.env.JWT_ACCESS_SECRET,
      signOptions: { expiresIn: Number(process.env.JWT_ACCESS_TTL_SECONDS) || 900 },
    }),
  ],
  providers: [JwtAuthGuard],
  exports: [JwtModule, JwtAuthGuard],
})
export class JwtAuthModule {}
