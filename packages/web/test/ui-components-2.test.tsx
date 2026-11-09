import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { MemoryRouter } from "react-router-dom";
import { Accordion } from "../src/components/ui/Accordion";
import { BottomNav, type BottomNavItem } from "../src/components/ui/BottomNav";
import { Dialog } from "../src/components/ui/Dialog";
import { EmptyState, ErrorState, LoadingState, OfflineState } from "../src/components/ui/States";
import { Table } from "../src/components/ui/Table";

/**
 * Componentes base II (#156, PR 4): tabela, acordeão, diálogo, estados e barra inferior.
 * Cobre papéis ARIA, foco e teclado; "só tokens" e alvo de toque estão em ui-components-2-css.test.ts.
 */

describe("Table", () => {
  interface Row {
    id: string;
    name: string;
    slots: string;
  }
  const rows: Row[] = [
    { id: "a", name: "Funcional", slots: "7/8" },
    { id: "b", name: "Mobilidade", slots: "5/8" },
  ];
  const columns = [
    { key: "name", header: "Aula", cell: (row: Row) => row.name },
    { key: "slots", header: "Ocupação", cell: (row: Row) => row.slots },
    { key: "actions", header: "Ações", actions: true, cell: (row: Row) => <button type="button">Editar {row.name}</button> },
  ];

  it("renderiza cabeçalho com scope=col, uma linha por item e a coluna de ações", () => {
    render(<Table label="Aulas" columns={columns} rows={rows} rowKey={(row) => row.id} />);
    const table = screen.getByRole("table", { name: "Aulas" });
    expect(table).toHaveClass("fb-ui-table");
    const headers = within(table).getAllByRole("columnheader");
    expect(headers.map((h) => h.textContent)).toEqual(["Aula", "Ocupação", "Ações"]);
    for (const header of headers) expect(header).toHaveAttribute("scope", "col");
    expect(within(table).getAllByRole("row")).toHaveLength(3);
    expect(screen.getByRole("button", { name: "Editar Funcional" }).closest("td")).toHaveClass("fb-ui-table__actions");
    expect(headers[2]).toHaveClass("fb-ui-table__actions");
  });

  it("a rolagem horizontal fica num contêiner focável e rotulado", () => {
    render(<Table label="Aulas" columns={columns} rows={rows} rowKey={(row) => row.id} />);
    const wrap = screen.getByRole("region", { name: "Aulas" });
    expect(wrap).toHaveClass("fb-ui-table-wrap");
    expect(wrap).toHaveAttribute("tabindex", "0");
    expect(wrap).toContainElement(screen.getByRole("table"));
  });

  it("sem linhas, mostra o estado vazio dentro da tabela", () => {
    render(<Table label="Aulas" columns={columns} rows={[]} rowKey={(row) => row.id} empty="Nenhuma aula." />);
    expect(screen.getByRole("cell", { name: "Nenhuma aula." })).toHaveAttribute("colspan", "3");
  });
});

describe("Accordion", () => {
  const items = [
    { id: "cancel", title: "Posso cancelar uma reserva?", content: "Sim, até o prazo.", defaultOpen: true },
    { id: "points", title: "Como ganho FitPoints?", content: "Cada presença soma pontos." },
  ];

  it("usa details/summary e abre os itens marcados como defaultOpen", () => {
    const { container } = render(<Accordion items={items} />);
    const details = container.querySelectorAll("details.fb-ui-accordion__item");
    expect(details).toHaveLength(2);
    expect(details[0]).toHaveAttribute("open");
    expect(details[1]).not.toHaveAttribute("open");
    expect(details[0].querySelector("summary")).toHaveTextContent("Posso cancelar uma reserva?");
  });

  it("o indicador é decorativo (aria-hidden)", () => {
    const { container } = render(<Accordion items={items} />);
    const indicators = container.querySelectorAll("summary > .fb-ui-accordion__icon");
    expect(indicators).toHaveLength(2);
    for (const indicator of indicators) expect(indicator).toHaveAttribute("aria-hidden", "true");
  });

  it("clicar no título abre e fecha o item", async () => {
    const user = userEvent.setup();
    const { container } = render(<Accordion items={items} />);
    const second = container.querySelectorAll("details")[1];
    await user.click(screen.getByText("Como ganho FitPoints?"));
    expect(second).toHaveAttribute("open");
    await user.click(screen.getByText("Como ganho FitPoints?"));
    expect(second).not.toHaveAttribute("open");
  });
});

