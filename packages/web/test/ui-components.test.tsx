import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { Badge } from "../src/components/ui/Badge";
import { Button } from "../src/components/ui/Button";
import { Card } from "../src/components/ui/Card";
import { Chip } from "../src/components/ui/Chip";
import { Field } from "../src/components/ui/Field";
import { Pill } from "../src/components/ui/Pill";
import { Segmented } from "../src/components/ui/Segmented";

/**
 * Componentes base I (#156, PR 3): botão, campo, card, badge, chip, pílula e segmented.
 * Cobre papéis ARIA e estados; a regra "só tokens, sem cor literal" está em ui-components-css.test.ts.
 */

describe("Button", () => {
  it("é type=button por padrão (não envia formulário sem querer) e usa a variante secundária", () => {
    render(<Button>Cancelar</Button>);
    const button = screen.getByRole("button", { name: "Cancelar" });
    expect(button).toHaveAttribute("type", "button");
    expect(button).toHaveClass("fb-ui-btn", "fb-ui-btn--secondary");
  });

  it.each(["primary", "secondary", "soft", "ghost", "danger"] as const)("variante %s", (variant) => {
    render(<Button variant={variant}>Ação</Button>);
    expect(screen.getByRole("button")).toHaveClass(`fb-ui-btn--${variant}`);
  });

  it("tamanho pequeno e largura total são modificadores", () => {
    render(
      <Button size="sm" block>
        Pequeno
      </Button>,
    );
    expect(screen.getByRole("button")).toHaveClass("fb-ui-btn--sm", "fb-ui-btn--block");
  });

  it("carregando: aria-busy, spinner escondido dos leitores e nenhum clique passa (nem por teclado)", async () => {
    const onClick = vi.fn();
    const user = userEvent.setup();
    render(
      <Button variant="primary" busy onClick={onClick}>
        Reservando…
      </Button>,
    );
    const button = screen.getByRole("button", { name: "Reservando…" });
    expect(button).toHaveAttribute("aria-busy", "true");
    expect(button).not.toBeDisabled(); // mantém o foco do teclado
    expect(button.querySelector(".fb-ui-spinner")).toHaveAttribute("aria-hidden", "true");
    button.focus();
    await user.click(button);
    await user.keyboard("{Enter}");
    expect(onClick).not.toHaveBeenCalled();
  });

  it("sem busy não tem aria-busy nem spinner, e o clique chama o manipulador", async () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Salvar</Button>);
    const button = screen.getByRole("button", { name: "Salvar" });
    expect(button).not.toHaveAttribute("aria-busy");
    expect(button.querySelector(".fb-ui-spinner")).toBeNull();
    await userEvent.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("desabilitado não chama o manipulador", async () => {
    const onClick = vi.fn();
    render(
      <Button disabled onClick={onClick}>
        Aula lotada
      </Button>,
    );
    await userEvent.click(screen.getByRole("button", { name: "Aula lotada" }));
    expect(onClick).not.toHaveBeenCalled();
  });

  it("repassa className extra e atributos nativos", () => {
    render(
      <Button className="extra" type="submit" form="f">
        Enviar
      </Button>,
    );
    const button = screen.getByRole("button", { name: "Enviar" });
    expect(button).toHaveClass("fb-ui-btn", "extra");
    expect(button).toHaveAttribute("type", "submit");
  });
});

describe("Field", () => {
  it("liga o rótulo ao campo e à ajuda por aria-describedby", () => {
    render(<Field label="Nome" help="Como devemos te chamar" />);
    const input = screen.getByLabelText("Nome");
    expect(input).toHaveClass("fb-ui-input");
    expect(input).not.toHaveAttribute("aria-invalid");
    expect(input).toHaveAccessibleDescription("Como devemos te chamar");
  });

  it("erro: aria-invalid, mensagem anunciada (role=alert) e descrita pelo campo", () => {
    render(<Field label="Telefone" defaultValue="(31) 9999" error="Telefone incompleto." help="Com DDD" />);
    const input = screen.getByLabelText("Telefone");
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input).toHaveAccessibleDescription("Telefone incompleto.");
    const message = screen.getByRole("alert");
    expect(message).toHaveTextContent("Telefone incompleto.");
    expect(message).toHaveClass("fb-ui-help", "fb-ui-help--err");
    // A ajuda comum cede lugar ao erro: uma só mensagem por campo.
    expect(screen.queryByText("Com DDD")).toBeNull();
  });

  it("sucesso: mensagem de apoio verde, sem aria-invalid", () => {
    render(<Field label="CPF" success="Formato válido." />);
    const input = screen.getByLabelText("CPF");
    expect(input).not.toHaveAttribute("aria-invalid");
    expect(input).toHaveAccessibleDescription("Formato válido.");
    expect(screen.getByText("Formato válido.")).toHaveClass("fb-ui-help--ok");
    expect(input).toHaveClass("fb-ui-input--ok");
  });

  it("desabilitado é nativo", () => {
    render(<Field label="Plano" defaultValue="Definido pela recepção" disabled help="Desabilitado" />);
    expect(screen.getByLabelText("Plano")).toBeDisabled();
  });

  it("preserva o aria-describedby que o chamador já passou e usa o id informado", () => {
    render(
      <>
        <p id="externo">Texto externo</p>
        <Field label="E-mail" id="email" aria-describedby="externo" help="Ajuda" />
      </>,
    );
    const input = screen.getByLabelText("E-mail");
    expect(input).toHaveAttribute("id", "email");
    expect(input).toHaveAccessibleDescription("Texto externo Ajuda");
  });

  it("dois campos têm ids diferentes", () => {
    render(
      <>
        <Field label="A" />
        <Field label="B" />
      </>,
    );
    expect(screen.getByLabelText("A").id).not.toBe(screen.getByLabelText("B").id);
  });

  it("aceita digitar", async () => {
    render(<Field label="Nome" />);
    const input = screen.getByLabelText("Nome");
    await userEvent.type(input, "Ana");
    expect(input).toHaveValue("Ana");
  });
});

