import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import { MemoryRouter, useLocation } from "react-router-dom";
import {
  Module,
  PermissionAction,
  PermissionScope,
  type CurrentUser,
  type EffectivePermission,
  type UserDetail,
} from "@fitburn/contracts";
import { AppRoutes } from "../src/App";
import { AuthProvider } from "../src/lib/auth/AuthContext";
import { tokenStore } from "../src/lib/auth/token-store";
import { server } from "./msw-server";

const CLIENT_ME: UserDetail = {
  id: "user-1",
  email: "marina.souza@email.com",
  fullName: "Marina Souza",
  phone: "31998765432",
  birthDate: "1994-03-14",
  document: "12345678900",
  address: "Rua das Palmeiras, 220",
  status: "ACTIVE",
  profile: { id: "profile-1", name: "Cliente" },
  onboardingPending: [],
};

const STAFF_ME: UserDetail = {
  id: "user-1",
  email: "rafael@fitburn.local",
  fullName: "Rafael Prado",
  phone: null,
  birthDate: null,
  document: null,
  address: null,
  status: "ACTIVE",
  profile: { id: "profile-2", name: "Professor" },
  onboardingPending: [],
};

const TEACHER_PERMISSIONS: EffectivePermission[] = [
  {
    module: Module.PRESENCA,
    actions: [PermissionAction.VIEW],
    scope: PermissionScope.ASSIGNED_CLASSES,
  },
];

function LocationProbe() {
  return <output data-testid="location">{useLocation().pathname}</output>;
}

function renderAt(path: string) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <MemoryRouter initialEntries={[path]}>
          <AppRoutes />
          <LocationProbe />
        </MemoryRouter>
      </AuthProvider>
    </QueryClientProvider>,
  );
}

