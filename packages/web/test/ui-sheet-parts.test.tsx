import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Alert } from "../src/components/ui/Alert";
import { Dialog } from "../src/components/ui/Dialog";
import { Meter } from "../src/components/ui/Meter";

/** Peças compartilhadas da folha de detalhe (#156 PR 7): medidor, aviso em linha e o Dialog em variante sheet. */

describe("Meter", () => {
  it("expõe o valor por extenso e preenche a proporção", () => {
    render(<Meter value={5} max={8} label="5 de 8 vagas ocupadas" />);
    expect(
      screen.getByRole("img", { name: "5 de 8 vagas ocupadas" }).firstElementChild,
    ).toHaveStyle({
      width: "62.5%",
    });
  });

  it("limita o preenchimento entre 0 e 100% e tolera total zero", () => {
    const { rerender } = render(<Meter value={12} max={8} label="cheio" />);
    expect(screen.getByRole("img", { name: "cheio" }).firstElementChild).toHaveStyle({
      width: "100%",
    });
    rerender(<Meter value={-3} max={8} label="vazio" />);
    expect(screen.getByRole("img", { name: "vazio" }).firstElementChild).toHaveStyle({
      width: "0%",
    });
    rerender(<Meter value={3} max={0} label="sem total" />);
    expect(screen.getByRole("img", { name: "sem total" }).firstElementChild).toHaveStyle({
      width: "0%",
    });
  });
});

describe("Alert", () => {
  it("erro é um alerta anunciado na hora, com ícone", () => {
    render(<Alert tone="err">Conflito de reserva.</Alert>);
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("Conflito de reserva.");
    expect(alert).toHaveClass("fb-ui-alert--err");
    expect(alert.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
  });

  it("sucesso é um status", () => {
    render(<Alert tone="ok">Reserva confirmada.</Alert>);
    expect(screen.getByRole("status")).toHaveClass("fb-ui-alert--ok");
  });
});

describe("Dialog em variante sheet", () => {
  it("renderiza barra superior, selo, título, descrição, corpo e rodapé fixo", async () => {
    const onClose = vi.fn();
    render(
      <Dialog
        variant="sheet"
        title="Mobilidade e core"
        description="Hoje · 07h00 às 07h45"
        eyebrow={<span>Mobilidade</span>}
        topBar={<button type="button">Voltar</button>}
        footer={<button type="button">Reservar aula</button>}
        onClose={onClose}
      >
        <p>Conteúdo</p>
      </Dialog>,
    );
    const dialog = screen.getByRole("dialog", { name: "Mobilidade e core" });
    expect(dialog).toHaveClass("fb-ui-dialog--sheet");
    expect(dialog).toHaveAccessibleDescription("Hoje · 07h00 às 07h45");
    expect(
      screen.getByRole("button", { name: "Voltar" }).closest(".fb-ui-dialog__topbar"),
    ).not.toBeNull();
    expect(screen.getByText("Conteúdo").closest(".fb-ui-dialog__body")).not.toBeNull();
    expect(
      screen.getByRole("button", { name: "Reservar aula" }).closest(".fb-ui-dialog__footer"),
    ).not.toBeNull();
    // O foco inicial é o primeiro controle: a barra superior.
    expect(screen.getByRole("button", { name: "Voltar" })).toHaveFocus();

    await userEvent.setup().keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("a variante padrão continua igual: ações à direita, sem barra nem rodapé de folha", () => {
    render(
      <Dialog
        title="Cancelar?"
        onClose={() => undefined}
        actions={<button type="button">Sim</button>}
      >
        <p>Texto</p>
      </Dialog>,
    );
    const dialog = screen.getByRole("dialog", { name: "Cancelar?" });
    expect(dialog).not.toHaveClass("fb-ui-dialog--sheet");
    expect(
      dialog.querySelector(".fb-ui-dialog__body, .fb-ui-dialog__footer, .fb-ui-dialog__topbar"),
    ).toBeNull();
    expect(
      screen.getByRole("button", { name: "Sim" }).closest(".fb-ui-dialog__actions"),
    ).not.toBeNull();
  });
});
