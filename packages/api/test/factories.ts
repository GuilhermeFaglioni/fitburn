import type {
  AccessProfile,
  Module,
  PermissionAction,
  PermissionScope,
  ReservationStatus,
  UserStatus,
} from "@prisma/client";
import { hashPassword } from "../src/auth/password.util.js";
import { testPrisma } from "./db-test-helper.js";

export function createAccessProfile(overrides: {
  name: string;
  isSystem?: boolean;
}): Promise<AccessProfile> {
  return testPrisma.accessProfile.create({
    data: { name: overrides.name, isSystem: overrides.isSystem ?? false },
  });
}

export async function createUser(overrides: {
  email: string;
  password: string;
  profileId: string;
  fullName?: string;
  status?: UserStatus;
  document?: string;
  phone?: string;
}) {
  const passwordHash = await hashPassword(overrides.password);
  return testPrisma.user.create({
    data: {
      email: overrides.email,
      passwordHash,
      fullName: overrides.fullName ?? "Usuário de Teste",
      profileId: overrides.profileId,
      status: overrides.status ?? "ACTIVE",
      document: overrides.document,
      phone: overrides.phone,
    },
  });
}

export function grantModuleAccess(overrides: {
  profileId: string;
  module: Module;
  actions: PermissionAction[];
  scope: PermissionScope;
}) {
  return testPrisma.profileModuleAccess.upsert({
    where: { profileId_module: { profileId: overrides.profileId, module: overrides.module } },
    update: { actions: overrides.actions, scope: overrides.scope },
    create: {
      profileId: overrides.profileId,
      module: overrides.module,
      actions: overrides.actions,
      scope: overrides.scope,
    },
  });
}

const HOUR_MS = 60 * 60_000;

/** Uma aula de 1 hora (com modalidade e template próprios) que começa em `startsAt`. */
export async function createOccurrence(
  startsAt: Date,
  overrides: {
    instructorId?: string | null;
    status?: "SCHEDULED" | "CANCELLED";
    name?: string;
  } = {},
) {
  const name = overrides.name ?? "Treino Funcional";
  const modality = await testPrisma.modality.upsert({
    where: { name },
    update: {},
    create: { name },
  });
  const template = await testPrisma.classTemplate.create({
    data: { name, durationMinutes: 60, capacity: 12, modalityId: modality.id },
  });
  return testPrisma.classOccurrence.create({
    data: {
      templateId: template.id,
      modalityId: modality.id,
      name,
      durationMinutes: 60,
      capacity: 12,
      status: overrides.status ?? "SCHEDULED",
      instructorId: overrides.instructorId ?? null,
      startsAt,
      endsAt: new Date(startsAt.getTime() + HOUR_MS),
    },
  });
}

/** Cria a reserva direto no banco (sem passar pelo motor de reserva), no estado pedido. */
export function createReservation(
  clientId: string,
  occurrenceId: string,
  status: ReservationStatus = "CONFIRMED",
) {
  return testPrisma.reservation.create({ data: { clientId, occurrenceId, status } });
}