describe("Perfil / Minha conta", () => {
  let me: UserDetail;
  let patches: unknown[];
  let passwordChanges: unknown[];
  let passwordUrls: string[];
  let logoutCalls: number;
  let refreshCalls: number;

  function mockSession(detail: UserDetail, permissions: EffectivePermission[] = []) {
    me = { ...detail };
    patches = [];
    passwordChanges = [];
    passwordUrls = [];
    logoutCalls = 0;
    refreshCalls = 0;
    const current: CurrentUser = {
      id: detail.id,
      email: detail.email,
      fullName: detail.fullName,
      status: detail.status,
      profile: detail.profile,
      permissions,
      onboardingPending: [],
    };
    server.use(
      http.post("/api/auth/refresh", () => {
        refreshCalls += 1;
        return HttpResponse.json({ accessToken: "token", user: current });
      }),
      http.post("/api/auth/logout", () => {
        logoutCalls += 1;
        return new HttpResponse(null, { status: 204 });
      }),
      http.get("/api/me", () => HttpResponse.json(me)),
      http.get("/api/plans/mine", () => HttpResponse.json({ active: null, history: [] })),
      http.patch("/api/me", async ({ request }) => {
        const body = (await request.json()) as Partial<UserDetail>;
        patches.push(body);
        if (body.email === "em-uso@fitburn.local") {
          return HttpResponse.json(
            { code: "EMAIL_ALREADY_IN_USE", message: "Este e-mail já está em uso." },
            { status: 409 },
          );
        }
        me = { ...me, ...body };
        return HttpResponse.json(me);
      }),
      http.post("/api/auth/password", async ({ request }) => {
        passwordUrls.push(request.url);
        passwordChanges.push(await request.json());
        return HttpResponse.json({ accessToken: "token-renovado", user: current });
      }),
    );
  }

  describe("cliente", () => {
    beforeEach(() => {
      mockSession(CLIENT_ME);
    });

    it("mostra os dados pessoais em modo de visualização", async () => {
      renderAt("/perfil");

      const card = await screen.findByRole("region", { name: "Dados pessoais" });
      expect(within(card).getByText("Marina Souza")).toBeInTheDocument();
      expect(within(card).getByText("marina.souza@email.com")).toBeInTheDocument();
      expect(within(card).getByText("31998765432")).toBeInTheDocument();
      expect(within(card).getByText("14/03/1994")).toBeInTheDocument();
      expect(within(card).getByText("12345678900")).toBeInTheDocument();
      expect(within(card).getByText("Rua das Palmeiras, 220")).toBeInTheDocument();
      expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
      const sidebar = screen.getByRole("navigation", { name: "Navegação principal" });
      expect(within(sidebar).getByRole("link", { name: "Perfil" })).toHaveClass("active");
      const tabbar = screen.getByRole("navigation", { name: "Navegação inferior" });
      expect(within(tabbar).getByRole("link", { name: "Perfil" })).toBeInTheDocument();
    });

    it("edita os dados, salva e volta ao modo de visualização com os novos valores", async () => {
      const user = userEvent.setup();
      renderAt("/perfil");

      await user.click(await screen.findByRole("button", { name: "Editar" }));
      const name = screen.getByLabelText("Nome completo");
      expect(name).toHaveValue("Marina Souza");
      expect(screen.getByLabelText("Data de nascimento")).toHaveValue("1994-03-14");
      await user.clear(name);
      await user.type(name, "Marina S. Andrade");
      const phone = screen.getByLabelText("Telefone");
      await user.clear(phone);
      await user.type(phone, "31911112222");
      await user.click(screen.getByRole("button", { name: "Salvar alterações" }));

      const card = await screen.findByRole("region", { name: "Dados pessoais" });
      expect(await within(card).findByText("Marina S. Andrade")).toBeInTheDocument();
      expect(within(card).getByText("31911112222")).toBeInTheDocument();
      expect(screen.queryByLabelText("Nome completo")).not.toBeInTheDocument();
      expect(patches).toEqual([
        {
          fullName: "Marina S. Andrade",
          email: "marina.souza@email.com",
          phone: "31911112222",
          birthDate: "1994-03-14",
          document: "12345678900",
          address: "Rua das Palmeiras, 220",
        },
      ]);
    });

    it("remove documento e endereço sem alterar telefone e nascimento", async () => {
      const user = userEvent.setup();
      mockSession(CLIENT_ME);
      renderAt("/perfil");

      await user.click(await screen.findByRole("button", { name: "Editar" }));
      await user.clear(screen.getByLabelText("CPF"));
      await user.clear(screen.getByLabelText("Endereço"));
      await user.click(screen.getByRole("button", { name: "Salvar alterações" }));

      expect(await screen.findByRole("region", { name: "Dados pessoais" })).toBeInTheDocument();
      expect(patches).toEqual([
        {
          fullName: "Marina Souza",
          email: "marina.souza@email.com",
          phone: "31998765432",
          birthDate: "1994-03-14",
          document: null,
          address: null,
        },
      ]);
    });

    it("impede remover telefone e data de nascimento", async () => {
      const user = userEvent.setup();
      mockSession(CLIENT_ME);
      renderAt("/perfil");

      await user.click(await screen.findByRole("button", { name: "Editar" }));
      await user.clear(screen.getByLabelText("Telefone"));
      await user.clear(screen.getByLabelText("Data de nascimento"));
      await user.click(screen.getByRole("button", { name: "Salvar alterações" }));

      expect(await screen.findByRole("alert")).toHaveTextContent(
        "Telefone e data de nascimento são obrigatórios.",
      );
      expect(patches).toEqual([]);
    });

    it("avisa quando o novo e-mail já está em uso e mantém a edição aberta", async () => {
      const user = userEvent.setup();
      renderAt("/perfil");

      await user.click(await screen.findByRole("button", { name: "Editar" }));
      const email = screen.getByLabelText("E-mail");
      await user.clear(email);
      await user.type(email, "em-uso@fitburn.local");
      await user.click(screen.getByRole("button", { name: "Salvar alterações" }));

      expect(await screen.findByRole("alert")).toHaveTextContent("Este e-mail já está em uso.");
      expect(screen.getByLabelText("E-mail")).toHaveValue("em-uso@fitburn.local");
      expect(screen.getByRole("button", { name: "Salvar alterações" })).toBeEnabled();
    });

    it("valida o formato antes de enviar", async () => {
      const user = userEvent.setup();
      renderAt("/perfil");

      await user.click(await screen.findByRole("button", { name: "Editar" }));
      const email = screen.getByLabelText("E-mail");
      await user.clear(email);
      await user.type(email, "isso-nao-e-email");
      await user.click(screen.getByRole("button", { name: "Salvar alterações" }));

      expect(await screen.findByRole("alert")).toHaveTextContent("E-mail inválido.");
      expect(patches).toEqual([]);
    });

    it("cancelar descarta as alterações", async () => {
      const user = userEvent.setup();
      renderAt("/perfil");

      await user.click(await screen.findByRole("button", { name: "Editar" }));
      const name = screen.getByLabelText("Nome completo");
      await user.clear(name);
      await user.type(name, "Outro Nome");
      await user.click(screen.getByRole("button", { name: "Cancelar" }));

      const card = await screen.findByRole("region", { name: "Dados pessoais" });
      expect(within(card).getByText("Marina Souza")).toBeInTheDocument();
      expect(patches).toEqual([]);
    });

    it("não oferece edição de perfil de acesso, status nem senha", async () => {
      const user = userEvent.setup();
      renderAt("/perfil");

      await user.click(await screen.findByRole("button", { name: "Editar" }));
      const card = screen.getByRole("region", { name: "Dados pessoais" });
      expect(within(card).queryByLabelText(/perfil de acesso/i)).not.toBeInTheDocument();
      expect(within(card).queryByLabelText(/status/i)).not.toBeInTheDocument();
      expect(within(card).queryByLabelText(/senha/i)).not.toBeInTheDocument();
    });

    it("troca a senha e limpa os campos sem encerrar a sessão", async () => {
      const user = userEvent.setup();
      renderAt("/perfil");

      await user.click(await screen.findByRole("button", { name: "Alterar senha" }));
      await user.type(screen.getByLabelText("Senha atual"), "SenhaAtual123!");
      await user.type(screen.getByLabelText("Nova senha"), "SenhaNova456!");
      await user.click(screen.getByRole("button", { name: "Salvar nova senha" }));

      expect(passwordChanges).toEqual([
        { currentPassword: "SenhaAtual123!", newPassword: "SenhaNova456!" },
      ]);
      expect(passwordUrls).toHaveLength(1);
      expect(passwordUrls[0]).toMatch(/\/api\/auth\/password$/);
      expect(passwordUrls[0]).not.toContain("SenhaAtual123!");
      expect(passwordUrls[0]).not.toContain("SenhaNova456!");
      expect(await screen.findByText("Senha alterada com sucesso.")).toBeInTheDocument();
      expect(tokenStore.get()).toBe("token-renovado");
      expect(screen.queryByLabelText("Senha atual")).not.toBeInTheDocument();
      expect(screen.queryByLabelText("Nova senha")).not.toBeInTheDocument();
      expect(window.localStorage.length).toBe(0);
      expect(window.sessionStorage.length).toBe(0);
      expect(logoutCalls).toBe(0);
      expect(
        screen.getByText("/perfil", { selector: "[data-testid=location]" }),
      ).toBeInTheDocument();
    });

    it("limpa os campos ao cancelar a troca", async () => {
      const user = userEvent.setup();
      renderAt("/perfil");

      await user.click(await screen.findByRole("button", { name: "Alterar senha" }));
      await user.type(screen.getByLabelText("Senha atual"), "SenhaAtual123!");
      await user.type(screen.getByLabelText("Nova senha"), "SenhaNova456!");
      await user.click(screen.getByRole("button", { name: "Cancelar troca de senha" }));

      expect(screen.queryByLabelText("Senha atual")).not.toBeInTheDocument();
      expect(screen.queryByLabelText("Nova senha")).not.toBeInTheDocument();
      expect(passwordChanges).toEqual([]);
    });

    it("mostra senha atual incorreta sem encerrar ou renovar a sessão", async () => {
      server.use(
        http.post("/api/auth/password", () =>
          HttpResponse.json(
            { code: "CURRENT_PASSWORD_INVALID", message: "A senha atual está incorreta." },
            { status: 400 },
          ),
        ),
      );
      const user = userEvent.setup();
      renderAt("/perfil");

      await user.click(await screen.findByRole("button", { name: "Alterar senha" }));
      await user.type(screen.getByLabelText("Senha atual"), "senha-errada");
      await user.type(screen.getByLabelText("Nova senha"), "SenhaNova456!");
      await user.click(screen.getByRole("button", { name: "Salvar nova senha" }));

      expect(await screen.findByRole("alert")).toHaveTextContent("A senha atual está incorreta.");
      expect(refreshCalls).toBe(1);
      expect(logoutCalls).toBe(0);
      expect(screen.getByLabelText("Senha atual")).toHaveValue("senha-errada");
      expect(
        screen.getByText("/perfil", { selector: "[data-testid=location]" }),
      ).toBeInTheDocument();
    });

    it("sai do app pela ação de logout da tela", async () => {
      const user = userEvent.setup();
      renderAt("/perfil");

      await user.click(await screen.findByRole("button", { name: "Sair da conta" }));

      await screen.findByText("/login", { selector: "[data-testid=location]" });
      expect(logoutCalls).toBe(1);
    });
  });

  describe("equipe", () => {
    beforeEach(() => {
      mockSession(STAFF_ME, TEACHER_PERMISSIONS);
      server.use(http.get("/api/attendance/classes", () => HttpResponse.json([])));
    });

    it("abre Minha conta pelo menu administrativo, com os mesmos dados", async () => {
      const user = userEvent.setup();
      renderAt("/minhas-aulas");

      await user.click(await screen.findByRole("link", { name: "Minha conta" }));

      await screen.findByText("/perfil", { selector: "[data-testid=location]" });
      const card = await screen.findByRole("region", { name: "Dados pessoais" });
      expect(within(card).getByText("Rafael Prado")).toBeInTheDocument();
      expect(within(card).getByText("rafael@fitburn.local")).toBeInTheDocument();
      // Dados opcionais ausentes aparecem como traço, na casca administrativa.
      expect(within(card).getAllByText("—")).toHaveLength(4);
      expect(screen.getByRole("navigation", { name: "Navegação principal" })).toBeInTheDocument();
    });

    it("edita o nome e o menu passa a mostrar o novo nome", async () => {
      const user = userEvent.setup();
      renderAt("/perfil");

      await user.click(await screen.findByRole("button", { name: "Editar" }));
      const name = screen.getByLabelText("Nome completo");
      await user.clear(name);
      await user.type(name, "Rafael P. Lima");
      await user.click(screen.getByRole("button", { name: "Salvar alterações" }));

      await screen.findByText("Rafael P. Lima", { selector: ".app-menu__account-name" });
      // Os opcionais em branco viajam como nulos.
      expect(patches).toEqual([
        {
          fullName: "Rafael P. Lima",
          email: "rafael@fitburn.local",
          phone: null,
          birthDate: null,
          document: null,
          address: null,
        },
      ]);
    });
  });
});
