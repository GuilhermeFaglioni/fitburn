import { useEffect, useState } from "react";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import { MemoryRouter } from "react-router-dom";
import {
  Module,
  PermissionAction,
  PermissionScope,
  addDays,
  gymDateTimeToUtc,
  gymToday,
  startOfWeek,
  type ClassTemplateDetail,
  type OccurrenceDetail,
} from "@fitburn/contracts";
import { AuthProvider, useAuth } from "../src/lib/auth/AuthContext";
import { AgendaAdminPage } from "../src/pages/AgendaAdminPage";
import { mockSuccessfulLogin } from "./auth-mocks";
import { server } from "./msw-server";

const TEMPLATE: ClassTemplateDetail = {
  id: "tpl-funcional",
  name: "Treino Funcional",
  description: null,
  durationMinutes: 60,
  capacity: 10,
  isActive: true,
  modality: { id: "mod-funcional", name: "Treino Funcional" },
  defaultInstructor: { id: "user-rafael", fullName: "Rafael Andrade" },
};

const WEEK_START = startOfWeek(gymToday());
const WEDNESDAY = addDays(WEEK_START, 2);

function occurrenceAt(
  date: string,
  time: string,
  overrides: Partial<OccurrenceDetail> = {},
): OccurrenceDetail {
  const startsAt = gymDateTimeToUtc(date, time);
  return {
    id: `occ-${date}-${time}`,
    templateId: TEMPLATE.id,
    seriesId: null,
    name: TEMPLATE.name,
    description: null,
    modality: TEMPLATE.modality,
    instructor: TEMPLATE.defaultInstructor,
    startsAt: startsAt.toISOString(),
    endsAt: new Date(startsAt.getTime() + 60 * 60_000).toISOString(),
    durationMinutes: 60,
    capacity: 10,
    bookedCount: 0,
    status: "SCHEDULED",
    ...overrides,
  };
}

function LoggedInPage() {
  const { login } = useAuth();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    login("admin@fitburn.local", "SenhaForte123!").then(() => setReady(true));
  }, [login]);

  if (!ready) return null;
  return <AgendaAdminPage />;
}

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <MemoryRouter initialEntries={["/agenda-administrativa"]}>
          <LoggedInPage />
        </MemoryRouter>
      </AuthProvider>
    </QueryClientProvider>,
  );
}

