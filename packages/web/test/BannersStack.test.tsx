import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { AppShell } from "../src/components/AppShell";
import { AuthProvider } from "../src/lib/auth/AuthContext";
import { setBrowserOnline } from "./connectivity-helpers";
import "../src/styles/connectivity.css";

const sw = vi.hoisted(() => ({ updateServiceWorker: vi.fn() }));

vi.mock("virtual:pwa-register/react", () => ({
  useRegisterSW: () => ({
    needRefresh: [true, () => undefined],
    offlineReady: [false, () => undefined],
    updateServiceWorker: sw.updateServiceWorker,
  }),
}));

function position(element: HTMLElement): string {
  return window.getComputedStyle(element).position;
}

describe("Avisos globais empilhados", () => {
  function renderShell() {
    return render(
      <AuthProvider>
        <MemoryRouter>
          <AppShell>
            <p>conteúdo</p>
          </AppShell>
        </MemoryRouter>
      </AuthProvider>,
    );
  }

  it("sem conexão e nova versão ao mesmo tempo ficam empilhados num único contêiner fixo no topo, sem se sobrepor", () => {
    renderShell();
    act(() => setBrowserOnline(false));

    const offline = screen.getByRole("alert");
    const update = screen.getByRole("status");
    const stack = offline.parentElement as HTMLElement;

    // Um único contêiner sticky com os dois avisos em fluxo normal: um abaixo do outro.
    expect(update.parentElement).toBe(stack);
    expect(position(stack)).toBe("sticky");
    expect(position(offline)).not.toMatch(/sticky|fixed|absolute/);
    expect(position(update)).not.toMatch(/sticky|fixed|absolute/);
    expect(offline.compareDocumentPosition(update) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("os botões 'Verificar conexão' e 'Recarregar' ficam acessíveis quando os dois avisos aparecem juntos", async () => {
    renderShell();
    act(() => setBrowserOnline(false));
    const user = userEvent.setup();

    const reload = screen.getByRole("button", { name: "Recarregar" });
    expect(screen.getByRole("button", { name: "Verificar conexão" })).toBeVisible();
    expect(reload).toBeVisible();

    await user.click(reload);

    expect(sw.updateServiceWorker).toHaveBeenCalledWith(true);
  });
});
