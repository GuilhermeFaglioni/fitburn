import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ExportCsvButton } from "../src/components/ExportCsvButton";

describe("ExportCsvButton: desabilitar por fora", () => {
  it("sem as props novas, continua habilitado e chama onExport", async () => {
    const onExport = vi.fn().mockResolvedValue(undefined);
    render(<ExportCsvButton label="Exportar" onExport={onExport} />);

    const button = screen.getByRole("button", { name: "Exportar" });
    expect(button).toBeEnabled();
    expect(button).not.toHaveAttribute("aria-describedby");

    await userEvent.setup().click(button);
    expect(onExport).toHaveBeenCalledTimes(1);
  });

  it("disabled desabilita o botão e o clique não chama onExport", async () => {
    const onExport = vi.fn().mockResolvedValue(undefined);
    render(<ExportCsvButton label="Exportar" onExport={onExport} disabled />);

    const button = screen.getByRole("button", { name: "Exportar" });
    expect(button).toBeDisabled();

    await userEvent.setup().click(button);
    expect(onExport).not.toHaveBeenCalled();
  });

  it("hint aparece como texto visível associado ao botão por aria-describedby", () => {
    render(
      <ExportCsvButton
        label="Exportar"
        onExport={vi.fn()}
        disabled
        hint="Escolha um período para exportar."
      />,
    );

    const button = screen.getByRole("button", { name: "Exportar" });
    const hint = screen.getByText("Escolha um período para exportar.");
    expect(hint).toBeVisible();
    expect(button).toHaveAccessibleDescription("Escolha um período para exportar.");
  });
});
