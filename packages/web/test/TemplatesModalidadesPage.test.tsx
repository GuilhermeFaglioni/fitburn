import { useEffect, useState } from "react";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import { MemoryRouter } from "react-router-dom";
import type { ClassTemplateDetail, ModalityDetail } from "@fitburn/contracts";
import { AuthProvider, useAuth } from "../src/lib/auth/AuthContext";
import { TemplatesModalidadesPage } from "../src/pages/TemplatesModalidadesPage";
import { mockSuccessfulLogin } from "./auth-mocks";
import { server } from "./msw-server";

const SPINNING: ModalityDetail = {
  id: "mod-spinning",
  name: "Spinning",
  description: "Aula em bicicleta ergométrica",
  isActive: true,
  templateCount: 0,
  activeTemplateCount: 0,
};

const FUNCIONAL_EM_USO: ModalityDetail = {
  id: "mod-funcional",
  name: "Treino Funcional",
  description: "Circuito de exercícios multiarticulares",
  isActive: true,
  templateCount: 1,
  activeTemplateCount: 1,
};

function LoggedInPage() {
  const { login } = useAuth();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    login("admin@fitburn.local", "SenhaForte123!").then(() => setReady(true));
  }, [login]);

  if (!ready) return null;
  return <TemplatesModalidadesPage />;
}

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <MemoryRouter initialEntries={["/templates-e-modalidades"]}>
          <LoggedInPage />
        </MemoryRouter>
      </AuthProvider>
    </QueryClientProvider>,
  );
}

describe("TemplatesModalidadesPage", () => {
  beforeEach(() => {
    mockSuccessfulLogin("Administrador");
    server.use(
      http.get("/api/modalities", () => HttpResponse.json([SPINNING, FUNCIONAL_EM_USO])),
      http.get("/api/class-templates/instructors", () =>
        HttpResponse.json([{ id: "user-camila", fullName: "Camila Rocha" }]),
      ),
    );
  });

  it("cria um template e ele aparece na lista", async () => {
    let templates: ClassTemplateDetail[] = [];
    let sentBody: Record<string, unknown> | null = null;
    server.use(
      http.get("/api/class-templates", () => HttpResponse.json(templates)),
      http.post("/api/class-templates", async ({ request }) => {
        sentBody = (await request.json()) as Record<string, unknown>;
        const created: ClassTemplateDetail = {
          id: "tpl-1",
          name: sentBody.name as string,
          description: null,
          durationMinutes: sentBody.durationMinutes as number,
          capacity: sentBody.capacity as number,
          isActive: true,
          modality: { id: SPINNING.id, name: SPINNING.name },
          defaultInstructor: { id: "user-camila", fullName: "Camila Rocha" },
        };
        templates = [created];
        return HttpResponse.json(created, { status: 201 });
      }),
    );

    renderPage();
    const user = userEvent.setup();

    await user.click(await screen.findByRole("button", { name: "+ Novo template" }));
    const form = screen.getByRole("form", { name: "Template de aula" });
    await user.type(within(form).getByLabelText("Nome"), "Spinning 45min");
    await user.selectOptions(within(form).getByLabelText("Modalidade"), SPINNING.id);
    await user.type(within(form).getByLabelText("Duração (min)"), "45");
    await user.type(within(form).getByLabelText("Capacidade"), "15");
    await user.selectOptions(within(form).getByLabelText("Professor padrão"), "user-camila");
    await user.click(within(form).getByRole("button", { name: "Salvar template" }));

    const row = (await screen.findByText("Spinning 45min")).closest("tr")!;
    expect(within(row).getByText("45 min")).toBeInTheDocument();
    expect(within(row).getByText("15 vagas")).toBeInTheDocument();
    expect(within(row).getByText("Prof. Camila Rocha")).toBeInTheDocument();
    expect(sentBody).toMatchObject({
      name: "Spinning 45min",
      modalityId: SPINNING.id,
      durationMinutes: 45,
      capacity: 15,
      defaultInstructorId: "user-camila",
    });
  });

  it("bloqueia a exclusão de modalidade em uso e explica o motivo", async () => {
    server.use(http.get("/api/class-templates", () => HttpResponse.json([])));

    renderPage();
    const user = userEvent.setup();

    await user.click(await screen.findByRole("button", { name: "Modalidades" }));

    const row = (await screen.findByText("Treino Funcional")).closest("tr")!;
    const deleteButton = within(row).getByRole("button", { name: "Excluir" });
    expect(deleteButton).toHaveAttribute("aria-disabled", "true");
    expect(
      screen.getByText(/Modalidades com templates vinculados não podem ser excluídas/),
    ).toBeInTheDocument();
  });

  it("mostra o aviso de exclusão bloqueada quando a API recusa por uso", async () => {
    server.use(
      http.get("/api/class-templates", () => HttpResponse.json([])),
      http.delete("/api/modalities/:id", () =>
        HttpResponse.json(
          {
            code: "MODALITY_IN_USE",
            message: "Esta modalidade tem templates vinculados e não pode ser excluída.",
          },
          { status: 409 },
        ),
      ),
    );

    renderPage();
    const user = userEvent.setup();

    await user.click(await screen.findByRole("button", { name: "Modalidades" }));
    const row = (await screen.findByText("Spinning")).closest("tr")!;
    await user.click(within(row).getByRole("button", { name: "Excluir" }));

    await waitFor(() =>
      expect(within(row).getByRole("alert")).toHaveTextContent(
        "Esta modalidade tem templates vinculados e não pode ser excluída.",
      ),
    );
  });
});