describe("AgendaAdminPage", () => {
  beforeEach(() => {
    mockSuccessfulLogin("Administrador");
    server.use(
      http.get("/api/occurrences/options", () =>
        HttpResponse.json({
          templates: [TEMPLATE],
          instructors: [
            { id: "user-rafael", fullName: "Rafael Andrade" },
            { id: "user-camila", fullName: "Camila Rocha" },
          ],
        }),
      ),
    );
  });

  it("cria uma ocorrência e ela aparece na grade da semana", async () => {
    let occurrences: OccurrenceDetail[] = [];
    let sentBody: Record<string, unknown> | null = null;
    server.use(
      http.get("/api/occurrences", () => HttpResponse.json(occurrences)),
      http.post("/api/occurrences", async ({ request }) => {
        sentBody = (await request.json()) as Record<string, unknown>;
        const created = occurrenceAt(sentBody.date as string, sentBody.startTime as string);
        occurrences = [created];
        return HttpResponse.json(created, { status: 201 });
      }),
    );

    renderPage();
    const user = userEvent.setup();

    await user.click(await screen.findByRole("button", { name: "+ Nova aula" }));
    const dialog = screen.getByRole("dialog", { name: "Nova aula" });
    await user.selectOptions(within(dialog).getByLabelText("Modalidade / template"), TEMPLATE.id);
    fireEvent.change(within(dialog).getByLabelText("Data"), { target: { value: WEDNESDAY } });
    fireEvent.change(within(dialog).getByLabelText("Horário"), { target: { value: "18:00" } });
    await user.click(within(dialog).getByRole("button", { name: "Salvar" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    const chip = await screen.findByRole("button", { name: /18h00.*Treino Funcional/ });
    expect(chip).toHaveTextContent("Prof. Rafael · 0/10");
    expect(sentBody).toMatchObject({
      templateId: TEMPLATE.id,
      date: WEDNESDAY,
      startTime: "18:00",
      instructorId: "user-rafael",
      capacity: 10,
    });
  });

  it("mostra os horários em conflito quando a aula se sobrepõe a outra", async () => {
    const existing = occurrenceAt(WEDNESDAY, "18:00");
    server.use(
      http.get("/api/occurrences", () => HttpResponse.json([existing])),
      http.post("/api/occurrences", () =>
        HttpResponse.json(
          {
            code: "OCCURRENCE_OVERLAP",
            message: "O horário se sobrepõe a outra aula — o espaço é exclusivo.",
            details: {
              conflicts: [
                {
                  id: existing.id,
                  name: existing.name,
                  startsAt: existing.startsAt,
                  endsAt: existing.endsAt,
                },
              ],
            },
          },
          { status: 409 },
        ),
      ),
    );

    renderPage();
    const user = userEvent.setup();

    await user.click(await screen.findByRole("button", { name: "+ Nova aula" }));
    const dialog = screen.getByRole("dialog", { name: "Nova aula" });
    await user.selectOptions(within(dialog).getByLabelText("Modalidade / template"), TEMPLATE.id);
    fireEvent.change(within(dialog).getByLabelText("Data"), { target: { value: WEDNESDAY } });
    fireEvent.change(within(dialog).getByLabelText("Horário"), { target: { value: "18:30" } });
    await user.click(within(dialog).getByRole("button", { name: "Salvar" }));

    const alert = await within(dialog).findByRole("alert");
    expect(alert).toHaveTextContent("O horário se sobrepõe a outra aula");
    expect(alert).toHaveTextContent("Treino Funcional · 18h00–19h00");
  });

  it("clicar num espaço vazio do dia abre a nova aula com a data preenchida", async () => {
    server.use(http.get("/api/occurrences", () => HttpResponse.json([])));

    renderPage();
    const user = userEvent.setup();

    const emptySlots = await screen.findAllByRole("button", { name: /^Nova aula em / });
    expect(emptySlots).toHaveLength(7);
    await user.click(emptySlots[2]);

    const dialog = screen.getByRole("dialog", { name: "Nova aula" });
    expect(within(dialog).getByLabelText("Data")).toHaveValue(WEDNESDAY);
  });

  describe("recorrência", () => {
    async function openWeeklyForm() {
      renderPage();
      const user = userEvent.setup();
      await user.click(await screen.findByRole("button", { name: "+ Nova aula" }));
      const dialog = screen.getByRole("dialog", { name: "Nova aula" });
      await user.selectOptions(within(dialog).getByLabelText("Modalidade / template"), TEMPLATE.id);
      fireEvent.change(within(dialog).getByLabelText("Data"), { target: { value: "2026-10-05" } });
      fireEvent.change(within(dialog).getByLabelText("Horário"), { target: { value: "18:00" } });
      await user.selectOptions(within(dialog).getByLabelText("Recorrência"), "WEEKLY");
      fireEvent.change(within(dialog).getByLabelText("Repetir até"), {
        target: { value: "2026-10-18" },
      });
      await user.click(within(dialog).getByRole("button", { name: "QUA" }));
      return { user, dialog };
    }

    it("mostra o resumo do que será gerado antes de confirmar e envia a recorrência", async () => {
      let sentBody: Record<string, unknown> | null = null;
      server.use(
        http.get("/api/occurrences", () => HttpResponse.json([])),
        http.post("/api/occurrences/recurring", async ({ request }) => {
          sentBody = (await request.json()) as Record<string, unknown>;
          return HttpResponse.json({ seriesId: "series-1", occurrences: [] }, { status: 201 });
        }),
      );

      const { user, dialog } = await openWeeklyForm();
      // A data inicial muda depois de ligar a repetição: o dia pré-selecionado acompanha.
      fireEvent.change(within(dialog).getByLabelText("Data"), { target: { value: "2026-10-05" } });

      const summary = within(dialog).getByText(/Serão criadas 4 aulas/);
      expect(summary).toHaveTextContent("seg 05/10, qua 07/10, seg 12/10, qua 14/10");
      await user.click(within(dialog).getByRole("button", { name: "Salvar" }));

      await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
      expect(sentBody).toMatchObject({
        templateId: TEMPLATE.id,
        weekdays: [1, 3],
        startTime: "18:00",
        startDate: "2026-10-05",
        endDate: "2026-10-18",
      });
    });

    it("exibe todas as datas em conflito quando a recorrência é recusada", async () => {
      const conflictA = occurrenceAt("2026-10-07", "18:30");
      const conflictB = occurrenceAt("2026-10-14", "18:30");
      server.use(
        http.get("/api/occurrences", () => HttpResponse.json([])),
        http.post("/api/occurrences/recurring", () =>
          HttpResponse.json(
            {
              code: "OCCURRENCE_OVERLAP",
              message: "O horário se sobrepõe a outra aula — o espaço é exclusivo.",
              details: {
                conflicts: [conflictA, conflictB].map(({ id, name, startsAt, endsAt }) => ({
                  id,
                  name,
                  startsAt,
                  endsAt,
                })),
              },
            },
            { status: 409 },
          ),
        ),
      );

      const { user, dialog } = await openWeeklyForm();
      await user.click(within(dialog).getByRole("button", { name: "Salvar" }));

      const alert = await within(dialog).findByRole("alert");
      expect(
        within(alert)
          .getAllByRole("listitem")
          .map((item) => item.textContent),
      ).toEqual([
        "Treino Funcional · 18h30–19h30 (qua 07/10)",
        "Treino Funcional · 18h30–19h30 (qua 14/10)",
      ]);
    });
  });

  describe("manutenção", () => {
    it("cancela uma aula depois de confirmar", async () => {
      const occurrence = occurrenceAt(WEDNESDAY, "18:00");
      let cancelledId: string | null = null;
      server.use(
        http.get("/api/occurrences", () =>
          HttpResponse.json([cancelledId ? { ...occurrence, status: "CANCELLED" } : occurrence]),
        ),
        http.post("/api/occurrences/:id/cancel", ({ params }) => {
          cancelledId = params.id as string;
          return HttpResponse.json({ ...occurrence, status: "CANCELLED" }, { status: 201 });
        }),
      );

      renderPage();
      const user = userEvent.setup();

      await user.click(await screen.findByRole("button", { name: /18h00.*Treino Funcional/ }));
      const dialog = screen.getByRole("dialog", { name: "Editar aula" });
      await user.click(within(dialog).getByRole("button", { name: "Cancelar aula" }));

      const confirm = screen.getByRole("dialog", { name: "Cancelar esta aula?" });
      expect(confirm).toHaveTextContent("sai da agenda dos clientes e continua no histórico");
      await user.click(within(confirm).getByRole("button", { name: "Confirmar cancelamento" }));

      await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
      expect(cancelledId).toBe(occurrence.id);
      expect(await screen.findByText("Cancelada")).toBeInTheDocument();
    });

    it("aula com reservas: mostra quantas e bloqueia cancelar, excluir, horário e duração", async () => {
      const occurrence = { ...occurrenceAt(WEDNESDAY, "18:00"), bookedCount: 3, capacity: 12 };
      server.use(http.get("/api/occurrences", () => HttpResponse.json([occurrence])));

      renderPage();
      const user = userEvent.setup();

      const chip = await screen.findByRole("button", { name: /18h00.*Treino Funcional/ });
      expect(chip).toHaveTextContent("3/12");
      await user.click(chip);
      const dialog = screen.getByRole("dialog", { name: "Editar aula" });

      expect(within(dialog).getByRole("note")).toHaveTextContent(
        "Esta aula tem 3 reservas confirmadas: não pode ser cancelada nem excluída, e horário e duração não podem mudar. A capacidade mínima é 3.",
      );
      for (const name of ["Cancelar aula", "Excluir aula"]) {
        const button = within(dialog).getByRole("button", { name });
        expect(button).toBeDisabled();
        expect(button).toHaveAttribute("title", expect.stringContaining("3 reservas confirmadas"));
      }
      expect(within(dialog).getByLabelText("Data")).toBeDisabled();
      expect(within(dialog).getByLabelText("Horário")).toBeDisabled();
      expect(within(dialog).getByLabelText("Duração (min)")).toBeDisabled();
      expect(within(dialog).getByLabelText("Capacidade")).toHaveAttribute("min", "3");
      expect(within(dialog).getByLabelText("Professor")).toBeEnabled();
    });

    it("substitui o professor só desta aula", async () => {
      const occurrence = occurrenceAt(WEDNESDAY, "18:00");
      let sentBody: Record<string, unknown> | null = null;
      server.use(
        http.get("/api/occurrences", () => HttpResponse.json([occurrence])),
        http.patch("/api/occurrences/:id", async ({ request }) => {
          sentBody = (await request.json()) as Record<string, unknown>;
          return HttpResponse.json({
            ...occurrence,
            instructor: { id: "user-camila", fullName: "Camila Rocha" },
          });
        }),
      );

      renderPage();
      const user = userEvent.setup();

      await user.click(await screen.findByRole("button", { name: /18h00.*Treino Funcional/ }));
      const dialog = screen.getByRole("dialog", { name: "Editar aula" });
      expect(within(dialog).getByLabelText("Professor")).toHaveValue("user-rafael");
      await user.selectOptions(within(dialog).getByLabelText("Professor"), "user-camila");
      await user.click(within(dialog).getByRole("button", { name: "Salvar" }));

      await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
      expect(sentBody).toMatchObject({
        instructorId: "user-camila",
        date: WEDNESDAY,
        startTime: "18:00",
      });
    });
  });

  describe("sem permissão", () => {
    const VIEW_ONLY = [
      {
        module: Module.OCORRENCIAS,
        actions: [PermissionAction.VIEW],
        scope: PermissionScope.ALL,
      },
    ];

    it("nova aula fica bloqueada, com o motivo, e os espaços vazios do dia não abrem o formulário", async () => {
      mockSuccessfulLogin("Professor", VIEW_ONLY);
      server.use(http.get("/api/occurrences", () => HttpResponse.json([])));
      renderPage();

      const create = await screen.findByRole("button", { name: "+ Nova aula" });
      expect(create).toBeDisabled();
      expect(create).toHaveAttribute("title", "Você não tem permissão para criar aulas.");
      expect(screen.queryByRole("button", { name: /^Nova aula em/ })).not.toBeInTheDocument();
    });

    it("na aula existente, salvar, cancelar e excluir ficam bloqueados, mas os dados continuam visíveis", async () => {
      mockSuccessfulLogin("Professor", VIEW_ONLY);
      const occurrence = occurrenceAt(WEDNESDAY, "18:00");
      server.use(http.get("/api/occurrences", () => HttpResponse.json([occurrence])));
      renderPage();
      const user = userEvent.setup();

      await user.click(await screen.findByRole("button", { name: /18h00.*Treino Funcional/ }));
      const dialog = screen.getByRole("dialog", { name: "Editar aula" });

      const save = within(dialog).getByRole("button", { name: "Salvar" });
      expect(save).toBeDisabled();
      expect(save).toHaveAttribute("title", "Você não tem permissão para editar aulas.");
      const cancel = within(dialog).getByRole("button", { name: "Cancelar aula" });
      expect(cancel).toBeDisabled();
      expect(cancel).toHaveAttribute("title", "Você não tem permissão para cancelar aulas.");
      const remove = within(dialog).getByRole("button", { name: "Excluir aula" });
      expect(remove).toBeDisabled();
      expect(remove).toHaveAttribute("title", "Você não tem permissão para excluir aulas.");
    });
  });
});
