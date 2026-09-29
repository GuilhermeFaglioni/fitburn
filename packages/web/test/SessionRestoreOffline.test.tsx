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

describe("Restauração de sessão sem conexão", () => {
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
