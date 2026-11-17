import { useEffect, useState } from "react";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { onlineManager, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import type { BioimpedanceAssessment, ClientShopProduct, MeasureValue } from "@fitburn/contracts";
import { AuthProvider, useAuth } from "../src/lib/auth/AuthContext";
import { HomeShortcuts } from "../src/pages/home/HomeShortcuts";
import { mockSuccessfulLogin } from "./auth-mocks";
import { image, product } from "./loja-helpers";
import { server } from "./msw-server";

/** Atalhos deslizantes do Início (N2, #201): dados fictícios, um cliente de teste e rotas-sonda para o destino. */

function assessment(
  id: string,
  measuredAt: string,
  measures: Record<string, MeasureValue> & { weight: MeasureValue },
): BioimpedanceAssessment {
  return {
    id,
    clientId: "c",
    clientName: "Cliente de Teste",
    measuredAt,
    heightCm: null,
    age: null,
    source: "MANUAL",
    authorName: "Prof. Exemplo",
    schemaVersion: 1,
    createdAt: measuredAt,
    updatedAt: measuredAt,
    measures,
  };
}

const ASSESSMENTS = [
  assessment("a1", "2026-07-03T10:00:00.000Z", {
    weight: { value: 69.8 },
    bodyFatPercent: { value: 20.1 },
    skeletalMuscleMass: { value: 31.2 },
    inbodyScore: { value: 75 },
  }),
  assessment("a2", "2026-10-20T10:00:00.000Z", {
    weight: { value: 69.2 },
    bodyFatPercent: { value: 19.2 },
    skeletalMuscleMass: { value: 31.5 },
    inbodyScore: { value: 77 },
  }),
];

const PRODUCTS: ClientShopProduct[] = [
  product({
    id: "p-camiseta",
    name: "Camiseta Dry Fit",
    startingPriceCents: 6990,
    originalPriceCents: 8990,
    coverImage: image("img-1"),
  }),
  product({ id: "p-garrafa", name: "Garrafa térmica", startingPriceCents: 7990 }),
  product({ id: "p-bone", name: "Boné Fitburn", startingPriceCents: 5990, availability: "ESGOTADO" }),
];

function mockShortcuts({
  assessments = ASSESSMENTS,
  consented = true,
  products = PRODUCTS,
}: {
  assessments?: BioimpedanceAssessment[];
  consented?: boolean;
  products?: ClientShopProduct[];
} = {}) {
  server.use(
    http.get("/api/bioimpedance/assessments/mine", () => HttpResponse.json(assessments)),
    http.get("/api/bioimpedance/consent", () =>
      HttpResponse.json({ consented, manifestation: null, currentVersion: "v1" }),
    ),
    http.get("/api/shop/featured", () => HttpResponse.json(products)),
    http.get("/api/shop/product-images/:id", () =>
      new HttpResponse(new Uint8Array([1, 2, 3]), { headers: { "Content-Type": "image/webp" } }),
    ),
  );
}

function Destination({ name }: { name: string }) {
  const location = useLocation();
  return (
    <h1>
      {name} <output data-testid="destino">{location.pathname + location.search}</output>
    </h1>
  );
}

function LoggedIn() {
  const { login } = useAuth();
  const [ready, setReady] = useState(false);
  useEffect(() => {
    login("marina@fitburn.local", "SenhaForte123!").then(() => setReady(true));
  }, [login]);
  if (!ready) return null;
  return (
    <Routes>
      <Route path="/" element={<HomeShortcuts />} />
      <Route path="/bioimpedancia" element={<Destination name="Composição corporal (tela)" />} />
      <Route path="/loja" element={<Destination name="Loja (tela)" />} />
      <Route path="/loja/:id" element={<Destination name="Produto (tela)" />} />
    </Routes>
  );
}

function renderShortcuts() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <MemoryRouter initialEntries={["/"]}>
          <LoggedIn />
        </MemoryRouter>
      </AuthProvider>
    </QueryClientProvider>,
  );
}

const BODY = "Composição corporal";
const SHOP = "Loja Fitburn";

/** O cartão do atalho no momento (o estado de carregando e o carrossel são elementos diferentes). */
const frame = (name: string) => screen.getByRole("group", { name });
/** Espera o cartão do atalho virar o carrossel, já com os slides. */
const loaded = (name: string) =>
  waitFor(() => {
    const element = frame(name);
    expect(element).toHaveAttribute("aria-roledescription", "carrossel");
    return element;
  });
