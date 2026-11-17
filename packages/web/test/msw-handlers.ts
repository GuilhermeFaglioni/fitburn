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
];
