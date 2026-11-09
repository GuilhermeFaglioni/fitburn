import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import { MemoryRouter, useLocation } from "react-router-dom";
import {
  Module,
  PermissionAction,
  PermissionScope,
  type CurrentUser,
  type EffectivePermission,
  type UserDetail,
} from "@fitburn/contracts";
import { AppRoutes } from "../src/App";
import { AuthProvider } from "../src/lib/auth/AuthContext";
import { setTutorialSessionSeen, TUTORIAL_SEEN_KEY } from "../src/lib/pwa/install-tutorial";
import { server } from "./msw-server";

const IPHONE_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";
const ANDROID_UA =
  "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36";

const CLIENT_ME: UserDetail = {
  id: "user-1",
  email: "marina.souza@email.com",
  fullName: "Marina Souza",
  phone: "31998765432",
  birthDate: "1994-03-14",
  document: null,
  address: null,
  status: "ACTIVE",
  profile: { id: "profile-1", name: "Cliente" },
  onboardingPending: [],
};

const TEACHER_PERMISSIONS: EffectivePermission[] = [
  { module: Module.PRESENCA, actions: [PermissionAction.VIEW], scope: PermissionScope.ASSIGNED_CLASSES },
];

function mockSession(
  profileName: "Cliente" | "Professor" | "Administrador",
  permissions: EffectivePermission[] = [],
) {
  const current: CurrentUser = {
    id: "user-1",
    email: CLIENT_ME.email,
    fullName: CLIENT_ME.fullName,
    status: "ACTIVE",
    profile: { id: "profile-1", name: profileName },
    permissions,
    onboardingPending: [],
  };
  server.use(
    // Rede de segurança das telas da equipe (só interessa que o tutorial não apareça).
    http.get("/api/*", () => HttpResponse.json([])),
    http.post("/api/auth/refresh", () => HttpResponse.json({ accessToken: "token", user: current })),
    http.get("/api/me", () => HttpResponse.json({ ...CLIENT_ME, profile: current.profile })),
    http.get("/api/plans/mine", () => HttpResponse.json({ active: null, history: [] })),
    http.get("/api/reservations", () => HttpResponse.json([])),
    http.get("/api/gamification/me", () =>
      HttpResponse.json({ totalPoints: 0, history: [], streak: { current: 0, next: null }, badges: [] }),
    ),
    http.get("/api/gamification/ranking/consent", () =>
      HttpResponse.json({ consented: false, manifestation: null }),
    ),
  );
}

function LocationProbe() {
  return <output data-testid="location">{useLocation().pathname}</output>;
}

function renderAt(path: string) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <MemoryRouter initialEntries={[path]}>
          <AppRoutes />
          <LocationProbe />
        </MemoryRouter>
      </AuthProvider>
    </QueryClientProvider>,
  );
}

function setUserAgent(userAgent: string, platform = "") {
  vi.spyOn(window.navigator, "userAgent", "get").mockReturnValue(userAgent);
  vi.spyOn(window.navigator, "platform", "get").mockReturnValue(platform);
}

const tutorial = () => screen.findByRole("dialog", { name: "Instale o Fitburn no seu celular" });
const noTutorial = () =>
  expect(screen.queryByRole("dialog", { name: "Instale o Fitburn no seu celular" })).not.toBeInTheDocument();