const bodyCarousel = () => loaded(BODY);
const shopCarousel = () => loaded(SHOP);
/** O cartão do atalho ainda sem carrossel: mostra um estado (carregando, erro ou sem conexão). */
const pending = (name: string) =>
  waitFor(() => {
    const element = frame(name);
    expect(element).not.toHaveAttribute("aria-roledescription");
    return element;
  });
const SERVER_ERROR = () => HttpResponse.json({ code: "X", message: "x" }, { status: 500 });

describe("atalhos do Início: Corpo", () => {
  beforeEach(() => {
    mockSuccessfulLogin("Cliente");
  });

  afterEach(() => {
    onlineManager.setOnline(true);
  });

  it("mostra PGC, peso, massa muscular e pontuação com a variação e a minilinha", async () => {
    mockShortcuts();
    renderShortcuts();

    const carousel = await bodyCarousel();
    expect(carousel).toHaveAttribute("aria-roledescription", "carrossel");
    const slides = within(carousel).getAllByRole("group", { name: /de 4$/ });
    expect(slides).toHaveLength(4);

    expect(slides[0]).toHaveTextContent("Gordura corporal (PGC)");
    expect(slides[0]).toHaveTextContent("19,2%");
    expect(slides[0]).toHaveTextContent("caiu 0,9 pp desde 03/07");
    expect(slides[0]!.querySelector("svg.fb-home-shortcut__spark polyline")).not.toBeNull();
    expect(slides[1]).toHaveTextContent("Peso");
    expect(slides[1]).toHaveTextContent("69,2kg");
    expect(slides[2]).toHaveTextContent("Massa muscular");
    expect(slides[2]).toHaveTextContent("31,5kg");
    expect(slides[2]).toHaveTextContent("subiu 0,3 kg desde 03/07");
    expect(slides[3]).toHaveTextContent("Pontuação InBody");
    expect(slides[3]).toHaveTextContent("77/100");
  });

  it("o toque de cada slide abre a evolução na medida mostrada", async () => {
    const user = userEvent.setup();
    mockShortcuts();
    renderShortcuts();
    const carousel = await bodyCarousel();
    const slides = within(carousel).getAllByRole("group", { name: /de 4$/ });
    const expected = ["bodyFatPercent", "weight", "skeletalMuscleMass", "inbodyScore"];
    for (const [index, measure] of expected.entries()) {
      expect(within(slides[index]!).getByRole("link")).toHaveAttribute(
        "href",
        `/bioimpedancia?aba=evolucao&medida=${measure}`,
      );
    }

    await user.click(within(slides[2]!).getByRole("link"));

    expect(await screen.findByTestId("destino")).toHaveTextContent(
      "/bioimpedancia?aba=evolucao&medida=skeletalMuscleMass",
    );
  });

  it("o rodapé 'Evolução →' abre a evolução", async () => {
    const user = userEvent.setup();
    mockShortcuts();
    renderShortcuts();
    const carousel = await bodyCarousel();

    await user.click(within(carousel).getByRole("link", { name: "Evolução →" }));

    expect(await screen.findByTestId("destino")).toHaveTextContent("/bioimpedancia?aba=evolucao");
  });

  it("sem avaliações e sem autorização: convite para autorizar o registro", async () => {
    const user = userEvent.setup();
    mockShortcuts({ assessments: [], consented: false });
    renderShortcuts();

    const carousel = await bodyCarousel();
    expect(carousel).toHaveTextContent("Acompanhe sua evolução");
    expect(carousel).toHaveTextContent("Peso, músculo e gordura a cada bioimpedância.");
    await user.click(within(carousel).getByRole("link", { name: "Autorizar →" }));
    expect(await screen.findByTestId("destino")).toHaveTextContent("/bioimpedancia");
  });

  it("sem avaliações e com autorização: cartão de primeira avaliação", async () => {
    mockShortcuts({ assessments: [], consented: true });
    renderShortcuts();

    const carousel = await bodyCarousel();
    await waitFor(() => expect(carousel).toHaveTextContent("Sua primeira avaliação"));
    expect(carousel).toHaveTextContent("Faça a bioimpedância na recepção");
    expect(within(carousel).getByRole("link", { name: "Ver composição →" })).toHaveAttribute(
      "href",
      "/bioimpedancia",
    );
  });

  it("com avaliações, não consulta a autorização e segue visível mesmo com o registro desligado", async () => {
    let consentCalls = 0;
    mockShortcuts({ consented: false });
    server.use(
      http.get("/api/bioimpedance/consent", () => {
        consentCalls += 1;
        return HttpResponse.json({ consented: false, manifestation: null, currentVersion: "v1" });
      }),
    );
    renderShortcuts();

    const carousel = await bodyCarousel();
    expect(carousel).toHaveTextContent("19,2%");
    expect(consentCalls).toBe(0);
  });

  it("mostra o carregando próprio enquanto a resposta não chega", async () => {
    mockShortcuts();
    server.use(http.get("/api/bioimpedance/assessments/mine", () => new Promise(() => {})));
    renderShortcuts();

    const placeholder = await pending(BODY);
    expect(within(placeholder).getByRole("status")).toHaveAttribute("aria-busy", "true");
    expect(placeholder).toHaveTextContent("Corpo");
    // A Loja não espera pelo Corpo.
    expect(await shopCarousel()).toHaveTextContent("Camiseta Dry Fit");
  });

  it("no erro, mostra o alerta com 'Tentar novamente', que busca de novo só o Corpo", async () => {
    const user = userEvent.setup();
    let attempts = 0;
    mockShortcuts();
    server.use(
      http.get("/api/bioimpedance/assessments/mine", () => {
        attempts += 1;
        return attempts === 1 ? SERVER_ERROR() : HttpResponse.json(ASSESSMENTS);
      }),
    );
    renderShortcuts();

    const placeholder = await pending(BODY);
    const alert = await within(placeholder).findByRole("alert");
    expect(alert).toHaveTextContent("Não foi possível carregar sua composição corporal.");
    // A Loja não foi afetada.
    expect(await shopCarousel()).toHaveTextContent("Camiseta Dry Fit");

    await user.click(within(alert).getByRole("button", { name: "Tentar novamente" }));

    expect(await bodyCarousel()).toHaveTextContent("19,2");
    expect(within(frame(BODY)).queryByRole("alert")).not.toBeInTheDocument();
  });

  it("erro ao consultar a autorização também fica só no atalho Corpo", async () => {
    mockShortcuts({ assessments: [] });
    server.use(http.get("/api/bioimpedance/consent", SERVER_ERROR));
    renderShortcuts();

    const placeholder = await pending(BODY);
    expect(await within(placeholder).findByRole("alert")).toHaveTextContent(
      "Não foi possível carregar sua composição corporal.",
    );
    expect(await shopCarousel()).toHaveTextContent("Camiseta Dry Fit");
  });

  it("sem conexão, mostra o estado offline e carrega sozinho quando a rede volta", async () => {
    onlineManager.setOnline(false);
    mockShortcuts();
    renderShortcuts();

    const placeholder = await pending(BODY);
    const offline = await waitFor(() => {
      const node = placeholder.querySelector('[data-state="offline"]');
      expect(node).not.toBeNull();
      return node as HTMLElement;
    });
    expect(offline).toHaveTextContent("Sem conexão");
    expect(within(offline).getByRole("button", { name: "Tentar novamente" })).toBeInTheDocument();

    onlineManager.setOnline(true);

    expect(await bodyCarousel()).toHaveTextContent("19,2");
  });
});

