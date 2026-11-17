import { http, HttpResponse, type HttpHandler } from "msw";

// Handlers padrão globais para todos os testes. AuthProvider sempre tenta
// restaurar a sessão via /auth/refresh ao montar — o padrão é "sem sessão"
// (401), e cada teste que precisa simular uma sessão já existente sobrescreve
// isso com server.use(...). Os demais endpoints ficam a cargo de cada teste.
export const handlers: HttpHandler[] = [
  http.post("/api/auth/refresh", () =>
    HttpResponse.json({ code: "SESSION_EXPIRED", message: "Sessão expirada." }, { status: 401 }),
  ),
  // O Início do cliente pergunta por pedido aprovado a retirar (L6, #199); o padrão é "nenhum".
  http.get("/api/shop/orders/approval-notice", () => HttpResponse.json({ number: null })),
  // Os atalhos Corpo e Loja do Início (N2, #201): o padrão é cliente sem avaliações, sem autorização e sem destaques.
  http.get("/api/bioimpedance/assessments/mine", () => HttpResponse.json([])),
  http.get("/api/bioimpedance/consent", () =>
    HttpResponse.json({ consented: false, manifestation: null, currentVersion: "v1" }),
  ),
  http.get("/api/shop/featured", () => HttpResponse.json([])),
  // O bloco Compras do Perfil lista os pedidos do cliente; o padrão é "nenhum pedido".
  http.get("/api/shop/orders", () => HttpResponse.json([])),
  // O card "Pedidos aguardando" do Dashboard do admin (L7, #200); o padrão é "nenhum".
  http.get("/api/shop/admin/orders/pending-count", () => HttpResponse.json({ count: 0 })),
];
