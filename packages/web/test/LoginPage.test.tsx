import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { AuthProvider } from "../src/lib/auth/AuthContext";
import { LoginPage } from "../src/pages/LoginPage";
import { mockFailedLogin, mockSuccessfulLogin } from "./auth-mocks";
import { setBrowserOnline } from "./connectivity-helpers";
import { server } from "./msw-server";

/**
 * Tela de login na base de design (#156, D-038): envio, erro de credencial ligado à senha, carregando, mostrar/ocultar
 * senha, offline e o botão de tema no cabeçalho. O redirecionamento por perfil fica em LoginFlow.test.tsx.
 */

function renderLogin() {
  return render(
    <AuthProvider>
      <MemoryRouter initialEntries={["/login"]}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/" element={<div>Início do cliente</div>} />
        </Routes>
      </MemoryRouter>
    </AuthProvider>,
  );
}

const email = () => screen.getByLabelText("E-mail");
const password = () => screen.getByLabelText("Senha");

async function fillAndSubmit(user: ReturnType<typeof userEvent.setup>) {
  await user.type(email(), "aluno@exemplo.com");
  await user.type(password(), "SenhaForte123!");
  await user.click(screen.getByRole("button", { name: "Entrar" }));
}

afterEach(() => {
  act(() => setBrowserOnline(true));
});

describe("LoginPage: estrutura", () => {
  it("mostra o logotipo, o título com a ênfase em itálico, o subtítulo, o aviso de acesso e os links legais", () => {
    renderLogin();

    expect(screen.getByText("FITBURN")).toBeInTheDocument();
    const title = screen.getByRole("heading", { level: 1, name: "Bem-vindo de volta" });
    expect(within(title).getByText("de volta")).toHaveClass("fb-em");
    expect(screen.getByText("Entre com suas credenciais para continuar.")).toBeInTheDocument();
    expect(screen.getByText("Acesso restrito a alunos e equipe Fitburn.")).toBeInTheDocument();
    const legal = screen.getByRole("navigation", { name: "Documentos legais" });
    expect(within(legal).getByRole("link", { name: "Política de privacidade" })).toHaveAttribute("href", "/privacidade");
    expect(within(legal).getByRole("link", { name: "Termos de uso" })).toHaveAttribute("href", "/termos");
  });

  it("tem o botão de tema no cabeçalho da própria tela (o mesmo ThemeToggle, uma única vez)", () => {
    renderLogin();

    expect(screen.getAllByRole("button", { name: /Alternar para o tema/ })).toHaveLength(1);
  });

  it("o botão Entrar é o primário de largura total e os campos têm o tipo e o autocomplete certos", () => {
    renderLogin();

    expect(screen.getByRole("button", { name: "Entrar" })).toHaveClass("fb-ui-btn--primary", "fb-ui-btn--block");
    expect(email()).toHaveAttribute("type", "email");
    expect(email()).toHaveAttribute("autocomplete", "email");
    expect(password()).toHaveAttribute("autocomplete", "current-password");
  });
});

