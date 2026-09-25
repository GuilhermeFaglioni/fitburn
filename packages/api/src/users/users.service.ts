import { Injectable } from "@nestjs/common";
import type { AccessProfile, User } from "@prisma/client";
import type { CurrentUser } from "@fitburn/contracts";
import { PrismaService } from "../prisma/prisma.service.js";

export type UserWithProfile = User & { profile: AccessProfile };

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  findByEmail(email: string): Promise<UserWithProfile | null> {
    return this.prisma.user.findUnique({
      where: { email },
      include: { profile: true },
    });
  }

  findById(id: string): Promise<UserWithProfile | null> {
    return this.prisma.user.findUnique({
      where: { id },
      include: { profile: true },
    });
  }

  toCurrentUser(user: UserWithProfile): CurrentUser {
    return {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      status: user.status,
      profile: { id: user.profile.id, name: user.profile.name },
    };
  }
}
