import { useEffect, useState } from "react";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import type { WorkoutSheet } from "@fitburn/contracts";
import { AuthProvider, useAuth } from "../src/lib/auth/AuthContext";
import { ClientWorkoutSheetPage } from "../src/pages/ClientWorkoutSheetPage";
import { ClientWorkoutSheetsPage } from "../src/pages/ClientWorkoutSheetsPage";
import { mockSuccessfulLogin } from "./auth-mocks";
import { server } from "./msw-server";

function exercise(
  id: string,
  name: string,
  fields: Partial<WorkoutSheet["exercises"][number]> = {},
) {
  return {
    id,
    name,
    sets: null,
    reps: null,
    load: null,
    duration: null,
    distance: null,
    notes: null,
    ...fields,
  };
}

function sheet(id: string, overrides: Partial<WorkoutSheet> = {}): WorkoutSheet {
  return {
    id,
    clientId: "c-marina",
    title: "Fase 2",
    notes: null,
    status: "ACTIVE",
    authorName: "Rafael",
    createdAt: "2026-09-10T12:00:00.000Z",
    updatedAt: "2026-09-10T12:00:00.000Z",
    exercises: [],
    ...overrides,
  };
}

const FASE_2 = sheet("s-2", {
  title: "Fase 2",
  notes: "Aquecer 10 minutos antes de começar.",
  exercises: [
    exercise("e-1", "Agachamento livre", {
      sets: "4",
      reps: "10",
      load: "40kg",
      notes: "Manter os pés na largura dos ombros.",
    }),
    exercise("e-2", "Prancha", { sets: "3", duration: "45s" }),
    exercise("e-3", "Corrida leve", { distance: "2km" }),
    exercise("e-4", "Alongamento"),
  ],
});
const MOBILIDADE = sheet("s-3", {
  title: "Mobilidade",
  createdAt: "2026-09-12T12:00:00.000Z",
  exercises: [exercise("e-5", "Rotação de quadril")],
});
const FASE_1 = sheet("s-1", {
  title: "Fase 1",
  status: "COMPLETED",
  createdAt: "2026-07-01T12:00:00.000Z",
});
const AVALIACAO = sheet("s-0", {
  title: "Avaliação inicial",
  status: "ARCHIVED",
  createdAt: "2026-06-15T12:00:00.000Z",
});

function LoggedIn({ children }: { children: React.ReactNode }) {
  const { login } = useAuth();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    login("marina@fitburn.local", "SenhaForte123!").then(() => setReady(true));
  }, [login]);

  return ready ? <>{children}</> : null;
}

function renderAt(path: string) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <MemoryRouter initialEntries={[path]}>
          <LoggedIn>
            <Routes>
              <Route path="/ficha-treino" element={<ClientWorkoutSheetsPage />} />
              <Route path="/ficha-treino/:id" element={<ClientWorkoutSheetPage />} />
            </Routes>
          </LoggedIn>
        </MemoryRouter>
      </AuthProvider>
    </QueryClientProvider>,
  );
}

