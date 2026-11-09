import { useEffect, useState, type ReactNode } from "react";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider, onlineManager } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import { MemoryRouter } from "react-router-dom";
import {
  addDays,
  gymDateTimeToUtc,
  gymToday,
  startOfWeek,
  type AdminReservationDetail,
  type ClassTemplateDetail,
  type ModalityDetail,
  type OccurrenceDetail,
} from "@fitburn/contracts";
import { AuthProvider, useAuth } from "../src/lib/auth/AuthContext";
import { AgendaAdminPage } from "../src/pages/AgendaAdminPage";
import { ReservasAdminPage } from "../src/pages/ReservasAdminPage";
import { TemplatesModalidadesPage } from "../src/pages/TemplatesModalidadesPage";
import { mockSuccessfulLogin } from "./auth-mocks";
import { server } from "./msw-server";

/**
 * Admin, lote B (#156, PR 14): Agenda administrativa, Templates e modalidades e Reservas administrativas na nova
 * base. Aqui ficam a estrutura (títulos em ordem, grade e tabelas rotuladas, ações com nome), os estados (carregando,
 * erro, vazio, offline) e os diálogos (foco inicial, Escape e retorno de foco); o comportamento de cada fluxo está nos
 * testes de cada tela.
 */

function LoggedIn({ children }: { children: ReactNode }) {
  const { login } = useAuth();
  const [ready, setReady] = useState(false);
  useEffect(() => {
    void login("admin@fitburn.local", "SenhaForte123!").then(() => setReady(true));
  }, [login]);
  return ready ? <>{children}</> : null;
}

function renderScreen(page: ReactNode) {
  return render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <AuthProvider>
        <MemoryRouter>
          <LoggedIn>{page}</LoggedIn>
        </MemoryRouter>
      </AuthProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => mockSuccessfulLogin("Administrador"));
afterEach(() => onlineManager.setOnline(true));

/** Os níveis de título da tela, na ordem do documento. */
function headingLevels(): number[] {
  return screen.getAllByRole("heading").map((heading) => Number(heading.tagName.slice(1)));
}

async function expectOfflineState() {
  const offline = await waitFor(() => {
    const found = document.querySelector('[data-state="offline"]');
    expect(found).not.toBeNull();
    return found as HTMLElement;
  });
  expect(offline).toHaveTextContent("Sem conexão");
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
}

// ---------------------------------------------------------------------------------------------------------------------
// Agenda administrativa
// ---------------------------------------------------------------------------------------------------------------------

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

const TODAY = gymToday();
const WEEK_START = startOfWeek(TODAY);

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

