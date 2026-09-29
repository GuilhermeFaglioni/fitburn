import { useEffect, useState } from "react";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import { MemoryRouter } from "react-router-dom";
import {
  addDays,
  gymDateTimeToUtc,
  gymToday,
  PermissionAction,
  PermissionScope,
  startOfWeek,
  type AdminReservationDetail,
  type ClientAgendaItem,
  type ReservationClientOption,
  type ReservationPreview,
} from "@fitburn/contracts";
import { AuthProvider, useAuth } from "../src/lib/auth/AuthContext";
import { ReservasAdminPage } from "../src/pages/ReservasAdminPage";
import { mockSuccessfulLogin } from "./auth-mocks";
import { server } from "./msw-server";

const TODAY = gymToday();

function LoggedIn({ children }: { children: React.ReactNode }) {
  const { login } = useAuth();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    login("admin@fitburn.local", "SenhaForte123!").then(() => setReady(true));
  }, [login]);

  return ready ? <>{children}</> : null;
}

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <MemoryRouter initialEntries={["/reservas-administrativas"]}>
          <LoggedIn>
            <ReservasAdminPage />
          </LoggedIn>
        </MemoryRouter>
      </AuthProvider>
    </QueryClientProvider>,
  );
}

const CLIENTS: ReservationClientOption[] = [
  { id: "c-marina", fullName: "Marina Souza", email: "marina@email.com" },
  { id: "c-rafael", fullName: "Rafael Andrade", email: "rafael@email.com" },
];

function occurrence(id: string, name: string, time: string, available: number): ClientAgendaItem {
  const startsAt = gymDateTimeToUtc(addDays(TODAY, 1), time);
  return {
    id,
    name,
    description: null,
    modality: { id: "mod-1", name },
    instructor: null,
    startsAt: startsAt.toISOString(),
    endsAt: new Date(startsAt.getTime() + 60 * 60_000).toISOString(),
    durationMinutes: 60,
    capacity: 14,
    available,
    myReservationId: null,
  };
}

const AGENDA = [
  occurrence("o-funcional", "Treino Funcional", "18:00", 6),
  occurrence("o-muay", "Muay Thai", "19:00", 0),
  occurrence("o-yoga", "Yoga", "07:00", 10),
];

function reservation(
  id: string,
  overrides: Partial<AdminReservationDetail> = {},
): AdminReservationDetail {
  const startsAt = gymDateTimeToUtc(TODAY, "23:00");
  return {
    id,
    status: "CONFIRMED",
    occurrence: {
      id: "o-today",
      name: "Treino Funcional",
      modality: { id: "mod-1", name: "Treino Funcional" },
      instructor: null,
      startsAt: new Date(Date.now() + 5 * 60 * 60_000).toISOString(),
      endsAt: new Date(startsAt.getTime() + 60 * 60_000).toISOString(),
      durationMinutes: 60,
      status: "SCHEDULED",
    },
    createdAt: "2026-09-20T10:00:00.000Z",
    cancelledAt: null,
    client: {
      id: "c-marina",
      fullName: "Marina Souza",
      email: "marina@email.com",
      status: "ACTIVE",
    },
    createdBy: { id: "user-1", fullName: "Alice Admin", kind: "STAFF" },
    cancelledBy: null,
    ...overrides,
  };
}

const RESERVATIONS: AdminReservationDetail[] = [
  reservation("r-1"),
  reservation("r-2", {
    client: {
      id: "c-rafael",
      fullName: "Rafael Andrade",
      email: "rafael@email.com",
      status: "ACTIVE",
    },
    createdBy: { id: "c-rafael", fullName: "Rafael Andrade", kind: "CLIENT" },
  }),
  reservation("r-3", {
    status: "CANCELLED",
    cancelledAt: "2026-09-21T10:00:00.000Z",
    cancelledBy: { id: "user-1", fullName: "Alice Admin", kind: "STAFF" },
  }),
];

const AVAILABLE: ReservationPreview = {
  canBook: true,
  capacity: 14,
  availableSpots: 6,
  reason: null,
};

