import { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ActionMenu } from "../src/components/ui/ActionMenu";
import { Textarea } from "../src/components/ui/Textarea";

describe("Textarea", () => {
  function Controlled({ error, help }: { error?: string; help?: string }) {
    const [value, setValue] = useState("linha 1\nlinha 2");
    return (
      <Textarea
        label="Observações"
        value={value}
        error={error}
        help={help}
        onChange={(event) => setValue(event.target.value)}
      />
    );
  }

  it("liga o rótulo ao campo e preserva as quebras de linha", () => {
    render(<Controlled />);

    expect(screen.getByLabelText("Observações")).toHaveValue("linha 1\nlinha 2");
    expect(screen.getByLabelText("Observações")).not.toHaveAttribute("aria-invalid");
  });

  it("a ajuda é ligada por aria-describedby e o erro a substitui, com aria-invalid e alerta", () => {
    const { rerender } = render(<Controlled help="Até 2000 caracteres." />);
    expect(screen.getByLabelText("Observações")).toHaveAccessibleDescription("Até 2000 caracteres.");

    rerender(<Controlled help="Até 2000 caracteres." error="Texto longo demais." />);

    const field = screen.getByLabelText("Observações");
    expect(field).toHaveAttribute("aria-invalid", "true");
    expect(field).toHaveAccessibleDescription("Texto longo demais.");
    expect(screen.getByRole("alert")).toHaveTextContent("Texto longo demais.");
  });
});

describe("ActionMenu", () => {
  it("escolher um item chama a ação, fecha o menu e devolve o foco ao botão", async () => {
    const onSelect = vi.fn();
    const user = userEvent.setup();
    render(<ActionMenu label="Ações da linha" items={[{ key: "a", label: "Abrir", onSelect }]} />);

    await user.click(screen.getByRole("button", { name: "Ações da linha" }));
    await user.click(screen.getByRole("menuitem", { name: "Abrir" }));

    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Ações da linha" })).toHaveFocus();
  });

  it("desabilitado, os itens seguem focáveis, não fazem nada e o motivo é lido junto", async () => {
    const onSelect = vi.fn();
    const user = userEvent.setup();
    render(
      <ActionMenu
        label="Ações da linha"
        enabled={false}
        disabledReason="Sem permissão."
        items={[{ key: "a", label: "Abrir", onSelect }]}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Ações da linha" }));
    const item = screen.getByRole("menuitem", { name: "Abrir" });
    expect(item).toHaveFocus();
    expect(item).toHaveAttribute("aria-disabled", "true");
    expect(item).toHaveAccessibleDescription("Sem permissão.");
    await user.click(item);

    expect(onSelect).not.toHaveBeenCalled();
    expect(screen.getByRole("menu")).toBeInTheDocument();
  });
});
