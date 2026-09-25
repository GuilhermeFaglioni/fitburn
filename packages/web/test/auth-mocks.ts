import { http, HttpResponse } from "msw";
import {
  ALL_MODULES,
  ALL_PERMISSION_ACTIONS,
  PermissionScope,
  type CurrentUser,
  type EffectivePermission,
} from "@fitburn/contracts";
import { server } from "./msw-server";

const ADMIN_PERMISSIONS: EffectivePermission[] = ALL_MODULES.map((module) => ({
  module,
  actions: ALL_PERMISSION_ACTIONS,
  scope: PermissionScope.ALL,
}));

export function mockSuccessfulLogin(
  profileName: "Administrador" | "Cliente",
  permissions: EffectivePermission[] = profileName === "Administrador" ? ADMIN_PERMISSIONS : [],
): CurrentUser {
  const user: CurrentUser = {
    id: "user-1",
    email: "usuario@fitburn.local",
    fullName: "Usuário de Teste",
    status: "ACTIVE",
    profile: { id: "profile-1", name: profileName },
    permissions,
  };

  server.use(
    http.post("/api/auth/login", () =>
      HttpResponse.json({ accessToken: "token-de-teste", user }, { status: 201 }),
    ),
  );

  return user;
}

export function mockFailedLogin(code: string, message: string): void {
  server.use(
    http.post("/api/auth/login", () => HttpResponse.json({ code, message }, { status: 401 })),
  );
}
