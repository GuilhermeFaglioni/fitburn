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
  canOpenAdminRoute,
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
  it("segue a ordem de menu definida no design, com as telas fora do design no fim", () => {
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
      "Loja",
      "Minhas aulas",
      "Atribuições",
    ]);
  });
});

describe("Loja no menu administrativo (D-039)", () => {
  it("o item Loja só aparece com Ver no módulo LOJA, depois de Metas e antes de Minhas aulas", () => {
    const admin = userWith(
      "Administrador",
      ALL_MODULES.map((module) => ({
        module,
        actions: ALL_PERMISSION_ACTIONS,
        scope: PermissionScope.ALL,
      })),
    );
    const labels = visibleAdminMenuItems(admin).map((item) => item.label);
    expect(labels.indexOf("Loja")).toBe(labels.indexOf("Metas") + 1);
    expect(labels.indexOf("Loja")).toBe(labels.indexOf("Minhas aulas") - 1);

    const onlyCreate = userWith("Estoquista", [
      { module: Module.LOJA, actions: [PermissionAction.CREATE], scope: PermissionScope.ALL },
    ]);
    expect(visibleAdminMenuItems(onlyCreate).map((item) => item.label)).not.toContain("Loja");
    const withView = userWith("Estoquista", view([Module.LOJA], PermissionScope.ALL));
    expect(visibleAdminMenuItems(withView).map((item) => item.to)).toEqual(["/loja-admin"]);
  });

  it("quem só vê a Loja tem /loja-admin como tela inicial, depois de Metas na prioridade", () => {
    expect(homeRouteFor(userWith("Estoquista", view([Module.LOJA], PermissionScope.ALL)))).toBe(
      "/loja-admin",
    );
    expect(
      homeRouteFor(userWith("Equipe", view([Module.LOJA, Module.GAMIFICACAO], PermissionScope.ALL))),
    ).toBe("/metas");
  });

  it("a regra da Loja vale também nas subrotas (produtos, categorias, formulário)", () => {
    const semLoja = userWith("Professor", view([Module.PRESENCA]));
    const comLoja = userWith("Estoquista", view([Module.LOJA], PermissionScope.ALL));
    for (const path of [
      "/loja-admin",
      "/loja-admin/produtos",
      "/loja-admin/categorias",
      "/loja-admin/produtos/novo",
      "/loja-admin/produtos/p-1",
    ]) {
      expect(canOpenAdminRoute(semLoja, path), path).toBe(false);
      expect(canOpenAdminRoute(comLoja, path), path).toBe(true);
    }
    // Prefixo de outro caminho não é subrota.
    expect(canOpenAdminRoute(semLoja, "/loja-adminx")).toBe(true);
  });
});
