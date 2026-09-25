import { z } from "zod";
import { effectivePermissionSchema } from "./permissions.js";

export const UserStatus = {
  ACTIVE: "ACTIVE",
  INACTIVE: "INACTIVE",
} as const;

export const loginRequestSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(1),
});
export type LoginRequest = z.infer<typeof loginRequestSchema>;

export const profileSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
});
export type ProfileSummary = z.infer<typeof profileSummarySchema>;

export const currentUserSchema = z.object({
  id: z.string(),
  email: z.string(),
  fullName: z.string(),
  status: z.enum([UserStatus.ACTIVE, UserStatus.INACTIVE]),
  profile: profileSummarySchema,
  permissions: z.array(effectivePermissionSchema),
});
export type CurrentUser = z.infer<typeof currentUserSchema>;

export const loginResponseSchema = z.object({
  accessToken: z.string(),
  user: currentUserSchema,
});
export type LoginResponse = z.infer<typeof loginResponseSchema>;
