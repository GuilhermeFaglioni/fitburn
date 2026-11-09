import { readFileSync } from "node:fs";
import { join } from "node:path";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { AppShell } from "../src/components/AppShell";
import { ThemeToggle } from "../src/components/ThemeToggle";
import { AuthProvider } from "../src/lib/auth/AuthContext";
import {
  THEME_COLOR,
  THEME_STORAGE_KEY,
  applyTheme,
  currentTheme,
  readStoredTheme,
} from "../src/lib/theme/theme";

/**
 * Tema claro e escuro (D-038): vale a preferência do sistema; o botão no topo alterna e guarda a escolha em
 * localStorage (chave `fb-theme`). Cobre sistema escuro, sistema claro, preferência manual salva e localStorage
 * indisponível, além do script anti-flash (public/theme-init.js).
 */

type SystemScheme = "light" | "dark";

/** O jsdom não tem matchMedia: cada teste que precisa do sistema o simula. */
function mockSystemScheme(scheme: SystemScheme) {
  const listeners = new Set<() => void>();
  let current = scheme;
  window.matchMedia = ((query: string) => ({
    matches: query === "(prefers-color-scheme: dark)" ? current === "dark" : false,
    media: query,
    addEventListener: (_type: string, listener: () => void) => listeners.add(listener),
    removeEventListener: (_type: string, listener: () => void) => listeners.delete(listener),
  })) as unknown as typeof window.matchMedia;
  return {
    change(next: SystemScheme) {
      current = next;
      listeners.forEach((listener) => listener());
    },
  };
}

const root = document.documentElement;

function makeMetas() {
  document.head.innerHTML =
    '<meta name="theme-color" content="#FFFFFF" media="(prefers-color-scheme: light)">' +
    '<meta name="theme-color" content="#0A0A0A" media="(prefers-color-scheme: dark)">';
}

beforeEach(() => {
  makeMetas();
});

afterEach(() => {
  root.removeAttribute("data-theme");
  window.localStorage.clear();
  // @ts-expect-error o jsdom não define matchMedia: volta ao estado original.
  delete window.matchMedia;
  vi.restoreAllMocks();
  document.head.innerHTML = "";
});

describe("ThemeToggle: sistema escuro, sem preferência salva", () => {
  it("mostra o tema escuro e troca para o claro, guardando a escolha", async () => {
    mockSystemScheme("dark");
    render(<ThemeToggle />);

    const button = screen.getByRole("button", { name: /tema escuro/i });
    expect(button).toHaveTextContent("Escuro");
    expect(root).not.toHaveAttribute("data-theme");

    await userEvent.click(button);

    expect(root).toHaveAttribute("data-theme", "light");
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe("light");
    expect(screen.getByRole("button", { name: /tema claro/i })).toHaveTextContent("Claro");
  });

  it("segue o sistema enquanto nada foi escolhido", () => {
    const system = mockSystemScheme("dark");
    render(<ThemeToggle />);
    expect(screen.getByRole("button")).toHaveTextContent("Escuro");

    act(() => system.change("light"));

    expect(screen.getByRole("button")).toHaveTextContent("Claro");
    expect(root).not.toHaveAttribute("data-theme");
  });

  it("depois de escolher, a mudança do sistema não troca o tema", async () => {
    const system = mockSystemScheme("dark");
    render(<ThemeToggle />);
    await userEvent.click(screen.getByRole("button"));
    expect(root).toHaveAttribute("data-theme", "light");

    act(() => system.change("light"));
    act(() => system.change("dark"));

    expect(root).toHaveAttribute("data-theme", "light");
    expect(screen.getByRole("button")).toHaveTextContent("Claro");
  });
});

describe("ThemeToggle: sistema claro, sem preferência salva", () => {
  it("mostra o tema claro e troca para o escuro, guardando a escolha", async () => {
    mockSystemScheme("light");
    render(<ThemeToggle />);

    const button = screen.getByRole("button", { name: /tema claro/i });
    expect(button).toHaveTextContent("Claro");

    await userEvent.click(button);

    expect(root).toHaveAttribute("data-theme", "dark");
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe("dark");
    expect(screen.getByRole("button", { name: /tema escuro/i })).toHaveTextContent("Escuro");
  });

  it("sem matchMedia (jsdom, navegadores antigos) assume o claro, sem quebrar", () => {
    expect(window.matchMedia).toBeUndefined();
    render(<ThemeToggle />);
    expect(screen.getByRole("button")).toHaveTextContent("Claro");
  });
});

