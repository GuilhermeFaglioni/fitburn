import "@testing-library/jest-dom/vitest";
import { configure } from "@testing-library/react";
import { resetConnectivity } from "../src/lib/connectivity/connectivity-store";
import { setTutorialSessionSeen } from "../src/lib/pwa/install-tutorial";
import { server } from "./msw-server";

// A suíte roda logo depois da da API, com a máquina ocupada: o 1s padrão do RTL
// para findBy/waitFor causava falhas esporádicas em telas que só demoram a montar.
configure({ asyncUtilTimeout: 3000 });

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
beforeEach(() => {
  // O tutorial de instalação abre sozinho no primeiro acesso do cliente (#177); nas demais suítes ele fica como já
  // visto nesta sessão (em memória, sem tocar no localStorage). InstallTutorial.test.tsx o reabilita.
  setTutorialSessionSeen(true);
});
afterEach(() => {
  server.resetHandlers();
  // O estado de conexão é global: um teste que simula rede fora do ar não pode vazar para o próximo.
  Object.defineProperty(window.navigator, "onLine", { configurable: true, value: true });
  resetConnectivity();
});
afterAll(() => server.close());
