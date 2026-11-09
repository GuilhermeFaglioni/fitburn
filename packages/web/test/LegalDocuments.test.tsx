import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { onlineManager } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { LegalDocumentType } from "@fitburn/contracts";
import { AppRoutes } from "../src/App";
import { AuthProvider } from "../src/lib/auth/AuthContext";
import { server } from "./msw-server";
import { http, HttpResponse } from "msw";
import { ClientLayout } from "../src/components/ClientLayout";
import { Route, Routes } from "react-router-dom";

function renderRoute(path: string) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <MemoryRouter initialEntries={[path]}>
          <AppRoutes />
        </MemoryRouter>
      </AuthProvider>
    </QueryClientProvider>,
  );
}

describe("Documentos legais públicos", () => {
  beforeEach(() => {
    server.use(
      http.get("/api/legal-documents/privacy-policy", () =>
        HttpResponse.json({
          type: LegalDocumentType.PRIVACY_POLICY,
          title: "Política de privacidade",
          version: "v1",
          requiresNewManifestation: true,
          content: "CONTEÚDO PROVISÓRIO\n\nTexto de validação.",
        }),
      ),
      http.get("/api/legal-documents/terms-of-use", () =>
        HttpResponse.json({
          type: LegalDocumentType.TERMS_OF_USE,
          title: "Termos de uso",
          version: "v1",
          requiresNewManifestation: true,
          content: "CONTEÚDO PROVISÓRIO\n\nTexto de validação.",
        }),
      ),
    );
  });

  it("renderiza a versão vigente da política sem exigir login", async () => {
    renderRoute("/privacidade");

    expect(
      await screen.findByRole("heading", { name: "Política de privacidade" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Versão v1")).toBeInTheDocument();
    expect(screen.getByText("CONTEÚDO PROVISÓRIO")).toBeInTheDocument();
  });

  it("renderiza a versão vigente dos termos sem exigir login", async () => {
    renderRoute("/termos");

    expect(await screen.findByRole("heading", { name: "Termos de uso" })).toBeInTheDocument();
    expect(screen.getByText("Versão v1")).toBeInTheDocument();
    expect(screen.getByText("Texto de validação.")).toBeInTheDocument();
  });

  it("oferece links para os documentos no login", async () => {
    renderRoute("/login");

    expect(await screen.findByRole("link", { name: "Política de privacidade" })).toHaveAttribute(
      "href",
      "/privacidade",
    );
    expect(screen.getByRole("link", { name: "Termos de uso" })).toHaveAttribute("href", "/termos");
  });

  it("mantém os documentos disponíveis na navegação do cliente", () => {
    render(
      <MemoryRouter initialEntries={["/"]}>
        <Routes>
          <Route element={<ClientLayout />}>
            <Route path="/" element={<p>Início</p>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getAllByRole("link", { name: "Política de privacidade" })).toHaveLength(2);
    expect(screen.getAllByRole("link", { name: "Termos de uso" })).toHaveLength(2);
  });

  it("o botão de voltar tem nome e leva ao login", async () => {
    renderRoute("/privacidade");

    await screen.findByRole("heading", { name: "Política de privacidade" });
    expect(screen.getByRole("link", { name: "Voltar ao login" })).toHaveAttribute("href", "/login");
  });

  it("os títulos seguem a ordem: um h1 com o título do documento, sem nível pulado", async () => {
    renderRoute("/termos");

    await screen.findByRole("heading", { level: 1, name: "Termos de uso" });
    const levels = screen.getAllByRole("heading").map((heading) => Number(heading.tagName[1]));
    expect(levels).toEqual([1]);
    expect(screen.getByRole("main")).toBeInTheDocument();
  });

  it("o texto fica no artigo do documento, parágrafo a parágrafo, sem alteração", async () => {
    renderRoute("/privacidade");

    const article = await screen.findByRole("article", { name: "Política de privacidade" });
    expect(Array.from(article.querySelectorAll("p"), (paragraph) => paragraph.textContent)).toEqual(
      ["CONTEÚDO PROVISÓRIO", "Texto de validação."],
    );
  });

  it("a política aponta para os termos e os termos para a política, pela navegação dos outros documentos", async () => {
    const first = renderRoute("/privacidade");
    await screen.findByRole("heading", { name: "Política de privacidade" });
    let others = screen.getByRole("navigation", { name: "Outros documentos legais" });
    expect(within(others).getByRole("link", { name: "Termos de uso" })).toHaveAttribute(
      "href",
      "/termos",
    );
    expect(within(others).queryByRole("link", { name: "Política de privacidade" })).toBeNull();
    first.unmount();

    renderRoute("/termos");
    await screen.findByRole("heading", { name: "Termos de uso" });
    others = screen.getByRole("navigation", { name: "Outros documentos legais" });
    expect(within(others).getByRole("link", { name: "Política de privacidade" })).toHaveAttribute(
      "href",
      "/privacidade",
    );
    expect(within(others).queryByRole("link", { name: "Termos de uso" })).toBeNull();
  });

  describe("estados", () => {
    afterEach(() => {
      onlineManager.setOnline(true);
    });

    it("mostra o carregando, com o voltar já disponível", async () => {
      server.use(http.get("/api/legal-documents/privacy-policy", () => new Promise(() => {})));
      renderRoute("/privacidade");

      const loading = await screen.findByText("Carregando documento");
      expect(loading.closest("[data-state=loading]")).toHaveAttribute("role", "status");
      expect(screen.getByRole("link", { name: "Voltar ao login" })).toBeInTheDocument();
      expect(screen.queryByRole("heading")).not.toBeInTheDocument();
    });

    it("o erro é um alerta com a mensagem e a ação de tentar de novo", async () => {
      let requests = 0;
      server.use(
        http.get("/api/legal-documents/privacy-policy", () => {
          requests += 1;
          return HttpResponse.json(
            { code: "INTERNAL_ERROR", message: "Documento indisponível." },
            { status: 500 },
          );
        }),
      );
      const user = userEvent.setup();
      renderRoute("/privacidade");

      const alert = await screen.findByRole("alert");
      expect(alert).toHaveTextContent("Documento indisponível.");
      const before = requests;
      await user.click(within(alert).getByRole("button", { name: "Tentar novamente" }));
      await waitFor(() => expect(requests).toBeGreaterThan(before));
    });

    it("sem conexão mostra o estado offline, não o erro", async () => {
      onlineManager.setOnline(false);
      renderRoute("/termos");

      const offline = await waitFor(() => {
        const node = document.querySelector('[data-state="offline"]');
        expect(node).not.toBeNull();
        return node as HTMLElement;
      });
      expect(offline).toHaveTextContent("Sem conexão");
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
      expect(screen.getByRole("link", { name: "Voltar ao login" })).toBeInTheDocument();
    });
  });
});
