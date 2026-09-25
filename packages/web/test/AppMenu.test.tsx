import { useEffect, useState } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { AppMenu } from "../src/components/AppMenu";
import { AuthProvider, useAuth } from "../src/lib/auth/AuthContext";
import { mockSuccessfulLogin } from "./auth-mocks";

function LoggedInMenu() {
  const { login } = useAuth();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    login("usuario@fitburn.local", "SenhaForte123!").then(() => setReady(true));
  }, [login]);

  return (
    <div data-testid="menu-ready-marker" data-ready={ready}>
      {ready && <AppMenu />}
    </div>
  );
}

function renderMenuAsAuthenticated() {
  return render(
    <AuthProvider>
      <MemoryRouter>
        <LoggedInMenu />
      </MemoryRouter>
    </AuthProvider>,
  );
}

describe("AppMenu", () => {
  it("mostra o Dashboard para quem tem permissão de visualizar o módulo", async () => {
    mockSuccessfulLogin("Administrador");
    renderMenuAsAuthenticated();

    expect(await screen.findByRole("link", { name: "Dashboard" })).toBeInTheDocument();
  });

  it("não mostra o Dashboard para quem não tem essa permissão", async () => {
    mockSuccessfulLogin("Cliente", []);
    renderMenuAsAuthenticated();

    await waitFor(() =>
      expect(screen.getByTestId("menu-ready-marker")).toHaveAttribute("data-ready", "true"),
    );
    expect(screen.queryByRole("link", { name: "Dashboard" })).not.toBeInTheDocument();
  });
});