describe("LoginPage: envio e erro de credencial", () => {
  it("envia o e-mail e a senha digitados e segue para o destino do perfil", async () => {
    let body: unknown;
    mockSuccessfulLogin("Cliente");
    server.use(
      http.post("/api/auth/login", async ({ request }) => {
        body = await request.json();
        return HttpResponse.json(
          {
            accessToken: "token-de-teste",
            user: {
              id: "user-1",
              email: "aluno@exemplo.com",
              fullName: "Aluno de Teste",
              status: "ACTIVE",
              profile: { id: "profile-1", name: "Cliente" },
              permissions: [],
              onboardingPending: [],
            },
          },
          { status: 201 },
        );
      }),
    );
    renderLogin();

    await fillAndSubmit(userEvent.setup());

    expect(await screen.findByText("Início do cliente")).toBeInTheDocument();
    expect(body).toEqual({ email: "aluno@exemplo.com", password: "SenhaForte123!" });
  });

  it("sem erro, os campos não ficam inválidos", () => {
    renderLogin();

    expect(email()).not.toHaveAttribute("aria-invalid");
    expect(password()).not.toHaveAttribute("aria-invalid");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("credencial recusada: a mensagem do login aparece com role=alert e a senha fica inválida e ligada a ela", async () => {
    mockFailedLogin("INVALID_CREDENTIALS", "Não foi possível entrar.");
    renderLogin();

    await fillAndSubmit(userEvent.setup());

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Não foi possível entrar. Verifique seu e-mail e senha e tente novamente.");
    expect(password()).toHaveAttribute("aria-invalid", "true");
    expect(password()).toHaveAttribute("aria-describedby", alert.id);
    expect(screen.getByRole("button", { name: "Entrar" })).not.toHaveAttribute("aria-busy");
  });

  it("um novo envio limpa o erro anterior", async () => {
    mockFailedLogin("INVALID_CREDENTIALS", "Não foi possível entrar.");
    renderLogin();
    const user = userEvent.setup();
    await fillAndSubmit(user);
    await screen.findByRole("alert");

    mockSuccessfulLogin("Cliente");
    await user.click(screen.getByRole("button", { name: "Entrar" }));

    expect(await screen.findByText("Início do cliente")).toBeInTheDocument();
  });
});

describe("LoginPage: carregando", () => {
  it("durante o envio o botão marca aria-busy, não é desabilitado e o clique duplo não envia de novo", async () => {
    let calls = 0;
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    server.use(
      http.post("/api/auth/login", async () => {
        calls += 1;
        await gate;
        return HttpResponse.json({ code: "INVALID_CREDENTIALS", message: "Não foi possível entrar." }, { status: 401 });
      }),
    );
    renderLogin();
    const user = userEvent.setup();
    await user.type(email(), "aluno@exemplo.com");
    await user.type(password(), "SenhaForte123!");
    await user.click(screen.getByRole("button", { name: "Entrar" }));

    const busy = await screen.findByRole("button", { name: "Entrando…" });
    expect(busy).toHaveAttribute("aria-busy", "true");
    expect(busy).not.toBeDisabled();

    await user.click(busy);
    await user.click(busy);
    expect(calls).toBe(1);

    release();
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Entrar" })).not.toHaveAttribute("aria-busy");
  });
});

describe("LoginPage: mostrar e ocultar a senha", () => {
  it("alterna o tipo do campo e o rótulo do botão, sem perder o que foi digitado", async () => {
    renderLogin();
    const user = userEvent.setup();
    await user.type(password(), "segredo");

    expect(password()).toHaveAttribute("type", "password");
    await user.click(screen.getByRole("button", { name: "Mostrar senha" }));
    expect(password()).toHaveAttribute("type", "text");
    expect(password()).toHaveValue("segredo");

    await user.click(screen.getByRole("button", { name: "Ocultar senha" }));
    expect(password()).toHaveAttribute("type", "password");
  });

  it("o botão não envia o formulário", async () => {
    renderLogin();
    const user = userEvent.setup();
    await user.type(email(), "aluno@exemplo.com");
    await user.type(password(), "segredo");

    await user.click(screen.getByRole("button", { name: "Mostrar senha" }));

    expect(screen.queryByRole("button", { name: "Entrando…" })).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});

describe("LoginPage: sem conexão", () => {
  it("mostra o estado offline e mantém o Entrar indisponível e explicado; volta ao normal quando a conexão volta", () => {
    renderLogin();
    expect(screen.queryByText("Sem conexão")).not.toBeInTheDocument();

    act(() => setBrowserOnline(false));
    const state = screen.getByText("Sem conexão").closest("[data-state='offline']");
    expect(state).toHaveAttribute("role", "status");
    expect(state).toHaveTextContent("Entrar precisa de internet");
    const submit = screen.getByRole("button", { name: "Entrar" });
    expect(submit).toBeDisabled();
    expect(submit).toHaveAttribute("title", expect.stringContaining("sem conexão"));

    act(() => setBrowserOnline(true));
    expect(screen.queryByText("Sem conexão")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Entrar" })).toBeEnabled();
  });
});
