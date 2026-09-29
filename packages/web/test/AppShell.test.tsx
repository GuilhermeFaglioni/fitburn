import { act, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { AppShell } from "../src/components/AppShell";
import { AuthProvider } from "../src/lib/auth/AuthContext";
import { setBrowserOnline } from "./connectivity-helpers";

describe("AppShell", () => {
  it("renderiza os filhos dentro da casca de layout base", () => {
    render(
      <AuthProvider>
        <MemoryRouter>
          <AppShell>
            <p>conteúdo</p>
          </AppShell>
        </MemoryRouter>
      </AuthProvider>,
    );

    const shell = screen.getByTestId("app-shell");
    expect(shell).toBeInTheDocument();
    expect(shell).toContainElement(screen.getByText("conteúdo"));
  });

  it("mostra o banner global de sem conexão em qualquer tela quando o navegador fica offline", () => {
    render(
      <AuthProvider>
        <MemoryRouter>
          <AppShell>
            <p>conteúdo</p>
          </AppShell>
        </MemoryRouter>
      </AuthProvider>,
    );
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();

    act(() => setBrowserOnline(false));

    expect(screen.getByRole("alert")).toHaveTextContent("Sem conexão");
    expect(screen.getByText("conteúdo")).toBeInTheDocument();
  });
});
