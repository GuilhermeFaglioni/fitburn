import "@testing-library/jest-dom/vitest";
import { configure } from "@testing-library/react";
import { server } from "./msw-server";

// A suíte roda logo depois da da API, com a máquina ocupada: o 1s padrão do RTL
// para findBy/waitFor causava falhas esporádicas em telas que só demoram a montar.
configure({ asyncUtilTimeout: 3000 });

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