describe("Fichas de treino (cliente)", () => {
  const writes: string[] = [];

  beforeEach(() => {
    writes.length = 0;
    mockSuccessfulLogin("Cliente");
    const all = [FASE_1, FASE_2, AVALIACAO, MOBILIDADE];
    server.use(
      http.get("/api/workout-sheets/mine", () => HttpResponse.json(all)),
      http.get("/api/workout-sheets/mine/:id", ({ params }) => {
        const found = all.find((item) => item.id === params.id);
        return found
          ? HttpResponse.json(found)
          : HttpResponse.json(
              { code: "NOT_FOUND", message: "Ficha de treino não encontrada." },
              { status: 404 },
            );
      }),
      http.all("/api/workout-sheets", ({ request }) => {
        writes.push(request.method);
        return HttpResponse.json({}, { status: 500 });
      }),
    );
  });

  describe("lista", () => {
    it("mostra a ficha ativa com os exercícios e, abaixo, as fichas anteriores com o status de cada uma", async () => {
      renderAt("/ficha-treino");

      expect(
        await screen.findByRole("heading", { level: 1, name: "Ficha de treino" }),
      ).toBeInTheDocument();
      // As duas fichas ativas aparecem inline, cada uma com o seu selo e a autoria.
      expect(await screen.findByRole("heading", { level: 2, name: "Fase 2" })).toBeInTheDocument();
      expect(screen.getByRole("heading", { level: 2, name: "Mobilidade" })).toBeInTheDocument();
      expect(screen.getAllByText("ATIVA")).toHaveLength(2);
      expect(screen.getAllByText(/Montada por Rafael/)).toHaveLength(2);
      expect(screen.getByText(/desde 10\/09\/2026/)).toBeInTheDocument();
      expect(
        screen.getByRole("heading", { level: 3, name: "Agachamento livre" }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("heading", { level: 3, name: "Rotação de quadril" }),
      ).toBeInTheDocument();

      const previous = screen.getByRole("region", { name: "Fichas anteriores" });
      const rows = within(previous).getAllByRole("listitem");
      expect(rows).toHaveLength(2);
      expect(within(rows[0]!).getByText("Fase 1")).toBeInTheDocument();
      expect(within(rows[0]!).getByText("01/07/2026")).toBeInTheDocument();
      expect(within(rows[0]!).getByText("CONCLUÍDA")).toBeInTheDocument();
      expect(within(rows[1]!).getByText("Avaliação inicial")).toBeInTheDocument();
      expect(within(rows[1]!).getByText("ARQUIVADA")).toBeInTheDocument();
    });

    it("as fichas anteriores levam ao detalhe; a ficha ativa já está na página", async () => {
      renderAt("/ficha-treino");

      const previous = await screen.findByRole("region", { name: "Fichas anteriores" });

      expect(within(previous).getByRole("link", { name: /Fase 1/ })).toHaveAttribute(
        "href",
        "/ficha-treino/s-1",
      );
      expect(within(previous).getByRole("link", { name: /Avaliação inicial/ })).toHaveAttribute(
        "href",
        "/ficha-treino/s-0",
      );
      expect(screen.queryByRole("link", { name: /Fase 2/ })).not.toBeInTheDocument();
    });

    it("não oferece nenhuma ação de criar, editar, concluir ou arquivar", async () => {
      renderAt("/ficha-treino");
      await screen.findByRole("heading", { level: 2, name: "Fase 2" });

      for (const name of [
        /nova ficha/i,
        /editar/i,
        /salvar/i,
        /concluir/i,
        /arquivar/i,
        /excluir/i,
      ]) {
        expect(screen.queryByRole("button", { name })).not.toBeInTheDocument();
        expect(screen.queryByRole("link", { name })).not.toBeInTheDocument();
      }
      expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
      expect(writes).toEqual([]);
    });

    it("sem fichas mostra um estado vazio, não um erro", async () => {
      server.use(http.get("/api/workout-sheets/mine", () => HttpResponse.json([])));
      renderAt("/ficha-treino");

      expect(await screen.findByText(/Você ainda não tem fichas de treino/)).toBeInTheDocument();
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    });

    it("só com fichas encerradas, avisa que não há ficha ativa e mostra as anteriores", async () => {
      server.use(http.get("/api/workout-sheets/mine", () => HttpResponse.json([FASE_1])));
      renderAt("/ficha-treino");

      expect(await screen.findByText("Nenhuma ficha ativa no momento.")).toBeInTheDocument();
      expect(screen.getByRole("region", { name: "Fichas anteriores" })).toBeInTheDocument();
    });

    it("mostra um aviso quando não consegue carregar", async () => {
      server.use(
        http.get("/api/workout-sheets/mine", () =>
          HttpResponse.json({ code: "INTERNAL_ERROR", message: "Erro." }, { status: 500 }),
        ),
      );
      renderAt("/ficha-treino");

      expect(await screen.findByRole("alert")).toHaveTextContent(
        "Não foi possível carregar as suas fichas.",
      );
    });
  });

  describe("detalhe", () => {
    it("mostra o título, o status, quem montou, as observações e os exercícios na ordem", async () => {
      renderAt("/ficha-treino/s-2");

      expect(await screen.findByRole("heading", { level: 2, name: "Fase 2" })).toBeInTheDocument();
      expect(screen.getByText("ATIVA")).toBeInTheDocument();
      expect(screen.getByText(/Montada por Rafael/)).toBeInTheDocument();
      expect(screen.getByText("Aquecer 10 minutos antes de começar.")).toBeInTheDocument();

      const items = within(screen.getByRole("list", { name: "Exercícios" })).getAllByRole(
        "listitem",
      );
      expect(items.map((item) => within(item).getByRole("heading").textContent)).toEqual([
        "Agachamento livre",
        "Prancha",
        "Corrida leve",
        "Alongamento",
      ]);
    });

    it("mostra só os campos preenchidos de cada exercício, com as observações do professor", async () => {
      renderAt("/ficha-treino/s-2");
      await screen.findByRole("heading", { name: "Fase 2" });
      const items = within(screen.getByRole("list", { name: "Exercícios" })).getAllByRole(
        "listitem",
      );

      const squat = items[0]!;
      expect(within(squat).getByText("Séries").nextSibling).toHaveTextContent("4");
      expect(within(squat).getByText("Repetições").nextSibling).toHaveTextContent("10");
      expect(within(squat).getByText("Carga").nextSibling).toHaveTextContent("40kg");
      expect(within(squat).queryByText("Tempo")).not.toBeInTheDocument();
      expect(within(squat).getByText(/Manter os pés na largura dos ombros\./)).toBeInTheDocument();

      const plank = items[1]!;
      expect(within(plank).getByText("Tempo").nextSibling).toHaveTextContent("45s");
      expect(within(plank).queryByText("Carga")).not.toBeInTheDocument();
      expect(within(items[2]!).getByText("Distância").nextSibling).toHaveTextContent("2km");
      expect(within(items[3]!).queryByText("Séries")).not.toBeInTheDocument();
    });

    it("não oferece nenhuma ação de edição e volta para a lista", async () => {
      renderAt("/ficha-treino/s-2");
      await screen.findByRole("heading", { name: "Fase 2" });

      expect(screen.queryByRole("button")).not.toBeInTheDocument();
      expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
      expect(screen.getByRole("link", { name: /Fichas de treino/ })).toHaveAttribute(
        "href",
        "/ficha-treino",
      );
    });

    it("uma ficha concluída ou arquivada continua legível, com o seu status", async () => {
      renderAt("/ficha-treino/s-0");

      expect(await screen.findByRole("heading", { name: "Avaliação inicial" })).toBeInTheDocument();
      expect(screen.getByText("ARQUIVADA")).toBeInTheDocument();
    });

    it("ficha inexistente mostra uma mensagem clara", async () => {
      renderAt("/ficha-treino/nao-existe");

      expect(await screen.findByText("Ficha de treino não encontrada.")).toBeInTheDocument();
    });

    it("permite navegar da lista até o detalhe de uma ficha anterior", async () => {
      const user = userEvent.setup();
      renderAt("/ficha-treino");

      const previous = await screen.findByRole("region", { name: "Fichas anteriores" });
      await user.click(within(previous).getByRole("link", { name: /Avaliação inicial/ }));

      expect(
        await screen.findByRole("heading", { level: 1, name: "Ficha de treino" }),
      ).toBeInTheDocument();
      expect(
        await screen.findByRole("heading", { level: 2, name: "Avaliação inicial" }),
      ).toBeInTheDocument();
      expect(screen.getByText("ARQUIVADA")).toBeInTheDocument();
    });
  });
});
