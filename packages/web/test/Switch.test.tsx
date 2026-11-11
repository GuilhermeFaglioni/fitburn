import { readFileSync } from "node:fs";
import { join } from "node:path";
import { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Switch } from "../src/components/ui/Switch";

function Controlled({ disabled = false }: { disabled?: boolean }) {
  const [checked, setChecked] = useState(false);
  return (
    <Switch
      label="Visível na loja"
      description="Produto oculto não aparece para o cliente."
      checked={checked}
      onChange={setChecked}
      disabled={disabled}
    />
  );
}

describe("Switch", () => {
  it("é um role=switch com nome, descrição e aria-checked", async () => {
    const user = userEvent.setup();
    render(<Controlled />);

    const toggle = screen.getByRole("switch", { name: "Visível na loja" });
    expect(toggle).toHaveAccessibleDescription("Produto oculto não aparece para o cliente.");
    expect(toggle).toHaveAttribute("aria-checked", "false");

    await user.click(toggle);
    expect(toggle).toHaveAttribute("aria-checked", "true");

    toggle.focus();
    await user.keyboard(" ");
    expect(toggle).toHaveAttribute("aria-checked", "false");
  });

  it("desabilitado não muda", async () => {
    const user = userEvent.setup();
    render(<Controlled disabled />);
    const toggle = screen.getByRole("switch", { name: "Visível na loja" });
    await user.click(toggle);
    expect(toggle).toHaveAttribute("aria-checked", "false");
  });
});

describe("CSS do Switch", () => {
  const css = readFileSync(join(process.cwd(), "src/styles/components.css"), "utf8");
  const block = css.slice(css.indexOf("/* ---- Interruptor (Switch) ---- */"));

  it("só tokens: sem cor literal, e a transição usa duração e curva dos tokens", () => {
    expect(block.match(/#[0-9a-fA-F]{3,8}\b/g) ?? []).toEqual([]);
    for (const [, value] of block.matchAll(/transition:\s*([^;]+);/g)) {
      expect(value).toMatch(/var\(--duration-state\)/);
      expect(value).toContain("var(--ease-out)");
    }
  });

  it("respeita reduced motion (a bolinha não anda) e mostra o foco com --sh-focus", () => {
    expect(block).toMatch(/@media \(prefers-reduced-motion: reduce\)[\s\S]*fb-ui-switch__thumb[\s\S]*transition-property: none/);
    expect(block).toMatch(/\.fb-ui-switch__control:focus-visible[\s\S]*var\(--sh-focus\)/);
  });
});
