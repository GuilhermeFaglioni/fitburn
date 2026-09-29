import { act, render, screen } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { AuthProvider } from "../src/lib/auth/AuthContext";
import { LoginPage } from "../src/pages/LoginPage";
import { ProtectedRoute } from "../src/routes/ProtectedRoute";
import { setBrowserOnline } from "./connectivity-helpers";
import { server } from "./msw-server";

const USER = {
  id: "user-1",
  email: "cliente@fitburn.local",
  fullName: "Cliente",
  status: "ACTIVE",
  profile: { id: "profile-1", name: "Cliente" },
  permissions: [],
};

function renderProtectedApp() {
  return render(
    <AuthProvider>
      <MemoryRouter initialEntries={["/"]}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <div>Início do cliente</div>
              </ProtectedRoute>
            }
          />
        </Routes>
      </MemoryRouter>
    </AuthProvider>,
  );
}

describe("Restauração de sessão sem conexão", () => {
  it("se a conexão volta enquanto o refresh está em andamento (e ele falha por rede), a restauração tenta de novo", async () => {
    setBrowserOnline(false);
    let calls = 0;
    server.use(
      http.post("/api/auth/refresh", () => {
        calls += 1;
        if (calls === 1) {
          // A conexão volta durante a requisição, que mesmo assim falha por rede.
          setBrowserOnline(true);
          return HttpResponse.error();
        }
        return HttpResponse.json({ accessToken: "token", user: USER }, { status: 200 });
      }),
    );

    renderProtectedApp();

    expect(await screen.findByText("Início do cliente")).toBeInTheDocument();
    expect(calls).toBe(2);
  });

  it("um refresh que falha por 5xx não derruba a sessão e é retomado quando a conexão volta", async () => {
    let calls = 0;
    server.use(
      http.post("/api/auth/refresh", () => {
        calls += 1;
        return calls === 1
          ? HttpResponse.json({ code: "INTERNAL_ERROR", message: "x" }, { status: 502 })
          : HttpResponse.json({ accessToken: "token", user: USER }, { status: 200 });
      }),
    );

    renderProtectedApp();
    expect(await screen.findByRole("heading", { name: "Bem-vindo de volta" })).toBeInTheDocument();

    act(() => setBrowserOnline(true));

    expect(await screen.findByText("Início do cliente")).toBeInTheDocument();
  });

  it("abrir o app sem rede mostra a casca (login) e, quando a conexão volta, restaura a sessão sozinha", async () => {
    let networkUp = false;
    server.use(
      http.post("/api/auth/refresh", () =>
        networkUp
          ? HttpResponse.json({ accessToken: "token", user: USER }, { status: 200 })
          : HttpResponse.error(),
      ),
    );

    render(
      <AuthProvider>
        <MemoryRouter initialEntries={["/"]}>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route
              path="/"
              element={
                <ProtectedRoute>
                  <div>Início do cliente</div>
                </ProtectedRoute>
              }
            />
          </Routes>
        </MemoryRouter>
      </AuthProvider>,
    );

    expect(await screen.findByRole("heading", { name: "Bem-vindo de volta" })).toBeInTheDocument();

    networkUp = true;
    act(() => setBrowserOnline(true));

    expect(await screen.findByText("Início do cliente")).toBeInTheDocument();
  });
});
