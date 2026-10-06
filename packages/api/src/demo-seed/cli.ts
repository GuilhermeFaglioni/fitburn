import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { AppModule } from "../app.module.js";
import { AttendanceService } from "../attendance/attendance.service.js";
import { GoalsService } from "../goals/goals.service.js";
import { seedDemoData } from "./demo-seed.js";

/**
 * Comando técnico de seed da demonstração (`pnpm --filter @fitburn/api demo:seed`,
 * sobre o build em dist/: o DI do Nest precisa dos metadados de decorators, que o tsx não emite). Roda fora do
 * servidor HTTP, sobe só o contexto da aplicação (para reusar os serviços de
 * presença e metas) e é idempotente: pode rodar a cada deploy.
 * Exige DEMO_USER_PASSWORD (senha das contas de demonstração).
 */
async function main(): Promise<void> {
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  });
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ["error", "warn"],
  });
  try {
    const summary = await seedDemoData({
      prisma,
      attendance: app.get(AttendanceService),
      goals: app.get(GoalsService),
    });
    console.log(`Seed da demonstração concluído.`);
    console.log(`  Administrador: ${summary.adminEmail}`);
    for (const person of summary.staff) {
      console.log(`  ${person.role.padEnd(10)} ${person.fullName} <${person.email}>`);
    }
    console.log(`  Clientes: ${summary.clients.length} (ex.: ${summary.clients[0].email})`);
    console.log(
      `  Personal Class no período: ${summary.occurrences}; reservas novas: ${summary.reservations}; presenças registradas: ${summary.attendanceMarked}`,
    );
    console.log("  A senha de todas as contas de demonstração é a DEMO_USER_PASSWORD.");
  } finally {
    await app.close();
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
