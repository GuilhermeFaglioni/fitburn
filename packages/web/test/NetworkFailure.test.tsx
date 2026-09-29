import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { OfflineBanner } from "../src/components/OfflineBanner";
import { authFetch } from "../src/lib/auth/authFetch";
import { refreshSession } from "../src/lib/auth/api";
import { setBrowserOnline } from "./connectivity-helpers";
import { server } from "./msw-server";

describe("Falhas de rede alimentam o banner de sem conexão", () => {
  it("uma requisição que falha por rede mostra o banner mesmo com o navegador dizendo online", async () => {
    server.use(http.get("/api/dados", () => HttpResponse.error()));
    render(<OfflineBanner />);

    await act(async () => {
      await authFetch("/api/dados").catch(() => undefined);
    });

    expect(screen.getByRole("alert")).toHaveTextContent("Sem conexão");
  });

  it("um erro HTTP do servidor não é falta de conexão", async () => {
    server.use(
      http.get("/api/dados", () =>
        HttpResponse.json({ code: "INTERNAL_ERROR", message: "Erro." }, { status: 500 }),
      ),
    );
    render(<OfflineBanner />);

    await act(async () => {
      await authFetch("/api/dados");
    });

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("uma resposta bem-sucedida depois da falha derruba o banner", async () => {
    let failing = true;
    server.use(
      http.get("/api/dados", () =>
        failing ? HttpResponse.error() : HttpResponse.json({ ok: true }),
      ),
    );
    render(<OfflineBanner />);
    await act(async () => {
      await authFetch("/api/dados").catch(() => undefined);
    });
    expect(screen.getByRole("alert")).toBeInTheDocument();

    failing = false;
    await act(async () => {
      await authFetch("/api/dados");
    });

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("a falha do refresh de sessão (abrir o app sem rede) também aparece e não lança", async () => {
    server.use(http.post("/api/auth/refresh", () => HttpResponse.error()));
    render(<OfflineBanner />);

    let restored: unknown = "pendente";
    await act(async () => {
      restored = await refreshSession();
    });

    expect(restored).toBeNull();
    expect(screen.getByRole("alert")).toHaveTextContent("Sem conexão");
  });

  it("o evento online do navegador limpa uma falha de rede antiga", async () => {
    server.use(http.get("/api/dados", () => HttpResponse.error()));
    render(<OfflineBanner />);
    await act(async () => {
      await authFetch("/api/dados").catch(() => undefined);
    });
    expect(screen.getByRole("alert")).toBeInTheDocument();

    act(() => setBrowserOnline(true));

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("com falha de rede e navegador online, 'Verificar conexão' testa a API e remove o aviso se ela responde", async () => {
    let apiUp = false;
    server.use(
      http.get("/api/health", () =>
        apiUp ? HttpResponse.json({ status: "ok" }) : HttpResponse.error(),
      ),
      http.get("/api/dados", () => HttpResponse.error()),
    );
    render(<OfflineBanner />);
    await act(async () => {
      await authFetch("/api/dados").catch(() => undefined);
    });
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "Verificar conexão" }));
    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());

    apiUp = true;
    await user.click(screen.getByRole("button", { name: "Verificar conexão" }));

    await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());
  });
});