describe("Dialog", () => {
  function Harness({ withField = false }: { withField?: boolean }) {
    const [open, setOpen] = useState(false);
    return (
      <>
        <button type="button" onClick={() => setOpen(true)}>
          Abrir
        </button>
        {open && (
          <Dialog
            title="Cancelar reserva?"
            description="A vaga fica livre."
            onClose={() => setOpen(false)}
            actions={
              <>
                <button type="button" onClick={() => setOpen(false)}>
                  Manter
                </button>
                <button type="button">Cancelar reserva</button>
              </>
            }
          >
            {withField && <input aria-label="Motivo" />}
          </Dialog>
        )}
      </>
    );
  }

  it("tem role=dialog, aria-modal, aria-labelledby pelo título e aria-describedby pela descrição", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole("button", { name: "Abrir" }));
    const dialog = screen.getByRole("dialog", { name: "Cancelar reserva?" });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).toHaveAccessibleDescription("A vaga fica livre.");
    expect(dialog).toHaveClass("fb-ui-dialog");
    expect(dialog.parentElement).toHaveClass("fb-ui-dialog-backdrop");
  });

  it("o foco inicial vai para o primeiro controle (botão, se não houver campo)", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole("button", { name: "Abrir" }));
    expect(screen.getByRole("button", { name: "Manter" })).toHaveFocus();
  });

  it("o foco inicial vai para o primeiro controle mesmo quando há campo", async () => {
    const user = userEvent.setup();
    render(<Harness withField />);
    await user.click(screen.getByRole("button", { name: "Abrir" }));
    expect(screen.getByRole("textbox", { name: "Motivo" })).toHaveFocus();
  });

  it("Escape fecha e o foco volta a quem abriu", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const opener = screen.getByRole("button", { name: "Abrir" });
    await user.click(opener);
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(opener).toHaveFocus();
  });

  it("fechar por um botão também devolve o foco, e o Tab fica preso no diálogo", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const opener = screen.getByRole("button", { name: "Abrir" });
    await user.click(opener);
    await user.tab();
    expect(screen.getByRole("button", { name: "Cancelar reserva" })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole("button", { name: "Manter" })).toHaveFocus();
    await user.click(screen.getByRole("button", { name: "Manter" }));
    expect(opener).toHaveFocus();
  });

  it("clicar no fundo escurecido fecha", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole("button", { name: "Abrir" }));
    await user.click(screen.getByRole("dialog").parentElement!);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});