describe("Tutorial de instalação do PWA", () => {
  beforeEach(() => {
    window.localStorage.clear();
    setTutorialSessionSeen(false);
    mockSession("Cliente");
  });

  afterEach(() => {
    vi.restoreAllMocks();
    Reflect.deleteProperty(window.navigator, "maxTouchPoints");
    window.localStorage.clear();
  });

  describe("primeiro acesso do cliente", () => {
    it("abre o tutorial na Home e marca como visto ao tocar em Entendi", async () => {
      const user = userEvent.setup();
      renderAt("/");

      const dialog = await tutorial();
      expect(window.localStorage.getItem(TUTORIAL_SEEN_KEY)).toBeNull();

      await user.click(within(dialog).getByRole("button", { name: "Entendi" }));

      noTutorial();
      expect(window.localStorage.getItem(TUTORIAL_SEEN_KEY)).not.toBeNull();
    });

    it("não abre de novo quando este aparelho já viu o tutorial", async () => {
      window.localStorage.setItem(TUTORIAL_SEEN_KEY, "1");
      renderAt("/");

      expect(await screen.findByRole("heading", { name: /^Olá/ })).toBeInTheDocument();
      noTutorial();
    });

    it("tem foco inicial no switch, passos em lista ordenada e diálogo rotulado", async () => {
      renderAt("/");

      const dialog = await tutorial();
      expect(dialog).toHaveAttribute("aria-modal", "true");
      expect(within(dialog).getByRole("button", { name: "iOS" })).toHaveFocus();
      expect(within(dialog).getAllByRole("listitem")).toHaveLength(3);
      expect(dialog.querySelector("ol")).not.toBeNull();
    });

    it("fecha com Escape e marca como visto", async () => {
      const user = userEvent.setup();
      renderAt("/");
      await tutorial();

      await user.keyboard("{Escape}");

      noTutorial();
      expect(window.localStorage.getItem(TUTORIAL_SEEN_KEY)).not.toBeNull();
    });

    it("fecha com o clique no fundo e marca como visto", async () => {
      renderAt("/");
      const dialog = await tutorial();

      fireEvent.mouseDown(dialog.parentElement as HTMLElement);

      noTutorial();
      expect(window.localStorage.getItem(TUTORIAL_SEEN_KEY)).not.toBeNull();
    });

    it("clicar dentro do diálogo não o fecha", async () => {
      const user = userEvent.setup();
      renderAt("/");
      const dialog = await tutorial();

      await user.click(within(dialog).getByRole("heading", { name: "Instale o Fitburn no seu celular" }));

      expect(await tutorial()).toBeInTheDocument();
      expect(window.localStorage.getItem(TUTORIAL_SEEN_KEY)).toBeNull();
    });
  });

  describe("switch iOS | Android", () => {
    it("troca os passos ao mudar de plataforma", async () => {
      setUserAgent(IPHONE_UA);
      const user = userEvent.setup();
      renderAt("/");
      const dialog = await tutorial();

      expect(within(dialog).getByText(/Toque em Compartilhar/)).toBeInTheDocument();
      expect(within(dialog).getByText(/Adicionar à Tela de Início/)).toBeInTheDocument();

      await user.click(within(dialog).getByRole("button", { name: "Android" }));

      expect(within(dialog).getByRole("button", { name: "Android" })).toHaveAttribute("aria-pressed", "true");
      expect(within(dialog).getByRole("button", { name: "iOS" })).toHaveAttribute("aria-pressed", "false");
      expect(within(dialog).queryByText(/Toque em Compartilhar/)).not.toBeInTheDocument();
      expect(within(dialog).getByText(/Instalar app/)).toBeInTheDocument();
      expect(within(dialog).getAllByRole("listitem")).toHaveLength(3);
    });

    it("começa em iOS num iPhone", async () => {
      setUserAgent(IPHONE_UA);
      renderAt("/");
      const dialog = await tutorial();

      expect(within(dialog).getByRole("button", { name: "iOS" })).toHaveAttribute("aria-pressed", "true");
    });

    it("começa em iOS num iPad que se apresenta como Mac", async () => {
      setUserAgent("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/17.5 Safari/605.1.15", "MacIntel");
      Object.defineProperty(window.navigator, "maxTouchPoints", { configurable: true, value: 5 });
      renderAt("/");
      const dialog = await tutorial();

      expect(within(dialog).getByRole("button", { name: "iOS" })).toHaveAttribute("aria-pressed", "true");
    });

    it("começa em Android num aparelho Android", async () => {
      setUserAgent(ANDROID_UA);
      renderAt("/");
      const dialog = await tutorial();

      expect(within(dialog).getByRole("button", { name: "Android" })).toHaveAttribute("aria-pressed", "true");
      expect(within(dialog).getByText(/Instalar app/)).toBeInTheDocument();
    });
  });

  describe("Perfil", () => {
    it("mostra o botão e reabre o diálogo sem mexer na flag (ainda não vista)", async () => {
      const user = userEvent.setup();
      renderAt("/perfil");

      await user.click(await screen.findByRole("button", { name: "Ver tutorial de instalação" }));
      const dialog = await tutorial();
      await user.click(within(dialog).getByRole("button", { name: "Entendi" }));

      noTutorial();
      expect(window.localStorage.getItem(TUTORIAL_SEEN_KEY)).toBeNull();
      expect(screen.getByRole("button", { name: "Ver tutorial de instalação" })).toHaveFocus();
    });

    it("reabre o diálogo sem alterar a flag já gravada", async () => {
      window.localStorage.setItem(TUTORIAL_SEEN_KEY, "valor-original");
      const user = userEvent.setup();
      renderAt("/perfil");

      await user.click(await screen.findByRole("button", { name: "Ver tutorial de instalação" }));
      await tutorial();
      await user.keyboard("{Escape}");

      noTutorial();
      expect(window.localStorage.getItem(TUTORIAL_SEEN_KEY)).toBe("valor-original");
    });

    it("o tutorial aberto pelo Perfil funciona sem rede (conteúdo estático)", async () => {
      const user = userEvent.setup();
      renderAt("/perfil");
      await user.click(await screen.findByRole("button", { name: "Ver tutorial de instalação" }));
      server.use(http.all("*", () => HttpResponse.error()));

      const dialog = await tutorial();
      await user.click(within(dialog).getByRole("button", { name: "iOS" }));
      expect(within(dialog).getAllByRole("listitem")).toHaveLength(3);
    });
  });

  describe("storage indisponível", () => {
    it("abre sem erro e não reaparece em loop depois de fechado", async () => {
      vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
        throw new DOMException("bloqueado", "SecurityError");
      });
      vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
        throw new DOMException("bloqueado", "SecurityError");
      });
      const user = userEvent.setup();
      renderAt("/");

      const dialog = await tutorial();
      await user.click(within(dialog).getByRole("button", { name: "Entendi" }));
      noTutorial();

      // Vai ao Perfil e volta à Home: a Home monta de novo e o tutorial não reabre nesta sessão.
      await user.click(screen.getAllByRole("link", { name: "Perfil" })[0]);
      await waitFor(() => expect(screen.getByTestId("location")).toHaveTextContent("/perfil"));
      await user.click(screen.getAllByRole("link", { name: "Início" })[0]);
      expect(await screen.findByRole("heading", { name: /^Olá/ })).toBeInTheDocument();
      noTutorial();
    });

    it("com leitura liberada e escrita bloqueada, também não reabre", async () => {
      vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
        throw new DOMException("cota", "QuotaExceededError");
      });
      const user = userEvent.setup();
      renderAt("/");

      await user.click(within(await tutorial()).getByRole("button", { name: "Entendi" }));
      await user.click(screen.getAllByRole("link", { name: "Perfil" })[0]);
      await waitFor(() => expect(screen.getByTestId("location")).toHaveTextContent("/perfil"));
      await user.click(screen.getAllByRole("link", { name: "Início" })[0]);

      expect(await screen.findByRole("heading", { name: /^Olá/ })).toBeInTheDocument();
      noTutorial();
    });
  });

  describe("papel", () => {
    it("o professor não vê o tutorial nem o botão no Perfil", async () => {
      mockSession("Professor", TEACHER_PERMISSIONS);
      renderAt("/");
      await waitFor(() => expect(screen.getByTestId("location")).not.toHaveTextContent(/^\/$/));
      noTutorial();

      cleanup();
      renderAt("/perfil");
      expect(await screen.findByRole("heading", { name: "Minha conta" })).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Ver tutorial de instalação" })).not.toBeInTheDocument();
      noTutorial();
    });

    it("o administrador não vê o tutorial nem o botão no Perfil", async () => {
      mockSession("Administrador");
      renderAt("/");
      await waitFor(() => expect(screen.getByTestId("location")).not.toHaveTextContent(/^\/$/));
      noTutorial();
      expect(window.localStorage.getItem(TUTORIAL_SEEN_KEY)).toBeNull();
    });
  });
});
