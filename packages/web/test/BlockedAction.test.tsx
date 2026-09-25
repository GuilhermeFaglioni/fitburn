import { render, screen } from "@testing-library/react";
import { BlockedAction } from "../src/components/BlockedAction";

describe("BlockedAction", () => {
  it("renderiza a ação normalmente quando permitida", () => {
    render(
      <BlockedAction allowed>
        <button>Excluir</button>
      </BlockedAction>,
    );

    const button = screen.getByRole("button", { name: "Excluir" });
    expect(button).toBeEnabled();
    expect(button).not.toHaveAttribute("title");
  });

  it("desabilita e explica o motivo quando não permitida", () => {
    render(
      <BlockedAction allowed={false} reason="Você não pode excluir este registro.">
        <button>Excluir</button>
      </BlockedAction>,
    );

    const button = screen.getByRole("button", { name: "Excluir" });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute("title", "Você não pode excluir este registro.");
  });
});
