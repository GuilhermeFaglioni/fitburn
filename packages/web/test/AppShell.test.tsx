import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { AppShell } from "../src/components/AppShell";
import { AuthProvider } from "../src/lib/auth/AuthContext";

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
});
