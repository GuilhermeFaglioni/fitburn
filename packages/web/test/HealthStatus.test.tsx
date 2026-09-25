import type { ReactElement } from "react";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import { HealthStatus } from "../src/pages/HealthStatus";
import { server } from "./msw-server";

function renderWithClient(ui: ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

describe("HealthStatus", () => {
  it("mostra o status quando a API responde com sucesso", async () => {
    renderWithClient(<HealthStatus />);

    expect(await screen.findByText(/status da api: operacional/i)).toBeInTheDocument();
    expect(screen.getByText(/banco de dados: conectado/i)).toBeInTheDocument();
  });

  it("mostra um erro quando a API falha", async () => {
    server.use(http.get("/api/health", () => HttpResponse.error()));

    renderWithClient(<HealthStatus />);

    expect(await screen.findByRole("alert")).toHaveTextContent(/não foi possível conectar/i);
  });
});
