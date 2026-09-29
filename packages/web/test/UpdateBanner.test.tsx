import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { UpdateBanner } from "../src/components/UpdateBanner";

// O registro real do service worker só existe no navegador; aqui simulamos o
// que o vite-plugin-pwa entrega ao app: o estado "há versão nova esperando" e
// a função que ativa essa versão.
const sw = vi.hoisted(() => ({
  needRefresh: false,
  listeners: new Set<() => void>(),
  updateServiceWorker: vi.fn(),
  onRegisteredSW: undefined as
    | undefined
    | ((url: string | undefined, registration: { update: () => Promise<void> } | undefined) => void),
}));

vi.mock("virtual:pwa-register/react", async () => {
  const { useState, useEffect } = await import("react");
  return {
    useRegisterSW: (options?: { onRegisteredSW?: typeof sw.onRegisteredSW }) => {
      sw.onRegisteredSW = options?.onRegisteredSW;
      const [needRefresh, setNeedRefresh] = useState(sw.needRefresh);
      useEffect(() => {
        const listener = () => setNeedRefresh(sw.needRefresh);
        sw.listeners.add(listener);
        return () => void sw.listeners.delete(listener);
      }, []);
      return {
        needRefresh: [needRefresh, setNeedRefresh],
        offlineReady: [false, () => undefined],
        updateServiceWorker: sw.updateServiceWorker,
      };
    },
  };
});

function publishNewVersion() {
  sw.needRefresh = true;
  sw.listeners.forEach((listener) => listener());
}

describe("UpdateBanner", () => {
  beforeEach(() => {
    sw.needRefresh = false;
    sw.updateServiceWorker.mockReset();
  });

  it("não mostra nada enquanto o app está na versão mais recente", () => {
    render(<UpdateBanner />);

    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("avisa que há uma nova versão quando o service worker novo fica pronto", () => {
    render(<UpdateBanner />);

    act(() => publishNewVersion());

    expect(screen.getByRole("status")).toHaveTextContent("Nova versão disponível");
    expect(screen.getByRole("button", { name: "Recarregar" })).toBeInTheDocument();
  });

  it("recarregar ativa a nova versão e recarrega a página", async () => {
    render(<UpdateBanner />);
    act(() => publishNewVersion());

    await userEvent.setup().click(screen.getByRole("button", { name: "Recarregar" }));

    expect(sw.updateServiceWorker).toHaveBeenCalledWith(true);
  });

  it("verifica periodicamente se saiu uma versão nova, sem depender de o usuário recarregar a aba", () => {
    vi.useFakeTimers();
    try {
      render(<UpdateBanner />);
      const registration = { update: vi.fn().mockResolvedValue(undefined) };

      act(() => sw.onRegisteredSW?.("/sw.js", registration));
      expect(registration.update).not.toHaveBeenCalled();
      act(() => {
        vi.advanceTimersByTime(60 * 60 * 1000);
      });

      expect(registration.update).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });
});