describe("estados", () => {
  it("EmptyState: título, descrição e ação", () => {
    render(<EmptyState title="Nenhuma aula" description="Volte mais tarde." action={<button type="button">Ver agenda</button>} />);
    const state = screen.getByText("Nenhuma aula").closest("[data-state]");
    expect(state).toHaveAttribute("data-state", "empty");
    expect(state).toHaveClass("fb-ui-state", "fb-ui-state--empty");
    expect(screen.getByText("Volte mais tarde.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Ver agenda" })).toBeInTheDocument();
  });

  it("ErrorState: anuncia como alerta e oferece tentar de novo só com onRetry", async () => {
    const onRetry = vi.fn();
    const user = userEvent.setup();
    const { rerender } = render(<ErrorState description="Não foi possível carregar." onRetry={onRetry} />);
    expect(screen.getByRole("alert")).toHaveTextContent("Algo deu errado");
    expect(screen.getByRole("alert")).toHaveTextContent("Não foi possível carregar.");
    await user.click(screen.getByRole("button", { name: "Tentar novamente" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
    rerender(<ErrorState description="Não foi possível carregar." />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("OfflineState: texto explícito e ícone decorativo, para não depender só de cor", async () => {
    const onRetry = vi.fn();
    const user = userEvent.setup();
    render(<OfflineState onRetry={onRetry} />);
    const state = screen.getByRole("status");
    expect(state).toHaveAttribute("data-state", "offline");
    expect(state).toHaveTextContent("Sem conexão");
    expect(state.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
    await user.click(screen.getByRole("button", { name: "Verificar conexão" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("LoadingState: status com rótulo e spinner decorativo", () => {
    render(<LoadingState label="Carregando a agenda…" />);
    const state = screen.getByRole("status");
    expect(state).toHaveTextContent("Carregando a agenda…");
    expect(state).toHaveAttribute("aria-busy", "true");
    expect(state.querySelector(".fb-ui-state__spinner")).toHaveAttribute("aria-hidden", "true");
  });

  it("LoadingState usa 'Carregando…' por padrão", () => {
    render(<LoadingState />);
    expect(screen.getByRole("status")).toHaveTextContent("Carregando…");
  });
});

describe("BottomNav", () => {
  const icon = (
    <svg viewBox="0 0 24 24">
      <path d="M3 11l9-8 9 8" />
    </svg>
  );
  const items: BottomNavItem[] = [
    { to: "/", label: "Início", icon, end: true },
    { to: "/agenda", label: "Agenda", icon },
    { to: "/fitpoints", label: "FitPoints", icon },
    { to: "/treino", label: "Treino", icon },
    { to: "/perfil", label: "Perfil", icon },
  ];

  it("é um nav rotulado com um link por item recebido por prop (5 aqui, sem número fixo)", () => {
    render(
      <MemoryRouter initialEntries={["/"]}>
        <BottomNav label="Navegação principal" items={items} />
      </MemoryRouter>,
    );
    const nav = screen.getByRole("navigation", { name: "Navegação principal" });
    expect(within(nav).getAllByRole("link").map((a) => a.textContent)).toEqual(["Início", "Agenda", "FitPoints", "Treino", "Perfil"]);
  });

  it("aceita outra quantidade de itens", () => {
    render(
      <MemoryRouter>
        <BottomNav label="Menu" items={items.slice(0, 3)} />
      </MemoryRouter>,
    );
    expect(screen.getAllByRole("link")).toHaveLength(3);
  });

  it("marca só a página atual com aria-current=page", () => {
    render(
      <MemoryRouter initialEntries={["/agenda"]}>
        <BottomNav label="Navegação principal" items={items} />
      </MemoryRouter>,
    );
    expect(screen.getByRole("link", { name: "Agenda" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Início" })).not.toHaveAttribute("aria-current");
    expect(document.querySelectorAll('[aria-current="page"]')).toHaveLength(1);
  });

  it("os ícones ficam escondidos dos leitores de tela", () => {
    render(
      <MemoryRouter>
        <BottomNav label="Menu" items={items} />
      </MemoryRouter>,
    );
    for (const link of screen.getAllByRole("link")) {
      expect(link.querySelector(".fb-ui-bottom-nav__icon")).toHaveAttribute("aria-hidden", "true");
    }
  });
});

describe("Dialog em variante drawer (gaveta)", () => {
  function DrawerHarness() {
    const [open, setOpen] = useState(false);
    return (
      <>
        <button type="button" onClick={() => setOpen(true)}>
          Abrir menu
        </button>
        {open && (
          <Dialog
            id="gaveta"
            variant="drawer"
            title="Menu"
            onClose={() => setOpen(false)}
            topBar={
              <button type="button" onClick={() => setOpen(false)}>
                Fechar
              </button>
            }
            footer={<button type="button">Sair</button>}
          >
            <a href="/clientes">Clientes</a>
          </Dialog>
        )}
      </>
    );
  }

  it("é um diálogo modal nomeado, com o id pedido e as classes da gaveta (não as da folha)", async () => {
    const user = userEvent.setup();
    render(<DrawerHarness />);
    await user.click(screen.getByRole("button", { name: "Abrir menu" }));

    const dialog = screen.getByRole("dialog", { name: "Menu" });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).toHaveAttribute("id", "gaveta");
    expect(dialog).toHaveClass("fb-ui-dialog--drawer");
    expect(dialog).not.toHaveClass("fb-ui-dialog--sheet");
    expect(dialog.parentElement).toHaveClass("fb-ui-dialog-backdrop--drawer");
    expect(within(dialog).getByRole("link", { name: "Clientes" })).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Sair" })).toBeInTheDocument();
  });

  it("foco entra no primeiro controle (a barra superior), Esc fecha e o foco volta a quem abriu", async () => {
    const user = userEvent.setup();
    render(<DrawerHarness />);
    const opener = screen.getByRole("button", { name: "Abrir menu" });
    await user.click(opener);
    expect(screen.getByRole("button", { name: "Fechar" })).toHaveFocus();

    await user.keyboard("{Escape}");

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(opener).toHaveFocus();
  });
});
