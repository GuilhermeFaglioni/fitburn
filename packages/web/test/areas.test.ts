import {
  ALL_MODULES,
  ALL_PERMISSION_ACTIONS,
  Module,
  PermissionAction,
  PermissionScope,
  type CurrentUser,
  type EffectivePermission,
  type ModuleName,
} from "@fitburn/contracts";
import {
  ADMIN_MENU_ITEMS,
  adminRouteForClientPath,
  homeRouteFor,
  visibleAdminMenuItems,
} from "../src/lib/auth/areas";

function userWith(profileName: string, permissions: EffectivePermission[]): CurrentUser {
  return {
    id: "user-1",
    email: "u@fitburn.local",
    fullName: "Usuário",
    status: "ACTIVE",
    profile: { id: "profile-1", name: profileName },
    permissions,
  } as CurrentUser;
}

function view(
  modules: ModuleName[],
  scope: EffectivePermission["scope"] = PermissionScope.ASSIGNED_CLIENTS,
): EffectivePermission[] {
  return modules.map((module) => ({ module, actions: [PermissionAction.VIEW], scope }));
}

describe("rota inicial da equipe (homeRouteFor)", () => {
  it("Administrador cai em /dashboard", () => {
    const admin = userWith(
      "Administrador",
      ALL_MODULES.map((module) => ({
        module,
        actions: ALL_PERMISSION_ACTIONS,
        scope: PermissionScope.ALL,
      })),
    );
    expect(homeRouteFor(admin)).toBe("/dashboard");
  });

  it("Professor com Presença, Fichas e Metas cai em /minhas-aulas, mesmo com Fichas e Metas antes no menu", () => {
    const professor = userWith(
      "Professor",
      view([Module.FICHAS_DE_TREINO, Module.GAMIFICACAO, Module.PRESENCA]),
    );
    const menu = visibleAdminMenuItems(professor).map((item) => item.to);
    expect(menu.indexOf("/fichas")).toBeLessThan(menu.indexOf("/minhas-aulas"));
    expect(homeRouteFor(professor)).toBe("/minhas-aulas");
  });

  it("quem tem Dashboard cai nele, antes de Minhas aulas", () => {
    expect(homeRouteFor(userWith("Gerente", view([Module.PRESENCA, Module.DASHBOARD])))).toBe(
      "/dashboard",
    );
  });

  it("sem Dashboard nem Presença, segue a ordem antiga do menu", () => {
    expect(homeRouteFor(userWith("Recepção", view([Module.PLANOS, Module.CLIENTES])))).toBe(
      "/clientes",
    );
    expect(
      homeRouteFor(userWith("Recepção", view([Module.GAMIFICACAO, Module.FICHAS_DE_TREINO]))),
    ).toBe("/fichas");
    expect(
      homeRouteFor(userWith("Recepção", view([Module.RESERVAS, Module.OCORRENCIAS]))),
    ).toBe("/agenda-administrativa");
    expect(homeRouteFor(userWith("Suporte", view([Module.TEMPLATES_DE_AULA, Module.PLANOS])))).toBe(
      "/planos",
    );
  });

  it("sem nenhuma tela visível, volta para /dashboard", () => {
    expect(homeRouteFor(userWith("Vazio", []))).toBe("/dashboard");
  });

  it("o Cliente cai em /", () => {
    expect(homeRouteFor(userWith("Cliente", []))).toBe("/");
  });

  it("a tela equivalente de /agenda e /ficha-treino não depende da rota inicial", () => {
    const professor = userWith("Professor", view([Module.FICHAS_DE_TREINO, Module.PRESENCA]));
    expect(adminRouteForClientPath(professor, "/ficha-treino")).toBe("/fichas");
    expect(adminRouteForClientPath(professor, "/agenda")).toBe("/minhas-aulas");
  });
});

describe("ordem do menu administrativo (design)", () => {
  it("segue ClientesAdmin.dc.html, com as telas sem artboard no fim", () => {
    expect(ADMIN_MENU_ITEMS.map((item) => item.label)).toEqual([
      "Dashboard",
      "Clientes",
      "Usuários e perfis",
      "Agenda",
      "Reservas",
      "Planos",
      "Templates & modalidades",
      "Fichas de treino",
      "Metas",
      "Minhas aulas",
      "Atribuições",
    ]);
  });
});
