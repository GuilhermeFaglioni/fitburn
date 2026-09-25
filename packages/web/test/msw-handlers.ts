import type { HttpHandler } from "msw";

// Handlers padrão globais para todos os testes. Cada teste adiciona os seus
// próprios com server.use(...) para os endpoints que exercita.
export const handlers: HttpHandler[] = [];
