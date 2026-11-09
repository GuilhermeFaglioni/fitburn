import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { AppShell } from "../src/components/AppShell";
import { ClientLayout } from "../src/components/ClientLayout";

/**
 * Casca do cliente (D-038, #156): cabeçalho com marca e botão de tema, lateral no desktop e barra inferior de 5
 * itens (Início, Agenda, FitPoints, Treino, Perfil) com a página atual em aria-current.
 */
const TAB_LABELS = ["Início", "Agenda", "FitPoints", "Treino", "Perfil"];

function renderAt(path: string, withShell = true) {
  const routes = (
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route element={<ClientLayout />}>
          <Route path="/" element={<h1>Início (tela)</h1>} />
          <Route path="/agenda" element={<h1>Agenda (tela)</h1>} />
          <Route path="/fitpoints" element={<h1>FitPoints (tela)</h1>} />
          <Route path="/ficha-treino" element={<h1>Ficha (tela)</h1>} />
          <Route path="/perfil" element={<h1>Perfil (tela)</h1>} />
        </Route>
      </Routes>
    </MemoryRouter>
  );
  return render(withShell ? <AppShell>{routes}</AppShell> : routes);
}

const tabbar = () => screen.getByRole("navigation", { name: "Navegação inferior" });

describe("barra inferior do cliente", () => {
  it("tem os 5 itens, com FitPoints, na ordem do design", () => {
    renderAt("/");

    const links = within(tabbar()).getAllByRole("link");
    expect(links.map((link) => link.textContent)).toEqual(TAB_LABELS);
    expect(links.map((link) => link.getAttribute("href"))).toEqual([
      "/",
      "/agenda",
      "/fitpoints",
      "/ficha-treino",
      "/perfil",
    ]);
  });

  it.each([
    ["/", "Início"],
    ["/agenda", "Agenda"],
    ["/fitpoints", "FitPoints"],
    ["/ficha-treino", "Treino"],
    ["/perfil", "Perfil"],
  ])("em %s só o item %s é a página atual (aria-current)", (path, label) => {
    renderAt(path);

    const current = within(tabbar())
      .getAllByRole("link")
      .filter((link) => link.getAttribute("aria-current") === "page");
    expect(current.map((link) => link.textContent)).toEqual([label]);
  });

  it("o Início não fica marcado nas outras telas (rota exata)", () => {
    renderAt("/agenda");

    expect(within(tabbar()).getByRole("link", { name: "Início" })).not.toHaveAttribute(
      "aria-current",
    );
  });

  it("trocar de tela move o aria-current e leva o foco ao conteúdo", async () => {
    const user = userEvent.setup();
    renderAt("/");

    await user.click(within(tabbar()).getByRole("link", { name: "FitPoints" }));

    expect(await screen.findByRole("heading", { name: "FitPoints (tela)" })).toBeInTheDocument();
    expect(within(tabbar()).getByRole("link", { name: "FitPoints" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(within(tabbar()).getByRole("link", { name: "Início" })).not.toHaveAttribute(
      "aria-current",
    );
    expect(screen.getByRole("main")).toHaveFocus();
  });

  it("os ícones são decorativos: o nome do link vem só do rótulo", () => {
    renderAt("/");

    for (const label of TAB_LABELS) {
      expect(within(tabbar()).getByRole("link", { name: label })).toBeInTheDocument();
    }
    expect(tabbar().querySelectorAll("svg[aria-hidden='true']")).toHaveLength(5);
  });
});

describe("navegação lateral do cliente (desktop)", () => {
  it("lista os mesmos 5 destinos, com 'Ficha de treino' por extenso, e marca a atual", () => {
    renderAt("/agenda");

    const side = screen.getByRole("navigation", { name: "Navegação principal" });
    const links = within(side)
      .getAllByRole("link")
      .filter((link) => link.closest("[aria-label='Documentos legais']") === null);
    expect(links.map((link) => link.textContent)).toEqual([
      "Início",
      "Agenda",
      "FitPoints",
      "Ficha de treino",
      "Perfil",
    ]);
    expect(within(side).getByRole("link", { name: "Agenda" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });
});

describe("cabeçalho e botão de tema", () => {
  it("o botão de tema fica no cabeçalho da casca, junto da marca", () => {
    renderAt("/");

    const header = screen.getByRole("banner");
    expect(within(header).getByText("FITBURN")).toBeInTheDocument();
    expect(within(header).getByRole("button", { name: /^Tema (claro|escuro)/ })).toBeInTheDocument();
  });

  it("dentro do AppShell há um só botão de tema (o fixo sai quando a casca o hospeda)", () => {
    renderAt("/");

    expect(screen.getAllByRole("button", { name: /^Tema (claro|escuro)/ })).toHaveLength(1);
    expect(document.querySelector(".fb-theme-toggle--inline")).not.toBeNull();
    expect(document.querySelectorAll(".fb-theme-toggle:not(.fb-theme-toggle--inline)")).toHaveLength(
      0,
    );
  });

  it("fora do cliente (ex.: login) o botão fixo continua no AppShell", () => {
    render(
      <AppShell>
        <p>Login</p>
      </AppShell>,
    );

    expect(screen.getAllByRole("button", { name: /^Tema (claro|escuro)/ })).toHaveLength(1);
    expect(document.querySelector(".fb-theme-toggle--inline")).toBeNull();
  });

  it("ao sair da casca do cliente o botão fixo volta", () => {
    const { unmount } = render(
      <AppShell>
        <MemoryRouter>
          <Routes>
            <Route element={<ClientLayout />}>
              <Route path="/" element={<p>Início</p>} />
            </Route>
          </Routes>
        </MemoryRouter>
      </AppShell>,
    );
    expect(document.querySelector(".fb-theme-toggle--inline")).not.toBeNull();
    unmount();
    // Reexibe só o AppShell: sem a casca do cliente montada, o botão fixo aparece.
    render(
      <AppShell>
        <p>Outra tela</p>
      </AppShell>,
    );
    expect(document.querySelector(".fb-theme-toggle--inline")).toBeNull();
  });

  it("o botão alterna o tema e o rótulo reflete o estado", async () => {
    const user = userEvent.setup();
    renderAt("/");

    const button = screen.getByRole("button", { name: /^Tema (claro|escuro)/ });
    const before = button.getAttribute("aria-label");
    await user.click(button);

    expect(button.getAttribute("aria-label")).not.toBe(before);
    expect(document.documentElement.dataset.theme).toMatch(/^(light|dark)$/);
  });
});
