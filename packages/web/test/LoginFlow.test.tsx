import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { AuthProvider } from "../src/lib/auth/AuthContext";
import { LoginPage } from "../src/pages/LoginPage";
import { ProtectedRoute } from "../src/routes/ProtectedRoute";
import { mockFailedLogin, mockSuccessfulLogin } from "./auth-mocks";

function renderLoginFlow(initialPath = "/login") {
  return render(
    <AuthProvider>
      <MemoryRouter initialEntries={[initialPath]}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <div>Início do cliente</div>
              </ProtectedRoute>
            }
          />
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <div>Dashboard administrativo</div>
              </ProtectedRoute>
            }
          />
          <Route
            path="/agenda"
            element={
              <ProtectedRoute>
                <div>Agenda</div>
              </ProtectedRoute>
            }
          />
        </Routes>
      </MemoryRouter>
    </AuthProvider>,
  );
}

async function submitLogin(email: string, password: string) {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText("E-mail"), email);
  await user.type(screen.getByLabelText("Senha"), password);
  await user.click(screen.getByRole("button", { name: "Entrar" }));
}

describe("Fluxo de login", () => {
  it("redireciona o administrador para o dashboard", async () => {
    mockSuccessfulLogin("Administrador");
    renderLoginFlow();

    await submitLogin("admin@fitburn.local", "SenhaForte123!");

    expect(await screen.findByText("Dashboard administrativo")).toBeInTheDocument();
  });

  it("administrador chegando por / (redirecionado pelo guard) ainda vai para o dashboard", async () => {
    mockSuccessfulLogin("Administrador");
    renderLoginFlow("/");

    expect(
      await screen.findByRole("heading", { name: "Bem-vindo de volta" }),
    ).toBeInTheDocument();

    await submitLogin("admin@fitburn.local", "TrocarEssaSenha123!");

    expect(await screen.findByText("Dashboard administrativo")).toBeInTheDocument();
  });

  it("redireciona o cliente para a Início", async () => {
    mockSuccessfulLogin("Cliente");
    renderLoginFlow();

    await submitLogin("cliente@fitburn.local", "SenhaForte123!");

    expect(await screen.findByText("Início do cliente")).toBeInTheDocument();
  });

  it("mostra a mensagem de erro genérica quando o login é recusado", async () => {
    mockFailedLogin("INVALID_CREDENTIALS", "Não foi possível entrar.");
    renderLoginFlow();

    await submitLogin("admin@fitburn.local", "senha-errada");

    expect(await screen.findByRole("alert")).toHaveTextContent(
      /não foi possível entrar\. verifique seu e-mail e senha/i,
    );
  });

  it("uma rota protegida redireciona para /login e volta à rota original após entrar", async () => {
    mockSuccessfulLogin("Cliente");
    renderLoginFlow("/agenda");

    expect(
      await screen.findByRole("heading", { name: "Bem-vindo de volta" }),
    ).toBeInTheDocument();

    await submitLogin("cliente@fitburn.local", "SenhaForte123!");

    expect(await screen.findByText("Agenda")).toBeInTheDocument();
  });

  it("alterna a visibilidade da senha", async () => {
    renderLoginFlow();
    const user = userEvent.setup();
    const passwordInput = screen.getByLabelText("Senha");

    expect(passwordInput).toHaveAttribute("type", "password");

    await user.click(screen.getByRole("button", { name: "Mostrar senha" }));
    expect(passwordInput).toHaveAttribute("type", "text");

    await user.click(screen.getByRole("button", { name: "Ocultar senha" }));
    expect(passwordInput).toHaveAttribute("type", "password");
  });
});