describe("Reservas administrativas (equipe)", () => {
  const listRequests: string[] = [];
  const previewRequests: string[] = [];
  const posts: Array<{ url: string; key: string | null; body: unknown }> = [];
  let previewFor: (url: URL) => ReservationPreview;

  beforeEach(() => {
    listRequests.length = 0;
    previewRequests.length = 0;
    posts.length = 0;
    previewFor = () => AVAILABLE;
    mockSuccessfulLogin("Administrador");
    server.use(
      http.get("/api/admin/reservations/preview", ({ request }) => {
        const url = new URL(request.url);
        previewRequests.push(url.search);
        return HttpResponse.json(previewFor(url));
      }),
      http.get("/api/admin/reservations", ({ request }) => {
        const url = new URL(request.url);
        listRequests.push(url.search);
        const clientId = url.searchParams.get("clientId");
        const status = url.searchParams.get("status");
        return HttpResponse.json(
          RESERVATIONS.filter(
            (item) =>
              (!clientId || item.client.id === clientId) && (!status || item.status === status),
          ),
        );
      }),
      // O seletor e o filtro usam a busca das Reservas: quem só tem esse módulo não vê /api/clients.
      http.get("/api/admin/reservations/clients", () => HttpResponse.json(CLIENTS)),
      http.get("/api/clients", () =>
        HttpResponse.json(
          { code: "FORBIDDEN", message: "Você não tem permissão para executar esta ação." },
          { status: 403 },
        ),
      ),
      http.get("/api/agenda", () => HttpResponse.json(AGENDA)),
      http.post("/api/admin/reservations", async ({ request }) => {
        posts.push({
          url: new URL(request.url).pathname,
          key: request.headers.get("Idempotency-Key"),
          body: await request.json(),
        });
        return HttpResponse.json(reservation("r-new"), { status: 201 });
      }),
    );
  });

  describe("consulta", () => {
    it("lista cliente, aula, horário, estado e quem criou e cancelou", async () => {
      renderPage();

      const marina = (await screen.findAllByText("Marina Souza"))
        .map((element) => element.closest("tr"))
        .find(
          (row): row is HTMLTableRowElement =>
            row !== null && row.textContent!.includes("CONFIRMADA"),
        )!;
      expect(within(marina).getByText("Treino Funcional")).toBeInTheDocument();
      expect(within(marina).getByText("CONFIRMADA")).toBeInTheDocument();
      expect(within(marina).getByText(/Criada por Alice Admin \(equipe\)/)).toBeInTheDocument();

      const rafael = screen.getByText("Rafael Andrade", { selector: "td" }).closest("tr")!;
      expect(within(rafael).getByText(/Criada por Rafael Andrade \(cliente\)/)).toBeInTheDocument();

      const cancelled = screen.getByText("CANCELADA").closest("tr")!;
      expect(
        within(cancelled).getByText(/Cancelada por Alice Admin \(equipe\)/),
      ).toBeInTheDocument();
      expect(within(cancelled).queryByRole("button", { name: /Remarcar/ })).not.toBeInTheDocument();
    });

    it("filtra por cliente, estado e período na API (hoje por padrão)", async () => {
      const user = userEvent.setup();
      renderPage();
      await screen.findByText("CANCELADA");
      expect(listRequests[0]).toBe(`?from=${TODAY}&to=${TODAY}`);

      await user.selectOptions(screen.getByLabelText("Cliente"), "c-rafael");
      await waitFor(() => expect(screen.queryByText("CANCELADA")).not.toBeInTheDocument());
      expect(listRequests[listRequests.length - 1]).toBe(
        `?clientId=c-rafael&from=${TODAY}&to=${TODAY}`,
      );

      await user.selectOptions(screen.getByLabelText("Cliente"), "");
      await user.selectOptions(screen.getByLabelText("Status"), "CANCELLED");
      await waitFor(() => expect(screen.queryByText("CONFIRMADA")).not.toBeInTheDocument());
      expect(listRequests[listRequests.length - 1]).toBe(
        `?status=CANCELLED&from=${TODAY}&to=${TODAY}`,
      );

      await user.selectOptions(screen.getByLabelText("Status"), "");
      await user.selectOptions(screen.getByLabelText("Período"), "week");
      const weekStart = startOfWeek(TODAY);
      await waitFor(() =>
        expect(listRequests[listRequests.length - 1]).toBe(
          `?from=${weekStart}&to=${addDays(weekStart, 6)}`,
        ),
      );

      await user.selectOptions(screen.getByLabelText("Período"), "all");
      await waitFor(() => expect(listRequests[listRequests.length - 1]).toBe(""));
    });

    it("avisa quando nenhuma reserva é encontrada", async () => {
      server.use(http.get("/api/admin/reservations", () => HttpResponse.json([])));
      renderPage();

      expect(await screen.findByText("Nenhuma reserva encontrada.")).toBeInTheDocument();
    });
  });

  describe("nova reserva em nome do cliente", () => {
    async function openNewReservation() {
      const user = userEvent.setup();
      renderPage();
      await screen.findByText("CANCELADA");
      await user.click(screen.getByRole("button", { name: "+ Nova reserva" }));
      const dialog = await screen.findByRole("dialog", { name: "Nova reserva (administrativa)" });
      return { user, dialog };
    }

    it("destaca o cliente selecionado e mostra a prévia de vaga antes de confirmar", async () => {
      const { user, dialog } = await openNewReservation();

      await user.selectOptions(await within(dialog).findByLabelText("Cliente"), "c-marina");
      expect(within(dialog).getByText("Reservando em nome de")).toBeInTheDocument();
      expect(within(dialog).getByText("marina@email.com")).toBeInTheDocument();

      await user.selectOptions(within(dialog).getByLabelText("Aula"), "o-funcional");

      expect(await within(dialog).findByText(/Vaga disponível/)).toBeInTheDocument();
      expect(previewRequests[previewRequests.length - 1]).toBe(
        "?clientId=c-marina&occurrenceId=o-funcional",
      );
      expect(within(dialog).getByRole("button", { name: "Confirmar reserva" })).toBeEnabled();
    });

    it("mostra a prévia de recusa (aula cheia) e não deixa confirmar", async () => {
      previewFor = () => ({
        canBook: false,
        capacity: 14,
        availableSpots: 0,
        reason: {
          code: "CLASS_FULL",
          message: "Essa aula ficou lotada enquanto você confirmava. Escolha outro horário.",
          details: { currentAvailableSpots: 0 },
        },
      });
      const { user, dialog } = await openNewReservation();

      await user.selectOptions(await within(dialog).findByLabelText("Cliente"), "c-marina");
      await user.selectOptions(within(dialog).getByLabelText("Aula"), "o-muay");

      const alert = await within(dialog).findByRole("alert");
      expect(alert).toHaveTextContent("Aula cheia.");
      expect(alert).toHaveTextContent("Todas as 14 vagas de Muay Thai já estão ocupadas");
      expect(within(dialog).getByRole("button", { name: "Confirmar reserva" })).toBeDisabled();
      expect(posts).toHaveLength(0);
    });

    it("explica cada motivo de recusa da prévia em termos da equipe", async () => {
      const refusal = (code: string, details?: unknown): ReservationPreview => ({
        canBook: false,
        capacity: 14,
        availableSpots: 3,
        reason: { code, message: "mensagem do servidor", details },
      });
      const { user, dialog } = await openNewReservation();
      await user.selectOptions(await within(dialog).findByLabelText("Cliente"), "c-marina");

      previewFor = () => refusal("DUPLICATE_RESERVATION");
      await user.selectOptions(within(dialog).getByLabelText("Aula"), "o-funcional");
      expect(await within(dialog).findByRole("alert")).toHaveTextContent(
        "Este cliente já possui uma reserva confirmada para esta aula.",
      );

      previewFor = () =>
        refusal("SCHEDULE_CONFLICT", {
          reservation: reservation("r-x", {
            occurrence: { ...RESERVATIONS[0].occurrence, name: "Spinning" },
          }),
        });
      await user.selectOptions(within(dialog).getByLabelText("Aula"), "o-yoga");
      await waitFor(() =>
        expect(within(dialog).getByRole("alert")).toHaveTextContent("Conflito de horário."),
      );
      expect(within(dialog).getByRole("alert")).toHaveTextContent("Spinning");

      previewFor = () => refusal("USER_INACTIVE");
      await user.selectOptions(within(dialog).getByLabelText("Aula"), "o-funcional");
      await waitFor(() =>
        expect(within(dialog).getByRole("alert")).toHaveTextContent("Cliente inativo."),
      );

      previewFor = () => refusal("OCCURRENCE_NOT_BOOKABLE");
      await user.selectOptions(within(dialog).getByLabelText("Aula"), "o-yoga");
      await waitFor(() =>
        expect(within(dialog).getByRole("alert")).toHaveTextContent("Aula indisponível."),
      );
    });

    it("confirma em nome do cliente com Idempotency-Key e atualiza a lista", async () => {
      const { user, dialog } = await openNewReservation();
      await user.selectOptions(await within(dialog).findByLabelText("Cliente"), "c-marina");
      await user.selectOptions(within(dialog).getByLabelText("Aula"), "o-funcional");
      await within(dialog).findByText(/Vaga disponível/);
      const listCalls = listRequests.length;

      await user.click(within(dialog).getByRole("button", { name: "Confirmar reserva" }));

      await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
      expect(posts).toHaveLength(1);
      expect(posts[0].body).toEqual({ clientId: "c-marina", occurrenceId: "o-funcional" });
      expect(posts[0].key).toMatch(/^[0-9a-f-]{36}$/);
      expect(screen.getByRole("status")).toHaveTextContent("Reserva criada para Marina Souza.");
      await waitFor(() => expect(listRequests.length).toBeGreaterThan(listCalls));
    });

    it("mostra o erro específico quando o servidor recusa e usa uma chave nova ao tentar de novo", async () => {
      let attempts = 0;
      server.use(
        http.post("/api/admin/reservations", async ({ request }) => {
          posts.push({
            url: new URL(request.url).pathname,
            key: request.headers.get("Idempotency-Key"),
            body: await request.json(),
          });
          attempts += 1;
          return attempts === 1
            ? HttpResponse.json(
                {
                  code: "CLASS_FULL",
                  message: "Essa aula ficou lotada enquanto você confirmava.",
                  details: { currentAvailableSpots: 0 },
                },
                { status: 409 },
              )
            : HttpResponse.json(reservation("r-new"), { status: 201 });
        }),
      );
      const { user, dialog } = await openNewReservation();
      await user.selectOptions(await within(dialog).findByLabelText("Cliente"), "c-marina");
      await user.selectOptions(within(dialog).getByLabelText("Aula"), "o-funcional");
      await within(dialog).findByText(/Vaga disponível/);

      await user.click(within(dialog).getByRole("button", { name: "Confirmar reserva" }));

      expect(await within(dialog).findByRole("alert")).toHaveTextContent("Aula cheia.");
      expect(screen.getByRole("dialog")).toBeInTheDocument();

      await user.click(within(dialog).getByRole("button", { name: "Confirmar reserva" }));
      await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
      expect(posts).toHaveLength(2);
      // O servidor memoriza a recusa por (cliente, chave): repetir a chave repetiria a recusa antiga.
      expect(posts[1].key).not.toBe(posts[0].key);
    });

    it("depois de uma falha sem resposta do servidor (erro 500), a nova tentativa reaproveita a chave", async () => {
      let attempts = 0;
      server.use(
        http.post("/api/admin/reservations", async ({ request }) => {
          posts.push({
            url: new URL(request.url).pathname,
            key: request.headers.get("Idempotency-Key"),
            body: await request.json(),
          });
          attempts += 1;
          return attempts === 1
            ? HttpResponse.json({}, { status: 500 })
            : HttpResponse.json(reservation("r-new"), { status: 201 });
        }),
      );
      const { user, dialog } = await openNewReservation();
      await user.selectOptions(await within(dialog).findByLabelText("Cliente"), "c-marina");
      await user.selectOptions(within(dialog).getByLabelText("Aula"), "o-funcional");
      await within(dialog).findByText(/Vaga disponível/);

      await user.click(within(dialog).getByRole("button", { name: "Confirmar reserva" }));
      expect(await within(dialog).findByRole("alert")).toBeInTheDocument();
      await user.click(within(dialog).getByRole("button", { name: "Confirmar reserva" }));

      await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
      expect(posts).toHaveLength(2);
      expect(posts[1].key).toBe(posts[0].key);
    });

    it("o seletor de clientes usa a busca das Reservas (não exige o módulo Clientes)", async () => {
      const { user, dialog } = await openNewReservation();

      const select = await within(dialog).findByLabelText("Cliente");
      const options = within(select).getAllByRole("option").map((option) => option.textContent);

      expect(options).toEqual(["Selecione o cliente", "Marina Souza", "Rafael Andrade"]);
      expect(within(dialog).queryByText(/Não foi possível carregar os clientes/)).toBeNull();
      await user.selectOptions(select, "c-rafael");
      expect(within(dialog).getByText("rafael@email.com")).toBeInTheDocument();
    });

    it("trocar cliente ou aula é outra intenção: gera outra chave", async () => {
      const { user, dialog } = await openNewReservation();
      await user.selectOptions(await within(dialog).findByLabelText("Cliente"), "c-marina");
      await user.selectOptions(within(dialog).getByLabelText("Aula"), "o-funcional");
      await within(dialog).findByText(/Vaga disponível/);
      await user.click(within(dialog).getByRole("button", { name: "Confirmar reserva" }));
      await waitFor(() => expect(posts).toHaveLength(1));

      await user.click(screen.getByRole("button", { name: "+ Nova reserva" }));
      const again = await screen.findByRole("dialog", { name: "Nova reserva (administrativa)" });
      await user.selectOptions(await within(again).findByLabelText("Cliente"), "c-marina");
      await user.selectOptions(within(again).getByLabelText("Aula"), "o-funcional");
      await within(again).findByText(/Vaga disponível/);
      await user.click(within(again).getByRole("button", { name: "Confirmar reserva" }));

      await waitFor(() => expect(posts).toHaveLength(2));
      expect(posts[1].key).not.toBe(posts[0].key);
    });
  });

  describe("cancelar e remarcar", () => {
    it("cancela em nome do cliente depois de confirmar", async () => {
      const cancels: string[] = [];
      server.use(
        http.post("/api/admin/reservations/:id/cancel", ({ params }) => {
          cancels.push(String(params.id));
          return HttpResponse.json(reservation("r-1", { status: "CANCELLED" }));
        }),
      );
      const user = userEvent.setup();
      renderPage();
      await screen.findByText("CANCELADA");

      await user.click(screen.getByRole("button", { name: "Cancelar reserva de Marina Souza" }));
      const dialog = await screen.findByRole("dialog", { name: "Cancelar reserva" });
      expect(dialog).toHaveTextContent("Marina Souza");
      expect(cancels).toHaveLength(0);

      await user.click(within(dialog).getByRole("button", { name: "Confirmar cancelamento" }));

      await waitFor(() => expect(cancels).toEqual(["r-1"]));
      await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
      expect(screen.getByRole("status")).toHaveTextContent("Reserva cancelada.");
    });

    it("mostra o erro específico quando o cancelamento é recusado", async () => {
      server.use(
        http.post("/api/admin/reservations/:id/cancel", () =>
          HttpResponse.json(
            {
              code: "CANCELLATION_WINDOW_CLOSED",
              message: "Não é mais possível cancelar: a aula já começou.",
            },
            { status: 409 },
          ),
        ),
      );
      const user = userEvent.setup();
      renderPage();
      await screen.findByText("CANCELADA");

      await user.click(screen.getByRole("button", { name: "Cancelar reserva de Marina Souza" }));
      const dialog = await screen.findByRole("dialog", { name: "Cancelar reserva" });
      await user.click(within(dialog).getByRole("button", { name: "Confirmar cancelamento" }));

      expect(await within(dialog).findByRole("alert")).toHaveTextContent(
        "Não é mais possível cancelar: a aula já começou.",
      );
    });

    it("remarca com prévia que ignora a reserva original", async () => {
      const reschedules: Array<{ id: string; key: string | null; body: unknown }> = [];
      server.use(
        http.post("/api/admin/reservations/:id/reschedule", async ({ params, request }) => {
          reschedules.push({
            id: String(params.id),
            key: request.headers.get("Idempotency-Key"),
            body: await request.json(),
          });
          return HttpResponse.json(reservation("r-new"), { status: 201 });
        }),
      );
      const user = userEvent.setup();
      renderPage();
      await screen.findByText("CANCELADA");

      await user.click(screen.getByRole("button", { name: "Remarcar reserva de Marina Souza" }));
      const dialog = await screen.findByRole("dialog", { name: "Remarcar reserva" });
      // O cliente não muda numa remarcação: fica destacado, sem seletor.
      expect(within(dialog).getByText("Marina Souza")).toBeInTheDocument();
      expect(within(dialog).queryByLabelText("Cliente")).not.toBeInTheDocument();

      await user.selectOptions(await within(dialog).findByLabelText("Nova aula"), "o-yoga");
      await within(dialog).findByText(/Vaga disponível/);
      expect(previewRequests[previewRequests.length - 1]).toBe(
        "?clientId=c-marina&occurrenceId=o-yoga&replacingReservationId=r-1",
      );

      await user.click(within(dialog).getByRole("button", { name: "Confirmar remarcação" }));

      await waitFor(() => expect(reschedules).toHaveLength(1));
      expect(reschedules[0]).toMatchObject({ id: "r-1", body: { occurrenceId: "o-yoga" } });
      expect(reschedules[0].key).toMatch(/^[0-9a-f-]{36}$/);
      await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
      expect(screen.getByRole("status")).toHaveTextContent("Reserva remarcada.");
    });

    it("recusa na remarcação: a nova tentativa usa outra chave e a original continua confirmada", async () => {
      const keys: Array<string | null> = [];
      let attempts = 0;
      server.use(
        http.post("/api/admin/reservations/:id/reschedule", ({ request }) => {
          keys.push(request.headers.get("Idempotency-Key"));
          attempts += 1;
          return attempts === 1
            ? HttpResponse.json(
                { code: "CLASS_FULL", message: "Essa aula ficou lotada.", details: {} },
                { status: 409 },
              )
            : HttpResponse.json(reservation("r-new"), { status: 201 });
        }),
      );
      const user = userEvent.setup();
      renderPage();
      await screen.findByText("CANCELADA");
      await user.click(screen.getByRole("button", { name: "Remarcar reserva de Marina Souza" }));
      const dialog = await screen.findByRole("dialog", { name: "Remarcar reserva" });
      await user.selectOptions(await within(dialog).findByLabelText("Nova aula"), "o-yoga");
      await within(dialog).findByText(/Vaga disponível/);

      await user.click(within(dialog).getByRole("button", { name: "Confirmar remarcação" }));
      expect(await within(dialog).findByRole("alert")).toHaveTextContent(
        "A reserva original continua confirmada.",
      );
      await user.click(within(dialog).getByRole("button", { name: "Confirmar remarcação" }));

      await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
      expect(keys).toHaveLength(2);
      expect(keys[1]).not.toBe(keys[0]);
    });
  });

  describe("reserva de cliente excluído", () => {
    const DELETED_CLIENT = {
      id: "c-gone",
      fullName: "Usuário excluído",
      email: "excluido-c-gone@anonimizado.invalid",
      status: "DELETED" as const,
    };

    it("não oferece Remarcar (só Cancelar) para a reserva de um cliente excluído", async () => {
      server.use(
        http.get("/api/admin/reservations", () =>
          HttpResponse.json([
            reservation("r-gone", { client: DELETED_CLIENT }),
            reservation("r-1"),
          ]),
        ),
      );
      renderPage();

      const gone = (await screen.findByText("Usuário excluído", { selector: "td" })).closest("tr")!;
      expect(within(gone).queryByRole("button", { name: /Remarcar/ })).not.toBeInTheDocument();
      expect(
        within(gone).getByRole("button", { name: "Cancelar reserva de Usuário excluído" }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "Remarcar reserva de Marina Souza" }),
      ).toBeInTheDocument();
    });

    it("explica a recusa por cliente excluído sem pedir para reativar o cadastro", async () => {
      previewFor = () => ({
        canBook: false,
        capacity: 14,
        availableSpots: 6,
        reason: {
          code: "USER_ALREADY_DELETED",
          message: "O cadastro deste cliente foi excluído. Não é possível reservar em nome dele.",
        },
      });
      const user = userEvent.setup();
      renderPage();
      await screen.findByText("CANCELADA");
      await user.click(screen.getByRole("button", { name: "+ Nova reserva" }));
      const dialog = await screen.findByRole("dialog", { name: "Nova reserva (administrativa)" });
      await user.selectOptions(await within(dialog).findByLabelText("Cliente"), "c-marina");
      await user.selectOptions(within(dialog).getByLabelText("Aula"), "o-funcional");

      const alert = await within(dialog).findByRole("alert");
      expect(alert).toHaveTextContent("Cliente excluído.");
      expect(alert).not.toHaveTextContent(/reative/i);
    });
  });

  describe("permissões", () => {
    it("bloqueia criar, cancelar e remarcar sem as ações do módulo Reservas", async () => {
      mockSuccessfulLogin("Professor", [
        {
          module: "RESERVAS",
          actions: [PermissionAction.VIEW],
          scope: PermissionScope.ASSIGNED_CLIENTS,
        },
      ]);
      renderPage();
      await screen.findByText("CANCELADA");

      expect(screen.getByRole("button", { name: "+ Nova reserva" })).toBeDisabled();
      expect(
        screen.getByRole("button", { name: "Cancelar reserva de Marina Souza" }),
      ).toBeDisabled();
      expect(
        screen.getByRole("button", { name: "Remarcar reserva de Marina Souza" }),
      ).toBeDisabled();
    });
  });
});