describe("Card", () => {
  it("padrão e selecionado (borda de marca, marcado com data-selected)", () => {
    const { rerender } = render(<Card data-testid="card">Plano</Card>);
    expect(screen.getByTestId("card")).toHaveClass("fb-ui-card");
    expect(screen.getByTestId("card")).not.toHaveClass("fb-ui-card--selected");
    rerender(
      <Card data-testid="card" selected>
        Plano
      </Card>,
    );
    expect(screen.getByTestId("card")).toHaveClass("fb-ui-card", "fb-ui-card--selected");
  });

  it("plano e destaque são modificadores; o elemento é configurável", () => {
    render(
      <Card as="article" flat data-testid="card">
        x
      </Card>,
    );
    const card = screen.getByTestId("card");
    expect(card.tagName).toBe("ARTICLE");
    expect(card).toHaveClass("fb-ui-card--flat");
  });
});

describe("Badge", () => {
  it.each(["neutral", "brand", "solid", "ok", "warn", "err"] as const)("tom %s", (tone) => {
    render(<Badge tone={tone}>Texto</Badge>);
    expect(screen.getByText("Texto")).toHaveClass("fb-ui-badge", `fb-ui-badge--${tone}`);
  });

  it("o tom padrão é neutro e o ponto é decorativo", () => {
    render(<Badge dot>Reservada</Badge>);
    const badge = screen.getByText("Reservada");
    expect(badge).toHaveClass("fb-ui-badge--neutral");
    expect(badge.querySelector(".fb-ui-badge__dot")).toHaveAttribute("aria-hidden", "true");
  });
});

describe("Chip (de dia, com contador)", () => {
  it("expõe aria-pressed, o rótulo e o número do dia", () => {
    render(<Chip label="Ter" value="10" pressed />);
    const chip = screen.getByRole("button", { name: "Ter 10" });
    expect(chip).toHaveAttribute("aria-pressed", "true");
    expect(chip).toHaveAttribute("type", "button");
    expect(chip).toHaveClass("fb-ui-chip");
  });

  it("não marcado: aria-pressed=false, e o clique chama o manipulador", async () => {
    const onClick = vi.fn();
    render(<Chip label="Qua" value="11" pressed={false} onClick={onClick} />);
    const chip = screen.getByRole("button", { name: "Qua 11" });
    expect(chip).toHaveAttribute("aria-pressed", "false");
    await userEvent.click(chip);
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});

describe("Pill (de filtro)", () => {
  it("expõe aria-pressed e alterna", async () => {
    function Filter() {
      const [on, setOn] = useState(false);
      return (
        <Pill pressed={on} onClick={() => setOn(!on)}>
          Funcional
        </Pill>
      );
    }
    render(<Filter />);
    const pill = screen.getByRole("button", { name: "Funcional" });
    expect(pill).toHaveClass("fb-ui-pill");
    expect(pill).toHaveAttribute("aria-pressed", "false");
    await userEvent.click(pill);
    expect(pill).toHaveAttribute("aria-pressed", "true");
  });
});

describe("Segmented (controle de período)", () => {
  const options = [
    { value: "next", label: "Próximas" },
    { value: "history", label: "Histórico" },
  ];

  it("é um grupo rotulado, com um botão por opção e aria-pressed na ativa", () => {
    render(<Segmented label="Período" options={options} value="next" onChange={() => {}} />);
    const group = screen.getByRole("group", { name: "Período" });
    expect(group).toHaveClass("fb-ui-segmented");
    expect(screen.getByRole("button", { name: "Próximas" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Histórico" })).toHaveAttribute("aria-pressed", "false");
  });

  it("clicar numa opção avisa o valor escolhido; clicar na ativa não repete", async () => {
    const onChange = vi.fn();
    render(<Segmented label="Período" options={options} value="next" onChange={onChange} />);
    await userEvent.click(screen.getByRole("button", { name: "Próximas" }));
    expect(onChange).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Histórico" }));
    expect(onChange).toHaveBeenCalledWith("history");
  });
});
