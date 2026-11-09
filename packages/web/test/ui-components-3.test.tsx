import { render, screen, within } from "@testing-library/react";
import { Button } from "../src/components/ui/Button";
import { DescriptionList } from "../src/components/ui/DescriptionList";
import { Field } from "../src/components/ui/Field";
import { PageHeader } from "../src/components/ui/PageHeader";
import { Select } from "../src/components/ui/Select";
import { Table } from "../src/components/ui/Table";
import { Toolbar } from "../src/components/ui/Toolbar";

/** Peças que o lote A do admin (#156, PR 13) acrescentou à base: Select, PageHeader, Toolbar, DescriptionList. */

describe("Select", () => {
  it("liga o rótulo ao select e a ajuda por aria-describedby", () => {
    render(
      <Select label="Perfil" help="Escolha um perfil.">
        <option value="a">A</option>
      </Select>,
    );

    const select = screen.getByRole("combobox", { name: "Perfil" });
    expect(select).toHaveAccessibleDescription("Escolha um perfil.");
    expect(select).not.toHaveAttribute("aria-invalid");
  });

  it("erro: aria-invalid, mensagem anunciada e ligada ao select (a ajuda some)", () => {
    render(
      <Select label="Perfil" help="Escolha um perfil." error="Escolha um perfil válido.">
        <option value="a">A</option>
      </Select>,
    );

    const select = screen.getByRole("combobox", { name: "Perfil" });
    expect(select).toHaveAttribute("aria-invalid", "true");
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("Escolha um perfil válido.");
    expect(select.getAttribute("aria-describedby")).toBe(alert.id);
    expect(screen.queryByText("Escolha um perfil.")).not.toBeInTheDocument();
  });

  it("hideLabel: o rótulo existe para leitor de tela, mas não aparece", () => {
    render(
      <Select label="Status" hideLabel>
        <option value="">Todos</option>
      </Select>,
    );

    expect(screen.getByRole("combobox", { name: "Status" })).toBeInTheDocument();
    expect(screen.getByText("Status")).toHaveClass("fb-ui-sr-only");
  });

  it("repassa disabled, value e onChange ao select nativo", () => {
    render(
      <Select label="Escopo" value="b" disabled onChange={() => undefined}>
        <option value="a">A</option>
        <option value="b">B</option>
      </Select>,
    );

    const select = screen.getByRole("combobox", { name: "Escopo" });
    expect(select).toBeDisabled();
    expect(select).toHaveValue("b");
  });
});

describe("Field: hideLabel", () => {
  it("mantém o nome acessível e esconde só o rótulo visual", () => {
    render(<Field label="Buscar por nome" hideLabel placeholder="Buscar por nome" />);

    expect(screen.getByRole("textbox", { name: "Buscar por nome" })).toBeInTheDocument();
    expect(screen.getByText("Buscar por nome", { selector: "label" })).toHaveClass("fb-ui-sr-only");
  });

  it("sem hideLabel o rótulo é visível", () => {
    render(<Field label="Nome" />);

    expect(screen.getByText("Nome")).not.toHaveClass("fb-ui-sr-only");
  });
});

describe("PageHeader", () => {
  it("renderiza o kicker e o título como h1, com as ações ao lado", () => {
    render(
      <PageHeader
        kicker="Clientes"
        title="Clientes"
        actions={<button type="button">+ Novo</button>}
      />,
    );

    expect(screen.getByRole("heading", { level: 1, name: "Clientes" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "+ Novo" })).toBeInTheDocument();
  });

  it("o selo fica fora do h1: o nome do título é só o título", () => {
    render(<PageHeader title="Cliente Exemplo" badge={<span>ATIVO</span>} />);

    const title = screen.getByRole("heading", { level: 1 });
    expect(title).toHaveAccessibleName("Cliente Exemplo");
    expect(title).not.toContainElement(screen.getByText("ATIVO"));
  });

  it("a trilha é uma navegação rotulada e só aparece quando informada", () => {
    const { rerender } = render(
      <PageHeader title="Novo cliente" crumb={<>Clientes / Novo cliente</>} />,
    );
    expect(screen.getByRole("navigation", { name: "Trilha de navegação" })).toHaveTextContent(
      "Clientes / Novo cliente",
    );

    rerender(<PageHeader title="Novo cliente" />);
    expect(screen.queryByRole("navigation")).not.toBeInTheDocument();
  });
});

describe("Toolbar e DescriptionList", () => {
  it("Toolbar agrupa os filtros e repassa atributos", () => {
    render(
      <Toolbar aria-label="Filtros">
        <button type="button">Um</button>
      </Toolbar>,
    );

    expect(
      within(screen.getByLabelText("Filtros")).getByRole("button", { name: "Um" }),
    ).toBeInTheDocument();
  });

  it("DescriptionList usa dl com dt e dd, um par por item", () => {
    const { container } = render(
      <DescriptionList
        items={[
          { term: "E-mail", detail: "cliente1@exemplo.com" },
          { term: "Telefone", detail: "—" },
        ]}
      />,
    );

    expect(container.querySelectorAll("dl > div > dt")).toHaveLength(2);
    expect(screen.getByText("E-mail").nextElementSibling).toHaveTextContent("cliente1@exemplo.com");
  });
});

describe("Button ghost-danger e Table com className de coluna", () => {
  it("ghost-danger leva a classe própria e continua um botão nomeado", () => {
    render(<Button variant="ghost-danger">Excluir</Button>);

    expect(screen.getByRole("button", { name: "Excluir" })).toHaveClass(
      "fb-ui-btn",
      "fb-ui-btn--ghost-danger",
    );
  });

  it("a className da coluna vai ao cabeçalho e às células", () => {
    render(
      <Table
        label="Pessoas"
        rowKey={(row) => row.id}
        rows={[{ id: "1", name: "Pessoa Exemplo" }]}
        columns={[
          { key: "name", header: "Nome", className: "fb-ui-table__name", cell: (row) => row.name },
        ]}
      />,
    );

    expect(screen.getByRole("columnheader", { name: "Nome" })).toHaveClass("fb-ui-table__name");
    expect(screen.getByRole("cell", { name: "Pessoa Exemplo" })).toHaveClass("fb-ui-table__name");
  });
});
