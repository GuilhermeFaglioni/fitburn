import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { MemoryRouter, useLocation } from "react-router-dom";
import { AppRoutes } from "../src/App";
import { AuthProvider } from "../src/lib/auth/AuthContext";
import { server } from "./msw-server";

function LocationProbe() {
  return <output data-testid="location">{useLocation().pathname}</output>;
}

function renderFlow() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <MemoryRouter initialEntries={["/agenda"]}>
          <AppRoutes />
          <LocationProbe />
        </MemoryRouter>
      </AuthProvider>
    </QueryClientProvider>,
  );
}

describe("Onboarding obrigatório", () => {
  beforeEach(() => {
    const pendingUser = {
      id: "user-1",
      email: "marina@fitburn.local",
      fullName: "Marina Souza",
      status: "ACTIVE",
      profile: { id: "profile-client", name: "Cliente" },
      permissions: [],
      onboardingPending: ["PASSWORD_CHANGE"],
    };
    server.use(
      http.post("/api/auth/login", () =>
        HttpResponse.json({ accessToken: "token-temporario", user: pendingUser }, { status: 201 }),
      ),
      http.post("/api/auth/password", () =>
        HttpResponse.json({
          accessToken: "token-atualizado",
          user: { ...pendingUser, onboardingPending: [] },
        }),
      ),
      http.get("/api/plans/mine", () => HttpResponse.json({ active: null, history: [] })),
      http.get("/api/reservations", () => HttpResponse.json([])),
      http.get("/api/gamification/me", () =>
        HttpResponse.json({
          totalPoints: 0,
          history: [],
          streak: { current: 0, best: 0 },
          badges: [],
        }),
      ),
    );
  });

  it("redireciona para a troca obrigatória, bloqueia a agenda e libera o app após salvar", async () => {
    renderFlow();
    const user = userEvent.setup();

    await user.type(await screen.findByLabelText("E-mail"), "marina@fitburn.local");
    await user.type(screen.getByLabelText("Senha"), "SenhaTemporaria123!");
    await user.click(screen.getByRole("button", { name: "Entrar" }));

    expect(
      await screen.findByRole("heading", { name: "Troca obrigatória de senha" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("/onboarding", { selector: "[data-testid=location]" }),
    ).toBeInTheDocument();
    expect(screen.queryByText("Agenda", { selector: "h1" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("CPF")).not.toBeInTheDocument();

    await user.type(screen.getByLabelText("Senha atual"), "SenhaTemporaria123!");
    await user.type(screen.getByLabelText("Nova senha"), "SenhaDefinitiva456!");
    await user.click(screen.getByRole("button", { name: "Salvar nova senha" }));

    expect(
      await screen.findByText("/", { selector: "[data-testid=location]" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "Troca obrigatória de senha" }),
    ).not.toBeInTheDocument();
  });

  it("registra ciência e aceite separadamente na ordem do onboarding", async () => {
    const pendingUser = {
      id: "user-2",
      email: "marina@fitburn.local",
      fullName: "Marina Souza",
      status: "ACTIVE",
      profile: { id: "profile-client", name: "Cliente" },
      permissions: [],
      onboardingPending: ["PRIVACY_ACKNOWLEDGEMENT", "TERMS_ACCEPTANCE"],
    };
    server.use(
      http.post("/api/auth/login", () =>
        HttpResponse.json({ accessToken: "token-legal", user: pendingUser }, { status: 201 }),
      ),
      http.get("/api/legal-documents/privacy-policy", () =>
        HttpResponse.json({
          type: "PRIVACY_POLICY",
          title: "Política de privacidade",
          version: "v1",
          requiresNewManifestation: true,
          content: "CONTEÚDO PROVISÓRIO\n\nTexto da política.",
        }),
      ),
      http.get("/api/legal-documents/terms-of-use", () =>
        HttpResponse.json({
          type: "TERMS_OF_USE",
          title: "Termos de uso",
          version: "v1",
          requiresNewManifestation: true,
          content: "CONTEÚDO PROVISÓRIO\n\nTexto dos termos.",
        }),
      ),
      http.post("/api/onboarding/privacy-acknowledgement", () =>
        HttpResponse.json(
          {
            manifestation: {
              id: "manifestation-privacy",
              userId: pendingUser.id,
              type: "PRIVACY_ACKNOWLEDGED",
              version: "v1",
              action: "GRANTED",
              createdAt: "2026-10-19T20:00:00.000Z",
            },
            onboardingPending: ["TERMS_ACCEPTANCE"],
          },
          { status: 201 },
        ),
      ),
      http.post("/api/onboarding/terms-acceptance", () =>
        HttpResponse.json(
          {
            manifestation: {
              id: "manifestation-terms",
              userId: pendingUser.id,
              type: "TERMS_ACCEPTED",
              version: "v1",
              action: "GRANTED",
              createdAt: "2026-10-19T20:00:01.000Z",
            },
            onboardingPending: [],
          },
          { status: 201 },
        ),
      ),
    );

    renderFlow();
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText("E-mail"), "marina@fitburn.local");
    await user.type(screen.getByLabelText("Senha"), "SenhaTemporaria123!");
    await user.click(screen.getByRole("button", { name: "Entrar" }));

    expect(
      await screen.findByRole("heading", { name: "Ciência da política de privacidade" }),
    ).toBeInTheDocument();
    expect(await screen.findByText("Texto da política.")).toBeInTheDocument();
    await user.click(screen.getByRole("checkbox", { name: "Li a política de privacidade" }));
    await user.click(screen.getByRole("button", { name: "Registrar ciência" }));

    expect(
      await screen.findByRole("heading", { name: "Aceite dos termos de uso" }),
    ).toBeInTheDocument();
    expect(await screen.findByText("Texto dos termos.")).toBeInTheDocument();
    await user.click(screen.getByRole("checkbox", { name: "Li e aceito os termos de uso" }));
    await user.click(screen.getByRole("button", { name: "Aceitar termos" }));

    expect(
      await screen.findByText("/", { selector: "[data-testid=location]" }),
    ).toBeInTheDocument();
  });
});

describe("Etapa de ciência e aceite (apresentação)", () => {
  const PRIVACY_TEXT = "CONTEÚDO PROVISÓRIO\n\nTexto da política.";

  function mockPendingLegal({ privacyDelay }: { privacyDelay?: Promise<void> } = {}) {
    const pendingUser = {
      id: "user-3",
      email: "marina@fitburn.local",
      fullName: "Marina Souza",
      status: "ACTIVE",
      profile: { id: "profile-client", name: "Cliente" },
      permissions: [],
      onboardingPending: ["PRIVACY_ACKNOWLEDGEMENT", "TERMS_ACCEPTANCE"],
    };
    const posts: string[] = [];
    server.use(
      http.post("/api/auth/login", () =>
        HttpResponse.json({ accessToken: "token-legal", user: pendingUser }, { status: 201 }),
      ),
      http.get("/api/legal-documents/privacy-policy", () =>
        HttpResponse.json({
          type: "PRIVACY_POLICY",
          title: "Política de privacidade",
          version: "v1",
          requiresNewManifestation: true,
          content: PRIVACY_TEXT,
        }),
      ),
      http.get("/api/legal-documents/terms-of-use", () =>
        HttpResponse.json({
          type: "TERMS_OF_USE",
          title: "Termos de uso",
          version: "v1",
          requiresNewManifestation: true,
          content: "CONTEÚDO PROVISÓRIO\n\nTexto dos termos.",
        }),
      ),
      http.post("/api/onboarding/privacy-acknowledgement", async () => {
        posts.push("privacy");
        await privacyDelay;
        return HttpResponse.json(
          {
            manifestation: {
              id: "manifestation-privacy",
              userId: pendingUser.id,
              type: "PRIVACY_ACKNOWLEDGED",
              version: "v1",
              action: "GRANTED",
              createdAt: "2026-10-19T20:00:00.000Z",
            },
            onboardingPending: ["TERMS_ACCEPTANCE"],
          },
          { status: 201 },
        );
      }),
    );
    return { posts };
  }

  async function loginIntoLegalStep() {
    renderFlow();
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText("E-mail"), "marina@fitburn.local");
    await user.type(screen.getByLabelText("Senha"), "SenhaTemporaria123!");
    await user.click(screen.getByRole("button", { name: "Entrar" }));
    await screen.findByRole("heading", { name: "Ciência da política de privacidade" });
    return user;
  }

  it("mostra título, versão, o texto do aceite e o checkbox com nome, com o botão desabilitado até marcar", async () => {
    mockPendingLegal();
    const user = await loginIntoLegalStep();

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Ciência da política de privacidade",
    );
    expect(screen.getAllByRole("heading")).toHaveLength(1);
    expect(screen.getByText("Versão v1")).toBeInTheDocument();
    const article = screen.getByRole("article", { name: "Política de privacidade" });
    expect(within(article).getByText("CONTEÚDO PROVISÓRIO")).toBeInTheDocument();
    expect(within(article).getByText("Texto da política.")).toBeInTheDocument();

    const confirm = screen.getByRole("checkbox", { name: "Li a política de privacidade" });
    const advance = screen.getByRole("button", { name: "Registrar ciência" });
    expect(confirm).not.toBeChecked();
    expect(advance).toBeDisabled();

    await user.click(confirm);
    expect(advance).toBeEnabled();
    await user.click(confirm);
    expect(advance).toBeDisabled();
  });

  it("o texto do documento é mostrado sem alteração, parágrafo a parágrafo", async () => {
    mockPendingLegal();
    await loginIntoLegalStep();

    const article = screen.getByRole("article", { name: "Política de privacidade" });
    expect(Array.from(article.querySelectorAll("p"), (paragraph) => paragraph.textContent)).toEqual(
      PRIVACY_TEXT.split("\n\n"),
    );
  });

  it("enquanto registra a ciência, o botão fica com aria-busy e um segundo clique não envia de novo", async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const { posts } = mockPendingLegal({ privacyDelay: gate });
    const user = await loginIntoLegalStep();

    await user.click(screen.getByRole("checkbox", { name: "Li a política de privacidade" }));
    await user.click(screen.getByRole("button", { name: "Registrar ciência" }));

    const busy = await screen.findByRole("button", { name: "Salvando…" });
    expect(busy).toHaveAttribute("aria-busy", "true");
    await user.click(busy);
    expect(posts).toEqual(["privacy"]);

    release();
    expect(
      await screen.findByRole("heading", { name: "Aceite dos termos de uso" }),
    ).toBeInTheDocument();
  });

  it("a falha ao registrar aparece como alerta e o botão volta a ficar disponível para tentar de novo", async () => {
    mockPendingLegal();
    server.use(
      http.post("/api/onboarding/privacy-acknowledgement", () =>
        HttpResponse.json({ code: "INTERNAL_ERROR", message: "falhou" }, { status: 500 }),
      ),
    );
    const user = await loginIntoLegalStep();

    await user.click(screen.getByRole("checkbox", { name: "Li a política de privacidade" }));
    await user.click(screen.getByRole("button", { name: "Registrar ciência" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("falhou");
    const advance = screen.getByRole("button", { name: "Registrar ciência" });
    expect(advance).toBeEnabled();
    expect(advance).not.toHaveAttribute("aria-busy");
    // Marcar de novo limpa o aviso.
    await user.click(screen.getByRole("checkbox", { name: "Li a política de privacidade" }));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("mostra o carregando enquanto o documento não chega, sem o checkbox nem o botão", async () => {
    mockPendingLegal();
    server.use(http.get("/api/legal-documents/privacy-policy", () => new Promise(() => {})));
    renderFlow();
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText("E-mail"), "marina@fitburn.local");
    await user.type(screen.getByLabelText("Senha"), "SenhaTemporaria123!");
    await user.click(screen.getByRole("button", { name: "Entrar" }));

    const loading = await screen.findByText("Carregando documento");
    expect(loading.closest("[data-state=loading]")).toHaveAttribute("role", "status");
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Registrar ciência" })).not.toBeInTheDocument();
  });

  it("falha ao carregar o documento: alerta com a mensagem e ação de tentar de novo", async () => {
    mockPendingLegal();
    let requests = 0;
    server.use(
      http.get("/api/legal-documents/privacy-policy", () => {
        requests += 1;
        return HttpResponse.json(
          { code: "INTERNAL_ERROR", message: "Documento indisponível." },
          { status: 500 },
        );
      }),
    );
    renderFlow();
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText("E-mail"), "marina@fitburn.local");
    await user.type(screen.getByLabelText("Senha"), "SenhaTemporaria123!");
    await user.click(screen.getByRole("button", { name: "Entrar" }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Documento indisponível.");
    const before = requests;
    await user.click(within(alert).getByRole("button", { name: "Tentar novamente" }));
    await waitFor(() => expect(requests).toBeGreaterThan(before));
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
  });
});

describe("Etapa de troca obrigatória de senha (apresentação)", () => {
  beforeEach(() => {
    const pendingUser = {
      id: "user-4",
      email: "marina@fitburn.local",
      fullName: "Marina Souza",
      status: "ACTIVE",
      profile: { id: "profile-client", name: "Cliente" },
      permissions: [],
      onboardingPending: ["PASSWORD_CHANGE"],
    };
    server.use(
      http.post("/api/auth/login", () =>
        HttpResponse.json({ accessToken: "token-temporario", user: pendingUser }, { status: 201 }),
      ),
    );
  });

  it("é uma coluna sozinha na página (main), com título, orientação e o cartão da nova senha, sem dados pessoais nem plano", async () => {
    renderFlow();
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText("E-mail"), "marina@fitburn.local");
    await user.type(screen.getByLabelText("Senha"), "SenhaTemporaria123!");
    await user.click(screen.getByRole("button", { name: "Entrar" }));

    await screen.findByRole("heading", { level: 1, name: "Troca obrigatória de senha" });
    const main = screen.getByRole("main");
    expect(
      within(main).getByText("Defina uma senha pessoal para liberar o acesso ao Fitburn."),
    ).toBeInTheDocument();
    const card = within(main).getByRole("region", { name: "Defina uma nova senha" });
    expect(within(card).getByLabelText("Senha atual")).toBeInTheDocument();
    expect(within(card).getByLabelText("Nova senha")).toBeInTheDocument();
    expect(within(main).queryByRole("region", { name: "Dados pessoais" })).not.toBeInTheDocument();
    expect(within(main).queryByRole("heading", { name: "Meu plano" })).not.toBeInTheDocument();
    expect(within(main).queryByRole("button", { name: "Cancelar troca de senha" })).toBeNull();
  });

  it("a senha nova curta é apontada no campo, com aria-invalid e aria-describedby, e nada é enviado", async () => {
    renderFlow();
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText("E-mail"), "marina@fitburn.local");
    await user.type(screen.getByLabelText("Senha"), "SenhaTemporaria123!");
    await user.click(screen.getByRole("button", { name: "Entrar" }));

    await user.type(await screen.findByLabelText("Senha atual"), "SenhaTemporaria123!");
    await user.type(screen.getByLabelText("Nova senha"), "curta");
    await user.click(screen.getByRole("button", { name: "Salvar nova senha" }));

    const next = screen.getByLabelText("Nova senha");
    expect(next).toHaveAttribute("aria-invalid", "true");
    const message = document.getElementById(next.getAttribute("aria-describedby") as string);
    expect(message).toHaveAttribute("role", "alert");
    expect(message).toHaveTextContent("A senha precisa ter pelo menos 8 caracteres.");
    expect(
      screen.getByText("/onboarding", { selector: "[data-testid=location]" }),
    ).toBeInTheDocument();
  });
});
