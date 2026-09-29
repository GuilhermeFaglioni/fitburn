import {
  userDetailSchema,
  type UpdateOwnProfileRequest,
  type UserDetail,
} from "@fitburn/contracts";
import { authFetch } from "../auth/authFetch";
import { parseOrThrow } from "../auth/api";

/** Os dados pessoais do usuário autenticado (Perfil / Minha conta). */
export async function getMyProfile(): Promise<UserDetail> {
  const response = await authFetch("/api/me");
  return userDetailSchema.parse(await parseOrThrow(response));
}

export async function updateMyProfile(input: UpdateOwnProfileRequest): Promise<UserDetail> {
  const response = await authFetch("/api/me", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  return userDetailSchema.parse(await parseOrThrow(response));
}
