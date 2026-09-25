import { render, screen } from "@testing-library/react";
import { AppShell } from "../src/components/AppShell";

describe("AppShell", () => {
  it("renderiza os filhos dentro da casca de layout base", () => {
    render(
      <AppShell>
        <p>conteúdo</p>
      </AppShell>,
    );

    const shell = screen.getByTestId("app-shell");
    expect(shell).toBeInTheDocument();
    expect(shell).toContainElement(screen.getByText("conteúdo"));
  });
});
