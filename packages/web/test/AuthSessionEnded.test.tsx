import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { MemoryRouter, Route, Routes, useNavigate } from "react-router-dom";
import { AuthProvider, useAuth } from "../src/lib/auth/AuthContext";
import { authFetch } from "../src/lib/auth/authFetch";
import { SessionCacheReset } from "../src/lib/auth/SessionCacheReset";
import { tokenStore } from "../src/lib/auth/token-store";
import { ProtectedRoute } from "../src/routes/ProtectedRoute";
import { mockSuccessfulLogin } from "./auth-mocks";
import { server } from "./msw-server";

function LoginScreen() {
  const { login } = useAuth();
  const navigate = useNavigate();

  return (
    <>
      <h1>Login screen</h1>
      <button
        type="button"
        onClick={() => {
          void login("usuario@fitburn.local", "SenhaForte123!").then(() => navigate("/private"));
        }}
      >
        Log in
      </button>
    </>
  );
}

function PrivateScreen() {
  const { user } = useAuth();
  const [requestStatus, setRequestStatus] = useState<number | null>(null);

  return (
    <>
      <h1>Private session content</h1>
      <output>{user?.fullName}</output>
      <button
        type="button"
        onClick={() => {
          void authFetch("/api/session-probe").then((response) =>
            setRequestStatus(response.status),
          );
        }}
      >
        Make request
      </button>
      {requestStatus !== null && <output>Request status: {requestStatus}</output>}
    </>
  );
}

function renderAuthApp() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <SessionCacheReset />
        <MemoryRouter initialEntries={["/private"]}>
          <Routes>
            <Route path="/login" element={<LoginScreen />} />
            <Route
              path="/private"
              element={
                <ProtectedRoute>
                  <PrivateScreen />
                </ProtectedRoute>
              }
            />
          </Routes>
        </MemoryRouter>
      </AuthProvider>
    </QueryClientProvider>,
  );
  return queryClient;
}

describe("Sessão encerrada durante uma chamada autenticada", () => {
  beforeEach(() => {
    tokenStore.set(null);
    mockSuccessfulLogin("Administrador");
  });

  it("limpa usuário e cache e volta ao login quando refresh retorna 401", async () => {
    server.use(
      http.get("/api/session-probe", () =>
        HttpResponse.json({ code: "UNAUTHENTICATED", message: "Expirada." }, { status: 401 }),
      ),
    );
    const queryClient = renderAuthApp();
    const user = userEvent.setup();

    await user.click(await screen.findByRole("button", { name: "Log in" }));
    expect(
      await screen.findByRole("heading", { name: "Private session content" }),
    ).toBeInTheDocument();
    queryClient.setQueryData(["private-data"], ["dados da sessão"]);

    await user.click(screen.getByRole("button", { name: "Make request" }));

    expect(await screen.findByRole("heading", { name: "Login screen" })).toBeInTheDocument();
    await waitFor(() => expect(queryClient.getQueryData(["private-data"])).toBeUndefined());
    expect(
      screen.queryByRole("heading", { name: "Private session content" }),
    ).not.toBeInTheDocument();
    expect(tokenStore.get()).toBeNull();
  });

  it("preserva usuário e cache quando refresh falha por rede", async () => {
    server.use(
      http.get("/api/session-probe", () =>
        HttpResponse.json({ code: "UNAUTHENTICATED", message: "Expirada." }, { status: 401 }),
      ),
      http.post("/api/auth/refresh", () => HttpResponse.error()),
    );
    const queryClient = renderAuthApp();
    const user = userEvent.setup();

    await user.click(await screen.findByRole("button", { name: "Log in" }));
    expect(
      await screen.findByRole("heading", { name: "Private session content" }),
    ).toBeInTheDocument();
    queryClient.setQueryData(["private-data"], ["dados da sessão"]);

    await user.click(screen.getByRole("button", { name: "Make request" }));

    expect(await screen.findByText("Request status: 401")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Private session content" })).toBeInTheDocument();
    expect(queryClient.getQueryData(["private-data"])).toEqual(["dados da sessão"]);
    expect(tokenStore.get()).toBe("token-de-teste");
  });
});