describe("Agenda administrativa: grade, semana e estados", () => {
  beforeEach(() => {
    server.use(
      http.get("/api/occurrences/options", () =>
        HttpResponse.json({
          templates: [TEMPLATE],
          instructors: [{ id: "user-rafael", fullName: "Rafael Andrade" }],
        }),
      ),
    );
  });

  it("títulos em ordem: o h1 da tela e um h2 por dia da semana", async () => {
    server.use(http.get("/api/occurrences", () => HttpResponse.json([])));
    renderScreen(<AgendaAdminPage />);

    expect(
      await screen.findByRole("heading", { level: 1, name: "Ocorrências / agenda administrativa" }),
    ).toBeInTheDocument();
    expect(headingLevels()).toEqual([1, 2, 2, 2, 2, 2, 2, 2]);
  });

  it("a grade é uma região rotulada com a semana, e cada dia é uma seção com nome", async () => {
    server.use(http.get("/api/occurrences", () => HttpResponse.json([])));
    renderScreen(<AgendaAdminPage />);

    const region = await screen.findByRole("region", { name: /^Aulas da semana, / });
    expect(region).toHaveAttribute("tabindex", "0");
    expect(within(region).getAllByRole("region")).toHaveLength(7);
    // Só o dia de hoje é o dia atual.
    const current = within(region)
      .getAllByRole("region")
      .filter((section) => section.getAttribute("aria-current") === "date");
    expect(current).toHaveLength(1);
    expect(within(current[0]).getByRole("heading", { level: 2 })).toHaveTextContent("(hoje)");
  });

  it("cada aula tem hora, modalidade, professor e ocupação no nome acessível, dentro de uma lista do dia", async () => {
    const day = addDays(WEEK_START, 2);
    server.use(
      http.get("/api/occurrences", () =>
        HttpResponse.json([
          occurrenceAt(day, "18:00", { bookedCount: 7 }),
          occurrenceAt(day, "19:00", { bookedCount: 10 }),
          occurrenceAt(day, "20:00", { status: "CANCELLED" }),
        ]),
      ),
    );
    renderScreen(<AgendaAdminPage />);

    const open = await screen.findByRole("button", {
      name: /18h00.*Treino Funcional.*Prof\. Rafael.*7\/10 vagas ocupadas/,
    });
    expect(open.closest("li")).not.toBeNull();
    expect(open.closest("ul")).not.toBeNull();
    expect(screen.getByRole("button", { name: /19h00.*10\/10 vagas ocupadas, lotada/ })).toBeInTheDocument();
    const cancelled = screen.getByRole("button", { name: /20h00.*Cancelada/ });
    expect(cancelled).not.toHaveTextContent("vagas ocupadas");
  });

  it("a ocupação aparece em selo (Badge)", async () => {
    server.use(
      http.get("/api/occurrences", () =>
        HttpResponse.json([occurrenceAt(addDays(WEEK_START, 1), "09:00", { bookedCount: 3 })]),
      ),
    );
    renderScreen(<AgendaAdminPage />);

    const aula = await screen.findByRole("button", { name: /09h00/ });
    const badge = aula.querySelector(".fb-ui-badge");
    expect(badge).not.toBeNull();
    expect(badge).toHaveTextContent("3/10");
  });

  it("navega entre semanas: pede o intervalo da semana e anuncia o novo período", async () => {
    const requests: string[] = [];
    server.use(
      http.get("/api/occurrences", ({ request }) => {
        requests.push(new URL(request.url).search);
        return HttpResponse.json([]);
      }),
    );
    renderScreen(<AgendaAdminPage />);
    const user = userEvent.setup();

    const status = await screen.findByRole("status", { name: "" });
    const thisWeek = status.textContent;
    await waitFor(() => expect(requests).toHaveLength(1));
    expect(requests[0]).toContain(`from=${WEEK_START}`);

    await user.click(screen.getByRole("button", { name: "Próxima semana" }));

    await waitFor(() => expect(requests).toHaveLength(2));
    expect(requests[1]).toContain(`from=${addDays(WEEK_START, 7)}`);
    expect(requests[1]).toContain(`to=${addDays(WEEK_START, 13)}`);
    expect(screen.getByRole("status")).not.toHaveTextContent(thisWeek ?? "");
    expect(screen.getByRole("region", { name: /^Aulas da semana, / })).toBeInTheDocument();

    // Voltar duas semanas passa pela semana atual (que a tela pede de novo) e chega à anterior.
    await user.click(screen.getByRole("button", { name: "Semana anterior" }));
    await user.click(screen.getByRole("button", { name: "Semana anterior" }));

    await waitFor(() => expect(requests[requests.length - 1]).toContain(`from=${addDays(WEEK_START, -7)}`));
  });

  it("nova aula em Dialog: foco inicial no primeiro campo, Escape fecha e o foco volta ao botão", async () => {
    server.use(http.get("/api/occurrences", () => HttpResponse.json([])));
    renderScreen(<AgendaAdminPage />);
    const user = userEvent.setup();

    const trigger = await screen.findByRole("button", { name: "+ Nova aula" });
    await user.click(trigger);

    const dialog = screen.getByRole("dialog", { name: "Nova aula" });
    await waitFor(() =>
      expect(within(dialog).getByLabelText("Modalidade / template")).toHaveFocus(),
    );
    expect(within(dialog).getByRole("heading", { level: 2, name: "Nova aula" })).toBeInTheDocument();

    await user.keyboard("{Escape}");

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(trigger).toHaveFocus();
  });

  it("recorrência: os dias da semana são um grupo rotulado de botões com estado", async () => {
    server.use(http.get("/api/occurrences", () => HttpResponse.json([])));
    renderScreen(<AgendaAdminPage />);
    const user = userEvent.setup();

    await user.click(await screen.findByRole("button", { name: "+ Nova aula" }));
    const dialog = screen.getByRole("dialog", { name: "Nova aula" });
    await user.selectOptions(within(dialog).getByLabelText("Recorrência"), "WEEKLY");

    const group = within(dialog).getByRole("group", { name: "Dias da semana" });
    const monday = within(group).getByRole("button", { name: "SEG" });
    expect(monday).toHaveAttribute("aria-pressed");
    await user.click(monday);
    const before = monday.getAttribute("aria-pressed");
    await user.click(monday);
    expect(monday.getAttribute("aria-pressed")).not.toBe(before);
  });

  it("cancelar a aula pede confirmação: Voltar não cancela e o foco vai ao primeiro botão do diálogo", async () => {
    const occurrence = occurrenceAt(addDays(WEEK_START, 2), "18:00");
    let cancelCalls = 0;
    server.use(
      http.get("/api/occurrences", () => HttpResponse.json([occurrence])),
      http.post("/api/occurrences/:id/cancel", () => {
        cancelCalls += 1;
        return HttpResponse.json({ ...occurrence, status: "CANCELLED" }, { status: 201 });
      }),
    );
    renderScreen(<AgendaAdminPage />);
    const user = userEvent.setup();

    await user.click(await screen.findByRole("button", { name: /18h00.*Treino Funcional/ }));
    const edit = screen.getByRole("dialog", { name: "Editar aula" });
    await user.click(within(edit).getByRole("button", { name: "Cancelar aula" }));

    const confirm = screen.getByRole("dialog", { name: "Cancelar esta aula?" });
    await waitFor(() => expect(within(confirm).getByRole("button", { name: "Voltar" })).toHaveFocus());
    await user.click(within(confirm).getByRole("button", { name: "Voltar" }));

    expect(screen.getByRole("dialog", { name: "Editar aula" })).toBeInTheDocument();
    expect(cancelCalls).toBe(0);
  });

  it("carregando: mostra o texto da tela, sem esconder a navegação da semana", async () => {
    server.use(http.get("/api/occurrences", () => new Promise(() => {})));
    renderScreen(<AgendaAdminPage />);

    const loading = await screen.findByText("Carregando a agenda…");
    expect(loading).toHaveAttribute("role", "status");
    expect(screen.getByRole("button", { name: "Próxima semana" })).toBeInTheDocument();
  });

  it("erro: alerta com a mensagem da tela e botão para tentar de novo", async () => {
    let calls = 0;
    server.use(
      http.get("/api/occurrences", () => {
        calls += 1;
        return calls === 1
          ? HttpResponse.json({ code: "ERRO", message: "falhou" }, { status: 500 })
          : HttpResponse.json([occurrenceAt(addDays(WEEK_START, 1), "09:00")]);
      }),
    );
    renderScreen(<AgendaAdminPage />);
    const user = userEvent.setup();

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Não foi possível carregar a agenda.");
    await user.click(within(alert).getByRole("button", { name: "Tentar novamente" }));

    expect(await screen.findByRole("button", { name: /09h00/ })).toBeInTheDocument();
  });

  it("offline: mostra o estado sem conexão (não um erro) e a grade volta com a rede", async () => {
    server.use(
      http.get("/api/occurrences", () =>
        HttpResponse.json([occurrenceAt(addDays(WEEK_START, 1), "09:00")]),
      ),
    );
    onlineManager.setOnline(false);
    renderScreen(<AgendaAdminPage />);

    await expectOfflineState();
    onlineManager.setOnline(true);

    expect(await screen.findByRole("button", { name: /09h00/ })).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------------------------------------------------
// Templates e modalidades
// ---------------------------------------------------------------------------------------------------------------------

const SPINNING: ModalityDetail = {
  id: "mod-spinning",
  name: "Spinning",
  description: "Aula em bicicleta ergométrica",
  isActive: true,
  templateCount: 0,
  activeTemplateCount: 0,
};

const FUNCIONAL: ModalityDetail = {
  id: "mod-funcional",
  name: "Treino Funcional",
  description: null,
  isActive: false,
  templateCount: 1,
  activeTemplateCount: 0,
};

const SPINNING_45: ClassTemplateDetail = {
  id: "tpl-1",
  name: "Spinning 45min",
  description: "Aula de bike",
  durationMinutes: 45,
  capacity: 15,
  isActive: false,
  modality: { id: SPINNING.id, name: SPINNING.name },
  defaultInstructor: { id: "user-camila", fullName: "Camila Rocha" },
};

describe("Templates e modalidades: abas, tabelas e diálogos", () => {
  beforeEach(() => {
    server.use(
      http.get("/api/modalities", () => HttpResponse.json([SPINNING, FUNCIONAL])),
      http.get("/api/class-templates", () => HttpResponse.json([SPINNING_45])),
      http.get("/api/class-templates/instructors", () =>
        HttpResponse.json([{ id: "user-camila", fullName: "Camila Rocha" }]),
      ),
    );
  });

  it("títulos em ordem: o h1 da tela e os diálogos em h2", async () => {
    renderScreen(<TemplatesModalidadesPage />);

    expect(
      await screen.findByRole("heading", { level: 1, name: "Templates de aula e modalidades" }),
    ).toBeInTheDocument();
    expect(headingLevels()).toEqual([1]);
  });

  it("alterna entre Templates de aula e Modalidades, com o estado nos botões e uma tabela rotulada por vez", async () => {
    renderScreen(<TemplatesModalidadesPage />);
    const user = userEvent.setup();

    const group = await screen.findByRole("group", { name: "Seções" });
    const templatesTab = within(group).getByRole("button", { name: "Templates de aula" });
    const modalitiesTab = within(group).getByRole("button", { name: "Modalidades" });
    expect(templatesTab).toHaveAttribute("aria-pressed", "true");
    expect(modalitiesTab).toHaveAttribute("aria-pressed", "false");

    const templates = await screen.findByRole("table", { name: "Templates de aula" });
    expect(
      within(templates)
        .getAllByRole("columnheader")
        .map((header) => header.textContent),
    ).toEqual(["Nome", "Modalidade", "Duração", "Capacidade", "Professor padrão", "Ações"]);
    expect(screen.queryByRole("table", { name: "Modalidades" })).not.toBeInTheDocument();

    await user.click(modalitiesTab);

    expect(modalitiesTab).toHaveAttribute("aria-pressed", "true");
    expect(templatesTab).toHaveAttribute("aria-pressed", "false");
    const modalities = await screen.findByRole("table", { name: "Modalidades" });
    expect(
      within(modalities)
        .getAllByRole("columnheader")
        .map((header) => header.textContent),
    ).toEqual(["Nome", "Descrição", "Templates ativos", "Ações"]);
    expect(screen.queryByRole("table", { name: "Templates de aula" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "+ Nova modalidade" })).toBeInTheDocument();
  });

  it("registro inativo mostra o selo INATIVO e o botão Ativar com o nome do registro", async () => {
    renderScreen(<TemplatesModalidadesPage />);

    const row = (await screen.findByText("Spinning 45min")).closest("tr")!;
    expect(within(row).getByText("INATIVO")).toBeInTheDocument();
    expect(within(row).getByRole("button", { name: "Ativar template Spinning 45min" })).toBeInTheDocument();
  });

  it("editar um template abre o Dialog com os valores atuais e devolve o foco ao botão ao fechar", async () => {
    renderScreen(<TemplatesModalidadesPage />);
    const user = userEvent.setup();

    const row = (await screen.findByText("Spinning 45min")).closest("tr")!;
    const trigger = within(row).getByRole("button", { name: "Editar template Spinning 45min" });
    await user.click(trigger);

    const dialog = screen.getByRole("dialog", { name: "Editar template de aula" });
    expect(within(dialog).getByLabelText("Nome")).toHaveValue("Spinning 45min");
    expect(within(dialog).getByLabelText("Duração (min)")).toHaveValue(45);
    expect(within(dialog).getByLabelText("Capacidade")).toHaveValue(15);
    expect(within(dialog).getByLabelText("Professor padrão")).toHaveValue("user-camila");
    await waitFor(() => expect(within(dialog).getByLabelText("Nome")).toHaveFocus());

    await user.keyboard("{Escape}");

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(trigger).toHaveFocus();
  });

  it("cria uma modalidade num Dialog com Field e ela entra na lista", async () => {
    let modalities = [SPINNING];
    let sent: Record<string, unknown> | null = null;
    server.use(
      http.get("/api/modalities", () => HttpResponse.json(modalities)),
      http.post("/api/modalities", async ({ request }) => {
        sent = (await request.json()) as Record<string, unknown>;
        const created: ModalityDetail = {
          id: "mod-yoga",
          name: sent.name as string,
          description: (sent.description as string | undefined) ?? null,
          isActive: true,
          templateCount: 0,
          activeTemplateCount: 0,
        };
        modalities = [...modalities, created];
        return HttpResponse.json(created, { status: 201 });
      }),
    );
    renderScreen(<TemplatesModalidadesPage />);
    const user = userEvent.setup();

    await user.click(await screen.findByRole("button", { name: "Modalidades" }));
    await user.click(await screen.findByRole("button", { name: "+ Nova modalidade" }));
    const dialog = screen.getByRole("dialog", { name: "Nova modalidade" });
    await user.type(within(dialog).getByLabelText("Nome"), "Yoga");
    await user.type(within(dialog).getByLabelText("Descrição"), "Alongamento");
    await user.click(within(dialog).getByRole("button", { name: "Salvar modalidade" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    const row = (await screen.findByText("Yoga", { selector: "td span" })).closest("tr")!;
    expect(within(row).getByText("Alongamento")).toBeInTheDocument();
    expect(sent).toMatchObject({ name: "Yoga", description: "Alongamento" });
  });

  it("a recusa da API ao salvar aparece como alerta dentro do Dialog, que continua aberto", async () => {
    server.use(
      http.post("/api/modalities", () =>
        HttpResponse.json({ code: "ERRO", message: "Já existe uma modalidade com este nome." }, { status: 409 }),
      ),
    );
    renderScreen(<TemplatesModalidadesPage />);
    const user = userEvent.setup();

    await user.click(await screen.findByRole("button", { name: "Modalidades" }));
    await user.click(await screen.findByRole("button", { name: "+ Nova modalidade" }));
    const dialog = screen.getByRole("dialog", { name: "Nova modalidade" });
    await user.type(within(dialog).getByLabelText("Nome"), "Spinning");
    await user.click(within(dialog).getByRole("button", { name: "Salvar modalidade" }));

    expect(await within(dialog).findByRole("alert")).toHaveTextContent(
      "Já existe uma modalidade com este nome.",
    );
    expect(screen.getByRole("dialog", { name: "Nova modalidade" })).toBeInTheDocument();
  });

  it("excluir pede confirmação: Cancelar não exclui; Confirmar exclui e fecha o diálogo", async () => {
    let deletes = 0;
    server.use(
      http.delete("/api/modalities/:id", () => {
        deletes += 1;
        return new HttpResponse(null, { status: 204 });
      }),
    );
    renderScreen(<TemplatesModalidadesPage />);
    const user = userEvent.setup();

    await user.click(await screen.findByRole("button", { name: "Modalidades" }));
    const row = (await screen.findByText("Spinning", { selector: "td span" })).closest("tr")!;
    const trigger = within(row).getByRole("button", { name: "Excluir modalidade Spinning" });
    await user.click(trigger);

    const dialog = screen.getByRole("dialog", { name: "Excluir modalidade Spinning?" });
    // O foco inicial é a saída segura.
    await waitFor(() => expect(within(dialog).getByRole("button", { name: "Cancelar" })).toHaveFocus());
    await user.click(within(dialog).getByRole("button", { name: "Cancelar" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(deletes).toBe(0);
    expect(trigger).toHaveFocus();

    await user.click(trigger);
    await user.click(
      within(screen.getByRole("dialog", { name: "Excluir modalidade Spinning?" })).getByRole("button", {
        name: "Confirmar exclusão",
      }),
    );

    await waitFor(() => expect(deletes).toBe(1));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("carregando: mostra o texto da aba", async () => {
    server.use(http.get("/api/class-templates", () => new Promise(() => {})));
    renderScreen(<TemplatesModalidadesPage />);

    expect(await screen.findByText("Carregando templates…")).toHaveAttribute("role", "status");
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("vazio: mostra o estado vazio compartilhado, sem tabela", async () => {
    server.use(http.get("/api/modalities", () => HttpResponse.json([])));
    renderScreen(<TemplatesModalidadesPage />);
    const user = userEvent.setup();

    await user.click(await screen.findByRole("button", { name: "Modalidades" }));

    const empty = await screen.findByText("Nenhuma modalidade cadastrada.");
    expect(empty.closest("[data-state=empty]")).not.toBeNull();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("erro: alerta com a mensagem da aba e botão para tentar de novo", async () => {
    let calls = 0;
    server.use(
      http.get("/api/class-templates", () => {
        calls += 1;
        return calls === 1
          ? HttpResponse.json({ code: "ERRO", message: "falhou" }, { status: 500 })
          : HttpResponse.json([SPINNING_45]);
      }),
    );
    renderScreen(<TemplatesModalidadesPage />);
    const user = userEvent.setup();

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Não foi possível carregar os templates.");
    await user.click(within(alert).getByRole("button", { name: "Tentar novamente" }));

    expect(await screen.findByRole("table", { name: "Templates de aula" })).toBeInTheDocument();
  });

  it("offline: mostra o estado sem conexão (não um erro) e a tabela volta com a rede", async () => {
    onlineManager.setOnline(false);
    renderScreen(<TemplatesModalidadesPage />);

    await expectOfflineState();
    onlineManager.setOnline(true);

    expect(await screen.findByRole("table", { name: "Templates de aula" })).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------------------------------------------------
// Reservas administrativas
// ---------------------------------------------------------------------------------------------------------------------

function reservation(id: string, overrides: Partial<AdminReservationDetail> = {}): AdminReservationDetail {
  const startsAt = new Date(Date.now() + 5 * 60 * 60_000);
  return {
    id,
    status: "CONFIRMED",
    occurrence: {
      id: "o-today",
      name: "Treino Funcional",
      modality: { id: "mod-1", name: "Treino Funcional" },
      instructor: null,
      startsAt: startsAt.toISOString(),
      endsAt: new Date(startsAt.getTime() + 60 * 60_000).toISOString(),
      durationMinutes: 60,
      status: "SCHEDULED",
    },
    createdAt: "2026-09-20T10:00:00.000Z",
    cancelledAt: null,
    client: { id: "c-marina", fullName: "Marina Souza", email: "marina@email.com", status: "ACTIVE" },
    createdBy: { id: "user-1", fullName: "Alice Admin", kind: "STAFF" },
    cancelledBy: null,
    ...overrides,
  };
}

const RESERVATIONS: AdminReservationDetail[] = [
  reservation("r-1"),
  reservation("r-2", { status: "COMPLETED" }),
  reservation("r-3", {
    status: "CANCELLED",
    cancelledAt: "2026-09-21T10:00:00.000Z",
    cancelledBy: { id: "user-1", fullName: "Alice Admin", kind: "STAFF" },
  }),
  reservation("r-4", { status: "NO_SHOW" }),
];

describe("Reservas administrativas: tabela, filtros, diálogos e estados", () => {
  beforeEach(() => {
    server.use(
      http.get("/api/admin/reservations", () => HttpResponse.json(RESERVATIONS)),
      http.get("/api/admin/reservations/clients", () =>
        HttpResponse.json([{ id: "c-marina", fullName: "Marina Souza", email: "marina@email.com" }]),
      ),
      http.get("/api/agenda", () => HttpResponse.json([])),
      http.get("/api/admin/reservations/preview", () =>
        HttpResponse.json({ canBook: true, capacity: 14, availableSpots: 6, reason: null }),
      ),
    );
  });

  it("títulos em ordem e a tabela é rotulada, com cabeçalhos e a situação em selo de texto", async () => {
    renderScreen(<ReservasAdminPage />);

    const table = await screen.findByRole("table", { name: "Reservas" });
    expect(screen.getByRole("heading", { level: 1, name: "Reservas administrativas" })).toBeInTheDocument();
    expect(headingLevels()).toEqual([1]);
    expect(
      within(table)
        .getAllByRole("columnheader")
        .map((header) => header.textContent),
    ).toEqual(["Cliente", "Aula", "Data / Horário", "Status", "Ações"]);
    for (const text of ["CONFIRMADA", "CONCLUÍDA", "CANCELADA", "NÃO COMPARECEU"]) {
      expect(within(table).getByText(text)).toHaveClass("fb-ui-badge");
    }
    expect(within(table).getByText("CONFIRMADA")).toHaveClass("fb-ui-badge--ok");
    expect(within(table).getByText("CANCELADA")).toHaveClass("fb-ui-badge--err");
    expect(within(table).getByText("NÃO COMPARECEU")).toHaveClass("fb-ui-badge--warn");
  });

  it("os filtros ficam numa barra de busca rotulada: texto, status e período", async () => {
    renderScreen(<ReservasAdminPage />);

    const toolbar = await screen.findByRole("search", { name: "Filtros das reservas" });
    expect(within(toolbar).getByRole("searchbox", { name: "Buscar por cliente ou aula" })).toBeInTheDocument();
    expect(within(toolbar).getByRole("combobox", { name: "Status" })).toBeInTheDocument();
    expect(within(toolbar).getByRole("combobox", { name: "Período" })).toBeInTheDocument();
  });

  it("só a reserva confirmada tem ações, e cada ação leva o nome do cliente", async () => {
    renderScreen(<ReservasAdminPage />);

    const table = await screen.findByRole("table", { name: "Reservas" });
    expect(within(table).getAllByRole("button", { name: /^Remarcar reserva de Marina Souza$/ })).toHaveLength(1);
    expect(within(table).getAllByRole("button", { name: /^Cancelar reserva de Marina Souza$/ })).toHaveLength(1);
  });

  it("nova reserva com erro de campo: o seletor de cliente fica inválido e a mensagem é ligada ao campo", async () => {
    server.use(
      http.get("/api/admin/reservations/clients", () =>
        HttpResponse.json({ code: "ERRO", message: "falhou" }, { status: 500 }),
      ),
    );
    renderScreen(<ReservasAdminPage />);
    const user = userEvent.setup();

    await user.click(await screen.findByRole("button", { name: "+ Nova reserva" }));
    const dialog = await screen.findByRole("dialog", { name: "Nova reserva (administrativa)" });

    const alert = await within(dialog).findByRole("alert");
    expect(alert).toHaveTextContent("Não foi possível carregar os clientes.");
    const client = within(dialog).getByLabelText("Cliente");
    expect(client).toHaveAttribute("aria-invalid", "true");
    expect(client.getAttribute("aria-describedby")).toContain(alert.id);
    // O campo sem erro não é marcado, e sem cliente e aula a reserva não pode ser confirmada.
    expect(within(dialog).getByLabelText("Aula")).not.toHaveAttribute("aria-invalid");
    expect(within(dialog).getByRole("button", { name: "Confirmar reserva" })).toBeDisabled();
  });

  it("nova reserva em Dialog: foco inicial no primeiro campo, Escape fecha e o foco volta ao botão", async () => {
    renderScreen(<ReservasAdminPage />);
    const user = userEvent.setup();

    const trigger = await screen.findByRole("button", { name: "+ Nova reserva" });
    await user.click(trigger);
    const dialog = await screen.findByRole("dialog", { name: "Nova reserva (administrativa)" });
    await waitFor(() => expect(within(dialog).getByLabelText("Cliente")).toHaveFocus());

    await user.keyboard("{Escape}");

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(trigger).toHaveFocus();
  });

  it("cancelar a reserva: o diálogo mantém o texto, o foco inicial é Voltar e Escape devolve o foco à linha", async () => {
    renderScreen(<ReservasAdminPage />);
    const user = userEvent.setup();

    const trigger = await screen.findByRole("button", { name: "Cancelar reserva de Marina Souza" });
    await user.click(trigger);

    const dialog = screen.getByRole("dialog", { name: "Cancelar reserva" });
    expect(dialog).toHaveTextContent(
      "Cancelar a reserva de Marina Souza em Treino Funcional,",
    );
    expect(dialog).toHaveTextContent("A vaga será liberada para outros clientes.");
    await waitFor(() => expect(within(dialog).getByRole("button", { name: "Voltar" })).toHaveFocus());

    await user.keyboard("{Escape}");

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(trigger).toHaveFocus();
  });

  it("carregando: mostra o texto da tela e nenhuma tabela", async () => {
    server.use(http.get("/api/admin/reservations", () => new Promise(() => {})));
    renderScreen(<ReservasAdminPage />);

    expect(await screen.findByText("Carregando reservas…")).toHaveAttribute("role", "status");
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("vazio: mostra o estado vazio compartilhado, sem tabela", async () => {
    server.use(http.get("/api/admin/reservations", () => HttpResponse.json([])));
    renderScreen(<ReservasAdminPage />);

    const empty = await screen.findByText("Nenhuma reserva encontrada.");
    expect(empty.closest("[data-state=empty]")).not.toBeNull();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("erro: alerta com a mensagem da API e botão para tentar de novo", async () => {
    let calls = 0;
    server.use(
      http.get("/api/admin/reservations", () => {
        calls += 1;
        return calls === 1
          ? HttpResponse.json({ code: "ERRO", message: "Falha ao listar as reservas." }, { status: 500 })
          : HttpResponse.json(RESERVATIONS);
      }),
    );
    renderScreen(<ReservasAdminPage />);
    const user = userEvent.setup();

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Falha ao listar as reservas.");
    await user.click(within(alert).getByRole("button", { name: "Tentar novamente" }));

    expect(await screen.findByRole("table", { name: "Reservas" })).toBeInTheDocument();
  });

  it("offline: mostra o estado sem conexão (não um erro) e a tabela volta com a rede", async () => {
    onlineManager.setOnline(false);
    renderScreen(<ReservasAdminPage />);

    await expectOfflineState();
    onlineManager.setOnline(true);

    expect(await screen.findByRole("table", { name: "Reservas" })).toBeInTheDocument();
  });
});
