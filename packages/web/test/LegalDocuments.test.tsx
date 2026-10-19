import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
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
});