describe("atalhos do Início: Loja", () => {
  beforeEach(() => {
    mockSuccessfulLogin("Cliente");
  });

  afterEach(() => {
    onlineManager.setOnline(true);
  });

  it("mostra nome e preço de cada destaque, o selo PROMO e o cartão final 'Ver loja'", async () => {
    mockShortcuts();
    renderShortcuts();

    const carousel = await shopCarousel();
    const slides = within(carousel).getAllByRole("group", { name: /de 4$/ });
    expect(slides).toHaveLength(4);

    expect(slides[0]).toHaveTextContent("Camiseta Dry Fit");
    expect(slides[0]).toHaveTextContent("PROMO");
    expect(slides[0]).toHaveTextContent("R$");
    expect(slides[0]).toHaveTextContent("69,90");
    expect(slides[0]!.querySelector("s")).toHaveTextContent("89,90");
    expect(slides[1]).toHaveTextContent("Garrafa térmica");
    expect(slides[1]).not.toHaveTextContent("PROMO");
    expect(slides[2]).toHaveTextContent("Boné Fitburn");
    expect(slides[2]).toHaveTextContent("ESGOTADO");
    expect(slides[3]).toHaveTextContent("Ver loja →");
  });

  it("mostra no máximo 3 produtos", async () => {
    mockShortcuts({
      products: [...PRODUCTS, product({ id: "p-quarto", name: "Quarto produto" })],
    });
    renderShortcuts();

    const carousel = await shopCarousel();
    expect(within(carousel).getAllByRole("group", { name: /de 4$/ })).toHaveLength(4);
    expect(carousel).not.toHaveTextContent("Quarto produto");
  });

  it("o toque em um produto abre o produto", async () => {
    const user = userEvent.setup();
    mockShortcuts();
    renderShortcuts();
    const carousel = await shopCarousel();
    const slides = within(carousel).getAllByRole("group", { name: /de 4$/ });
    expect(within(slides[1]!).getByRole("link")).toHaveAttribute("href", "/loja/p-garrafa");

    await user.click(within(slides[0]!).getByRole("link"));

    expect(await screen.findByTestId("destino")).toHaveTextContent("/loja/p-camiseta");
  });

  it("o cartão final e o rodapé abrem a loja", async () => {
    const user = userEvent.setup();
    mockShortcuts();
    renderShortcuts();
    const carousel = await shopCarousel();
    const slides = within(carousel).getAllByRole("group", { name: /de 4$/ });
    expect(within(slides[3]!).getByRole("link")).toHaveAttribute("href", "/loja");

    const links = within(carousel).getAllByRole("link", { name: "Ver loja →" });
    await user.click(links[links.length - 1]!);

    expect(await screen.findByTestId("destino")).toHaveTextContent("/loja");
    expect(screen.getByTestId("destino").textContent).not.toContain("/loja/");
  });

  it("navega pelo teclado: a seta leva ao próximo produto e Enter o abre", async () => {
    const user = userEvent.setup();
    mockShortcuts();
    renderShortcuts();
    const carousel = await shopCarousel();
    const slides = within(carousel).getAllByRole("group", { name: /de 4$/ });
    within(slides[0]!).getByRole("link").focus();

    await user.keyboard("{ArrowRight}");
    expect(within(slides[1]!).getByRole("link")).toHaveFocus();
    await user.keyboard("{Enter}");

    expect(await screen.findByTestId("destino")).toHaveTextContent("/loja/p-garrafa");
  });

  it("sem produtos, o atalho some e o Corpo fica sozinho na linha", async () => {
    mockShortcuts({ products: [] });
    const { container } = renderShortcuts();

    await bodyCarousel();
    await waitFor(() => expect(screen.queryByRole("group", { name: SHOP })).not.toBeInTheDocument());
    const row = container.querySelector(".fb-home__shortcuts");
    expect(row?.children).toHaveLength(1);
    expect(row?.firstElementChild).toBe(frame(BODY));
    expect(screen.queryByText("Ver loja →")).not.toBeInTheDocument();
  });

  it("mostra o carregando próprio enquanto a resposta não chega", async () => {
    mockShortcuts();
    server.use(http.get("/api/shop/featured", () => new Promise(() => {})));
    renderShortcuts();

    const placeholder = await pending(SHOP);
    expect(within(placeholder).getByRole("status")).toHaveAttribute("aria-busy", "true");
    // O Corpo não espera pela Loja.
    expect(await bodyCarousel()).toHaveTextContent("19,2%");
  });

  it("no erro, mostra o alerta com 'Tentar novamente' e o Corpo segue inteiro", async () => {
    const user = userEvent.setup();
    let attempts = 0;
    mockShortcuts();
    server.use(
      http.get("/api/shop/featured", () => {
        attempts += 1;
        return attempts === 1 ? SERVER_ERROR() : HttpResponse.json(PRODUCTS);
      }),
    );
    renderShortcuts();

    const placeholder = await pending(SHOP);
    const alert = await within(placeholder).findByRole("alert");
    expect(alert).toHaveTextContent("Não foi possível carregar a loja.");
    expect(await bodyCarousel()).toHaveTextContent("19,2%");

    await user.click(within(alert).getByRole("button", { name: "Tentar novamente" }));

    expect(await shopCarousel()).toHaveTextContent("Camiseta Dry Fit");
  });

  it("sem conexão, mostra o estado offline só na Loja e carrega quando a rede volta", async () => {
    onlineManager.setOnline(false);
    mockShortcuts();
    renderShortcuts();

    const placeholder = await pending(SHOP);
    await waitFor(() => expect(placeholder.querySelector('[data-state="offline"]')).not.toBeNull());
    expect(placeholder.querySelector('[data-state="offline"]')).toHaveTextContent("Sem conexão");

    onlineManager.setOnline(true);

    expect(await shopCarousel()).toHaveTextContent("Camiseta Dry Fit");
  });
});
