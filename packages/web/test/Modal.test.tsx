import { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Modal } from "../src/components/Modal";

function Harness() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Abrir
      </button>
      {open && (
        <Modal title="Novo cliente" onClose={() => setOpen(false)}>
          <label>
            Nome
            <input />
          </label>
          <button type="button">Salvar</button>
          <button type="button" onClick={() => setOpen(false)}>
            Cancelar
          </button>
        </Modal>
      )}
    </>
  );
}

describe("Modal", () => {
  it("leva o foco para dentro do diálogo ao abrir", async () => {
    render(<Harness />);
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "Abrir" }));

    expect(screen.getByRole("dialog", { name: "Novo cliente" })).toContainElement(
      document.activeElement as HTMLElement,
    );
  });

  it("mantém o Tab dentro do diálogo, do último controle de volta ao primeiro", async () => {
    render(<Harness />);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Abrir" }));

    screen.getByRole("button", { name: "Cancelar" }).focus();
    await user.tab();

    expect(screen.getByLabelText("Nome")).toHaveFocus();
  });

  it("mantém o Shift+Tab dentro do diálogo, do primeiro controle ao último", async () => {
    render(<Harness />);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Abrir" }));

    screen.getByLabelText("Nome").focus();
    await user.tab({ shift: true });

    expect(screen.getByRole("button", { name: "Cancelar" })).toHaveFocus();
  });

  it("devolve o foco ao botão que abriu o diálogo ao fechar com Esc", async () => {
    render(<Harness />);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Abrir" }));

    await user.keyboard("{Escape}");

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Abrir" })).toHaveFocus();
  });

  it("devolve o foco ao botão que abriu o diálogo ao fechar por um botão interno", async () => {
    render(<Harness />);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Abrir" }));

    await user.click(screen.getByRole("button", { name: "Cancelar" }));

    expect(screen.getByRole("button", { name: "Abrir" })).toHaveFocus();
  });
});