describe("ThemeToggle: preferência manual salva", () => {
  it("a escolha salva vale sobre o sistema e sobrevive a recarregar", async () => {
    mockSystemScheme("light");
    window.localStorage.setItem(THEME_STORAGE_KEY, "dark");

    const first = render(<ThemeToggle />);
    expect(root).toHaveAttribute("data-theme", "dark");
    expect(screen.getByRole("button")).toHaveTextContent("Escuro");

    // "Recarregar": nova página (sem atributo), o localStorage permanece.
    first.unmount();
    root.removeAttribute("data-theme");
    render(<ThemeToggle />);

    expect(root).toHaveAttribute("data-theme", "dark");
    expect(screen.getByRole("button")).toHaveTextContent("Escuro");
  });

  it("valor inválido no localStorage é ignorado e o sistema vale", () => {
    mockSystemScheme("dark");
    window.localStorage.setItem(THEME_STORAGE_KEY, "roxo");

    render(<ThemeToggle />);

    expect(root).not.toHaveAttribute("data-theme");
    expect(screen.getByRole("button")).toHaveTextContent("Escuro");
  });

  it("a escolha atualiza a cor da barra do navegador (theme-color)", async () => {
    mockSystemScheme("dark");
    render(<ThemeToggle />);

    await userEvent.click(screen.getByRole("button"));

    const colors = [...document.querySelectorAll('meta[name="theme-color"]')].map((meta) =>
      meta.getAttribute("content"),
    );
    expect(colors).toEqual([THEME_COLOR.light, THEME_COLOR.light]);
  });
});

describe("ThemeToggle: localStorage indisponível", () => {
  function breakStorage() {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new DOMException("bloqueado", "SecurityError");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("bloqueado", "SecurityError");
    });
  }

  it("não quebra ao montar: vale o sistema", () => {
    mockSystemScheme("dark");
    breakStorage();

    render(<ThemeToggle />);

    expect(screen.getByRole("button")).toHaveTextContent("Escuro");
    expect(readStoredTheme()).toBeNull();
  });

  it("a troca vale para a sessão, mesmo sem conseguir gravar", async () => {
    mockSystemScheme("dark");
    breakStorage();
    render(<ThemeToggle />);

    await userEvent.click(screen.getByRole("button"));
    expect(root).toHaveAttribute("data-theme", "light");
    expect(screen.getByRole("button")).toHaveTextContent("Claro");

    await userEvent.click(screen.getByRole("button"));
    expect(root).toHaveAttribute("data-theme", "dark");
    expect(screen.getByRole("button")).toHaveTextContent("Escuro");
  });
});

describe("lib/theme", () => {
  it("currentTheme: o atributo do <html> vale sobre o sistema", () => {
    mockSystemScheme("dark");
    expect(currentTheme()).toBe("dark");
    applyTheme("light");
    expect(currentTheme()).toBe("light");
  });
});

describe("AppShell", () => {
  it("traz o botão de tema em todas as telas", () => {
    mockSystemScheme("light");
    render(
      <AuthProvider>
        <MemoryRouter>
          <AppShell>
            <p>conteúdo</p>
          </AppShell>
        </MemoryRouter>
      </AuthProvider>,
    );

    expect(screen.getByRole("button", { name: /tema claro/i })).toBeInTheDocument();
  });
});

describe("script anti-flash (public/theme-init.js)", () => {
  const script = readFileSync(join(process.cwd(), "public/theme-init.js"), "utf8");
  const run = () => new Function(script)();

  it("aplica a preferência salva no <html> antes do primeiro desenho", () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, "dark");
    run();
    expect(root).toHaveAttribute("data-theme", "dark");
    expect(
      [...document.querySelectorAll('meta[name="theme-color"]')].map((m) => m.getAttribute("content")),
    ).toEqual([THEME_COLOR.dark, THEME_COLOR.dark]);
  });

  it("sem preferência salva, ou com valor inválido, não aplica nada: vale o sistema", () => {
    run();
    expect(root).not.toHaveAttribute("data-theme");
    window.localStorage.setItem(THEME_STORAGE_KEY, "roxo");
    run();
    expect(root).not.toHaveAttribute("data-theme");
  });

  it("com localStorage indisponível não lança e não aplica nada", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new DOMException("bloqueado", "SecurityError");
    });
    expect(run).not.toThrow();
    expect(root).not.toHaveAttribute("data-theme");
  });

  it("usa a mesma chave e as mesmas cores do módulo do app", () => {
    expect(script).toContain(`"${THEME_STORAGE_KEY}"`);
    expect(script).toContain(`"${THEME_COLOR.light}"`);
    expect(script).toContain(`"${THEME_COLOR.dark}"`);
  });
});
