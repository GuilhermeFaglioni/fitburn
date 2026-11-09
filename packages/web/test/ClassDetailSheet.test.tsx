import { useEffect, useState } from "react";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import { gymDateTimeToUtc, gymToday, type ClientAgendaItem } from "@fitburn/contracts";
import { AuthProvider, useAuth } from "../src/lib/auth/AuthContext";
import { ClassDetailSheet, type Rescheduling } from "../src/pages/client/ClassDetailSheet";
import { mockSuccessfulLogin } from "./auth-mocks";
import { setBrowserOnline } from "./connectivity-helpers";
import { server } from "./msw-server";

/** Detalhe da aula (folha, D-038 #156): estrutura, acessibilidade do diálogo e os estados da folha. */

const startsAt = gymDateTimeToUtc(gymToday(), "07:00");

function occurrenceOf(overrides: Partial<ClientAgendaItem> = {}): ClientAgendaItem {
  return {
    id: "occ-1",
    name: "Mobilidade e core",
    description: "Alongamento ativo e fortalecimento do centro do corpo.",
    modality: { id: "mod-1", name: "Mobilidade" },
    instructor: { id: "user-modelo", fullName: "Paula Modelo" },
    startsAt: startsAt.toISOString(),
    endsAt: new Date(startsAt.getTime() + 45 * 60_000).toISOString(),
    durationMinutes: 45,
    capacity: 8,
    available: 3,
    myReservationId: null,
    ...overrides,
  };
}

function reservationOf(occurrence: ClientAgendaItem) {
  return {
    id: "res-1",
    status: "CONFIRMED",
    occurrence: {
      id: occurrence.id,
      name: occurrence.name,
      modality: occurrence.modality,
      instructor: occurrence.instructor,
      startsAt: occurrence.startsAt,
      endsAt: occurrence.endsAt,
      durationMinutes: occurrence.durationMinutes,
      status: "SCHEDULED",
    },
    createdAt: new Date().toISOString(),
    cancelledAt: null,
  };
}

/** Quem abre a folha: o botão "Abrir detalhe" recebe o foco de volta ao fechar. */
function Host({
  item,
  rescheduling = null,
  onClose,
}: {
  item: ClientAgendaItem;
  rescheduling?: Rescheduling | null;
  onClose?: () => void;
}) {
  const { login } = useAuth();
  const [ready, setReady] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    void login("cliente@fitburn.local", "SenhaForte123!").then(() => setReady(true));
  }, [login]);

  if (!ready) return null;
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Abrir detalhe
      </button>
      {open && (
        <ClassDetailSheet
          item={item}
          rescheduling={rescheduling}
          onStartRescheduling={() => undefined}
          onRescheduled={() => undefined}
          onClose={() => {
            onClose?.();
            setOpen(false);
          }}
        />
      )}
    </>
  );
}

/** Abre a folha pelo botão (o foco vem dele) e devolve o diálogo. */
async function openSheet(
  item: ClientAgendaItem,
  props: { rescheduling?: Rescheduling | null; onClose?: () => void } = {},
) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <Host item={item} {...props} />
      </AuthProvider>
    </QueryClientProvider>,
  );
  const user = userEvent.setup();
  const opener = await screen.findByRole("button", { name: "Abrir detalhe" });
  await user.click(opener);
  const sheet = await screen.findByRole("dialog", { name: item.name });
  return { user, sheet, opener };
}

function serveDetail(occurrence: ClientAgendaItem) {
  server.use(http.get("/api/agenda/:id", () => HttpResponse.json(occurrence)));
}

describe("ClassDetailSheet", () => {
  beforeEach(() => {
    mockSuccessfulLogin("Cliente");
  });

  describe("cartão da aula", () => {
    it("mostra a modalidade, o título, a data e o horário, o professor e a duração", async () => {
      const occurrence = occurrenceOf();
      serveDetail(occurrence);
      const { sheet } = await openSheet(occurrence);

      expect(within(sheet).getByText("Mobilidade")).toBeInTheDocument();
      expect(within(sheet).getByRole("heading", { name: "Mobilidade e core" })).toBeInTheDocument();
      // O diálogo se descreve pelo dia e horário.
      expect(sheet).toHaveAccessibleDescription("Hoje · 07h00 às 07h45");
      expect(within(sheet).getByText("Professor").nextElementSibling).toHaveTextContent(
        "Prof. Paula",
      );
      expect(within(sheet).getByText("Duração").nextElementSibling).toHaveTextContent("45 minutos");
      expect(
        within(sheet).getByText("Alongamento ativo e fortalecimento do centro do corpo."),
      ).toBeInTheDocument();
    });

    it("sem professor atribuído, não mostra o item Professor", async () => {
      const occurrence = occurrenceOf({ instructor: null });
      serveDetail(occurrence);
      const { sheet } = await openSheet(occurrence);

      expect(within(sheet).queryByText("Professor")).not.toBeInTheDocument();
      expect(within(sheet).getByText("Duração")).toBeInTheDocument();
    });

    it("mostra as vagas em texto, a barra de ocupação e a nota de que a disponibilidade é informativa", async () => {
      const occurrence = occurrenceOf({ capacity: 8, available: 3 });
      serveDetail(occurrence);
      const { sheet } = await openSheet(occurrence);

      expect(within(sheet).getByText("3 de 8 vagas")).toBeInTheDocument();
      const meter = within(sheet).getByRole("img", { name: "5 de 8 vagas ocupadas" });
      expect(meter.firstElementChild).toHaveStyle({ width: "62.5%" });
      expect(
        within(sheet).getByText(
          /A disponibilidade mostrada é informativa; a confirmação depende das vagas/,
        ),
      ).toBeInTheDocument();
      // Aula com vaga e sem aviso de lotação.
      expect(within(sheet).queryByText("Lotada")).not.toBeInTheDocument();
      expect(within(sheet).queryByText("Quase lotada")).not.toBeInTheDocument();
    });

    it("quase lotada: o selo diz em texto", async () => {
      const occurrence = occurrenceOf({ capacity: 8, available: 1 });
      serveDetail(occurrence);
      const { sheet } = await openSheet(occurrence);

      expect(within(sheet).getByText("Quase lotada")).toBeInTheDocument();
    });
  });

  describe("diálogo: foco, Escape e fechamento", () => {
    it("é um diálogo modal nomeado pelo título", async () => {
      const occurrence = occurrenceOf();
      serveDetail(occurrence);
      const { sheet } = await openSheet(occurrence);

      expect(sheet).toHaveAttribute("aria-modal", "true");
      expect(sheet).toHaveAccessibleName("Mobilidade e core");
    });

    it("o foco inicial vai para dentro da folha (o botão de voltar)", async () => {
      const occurrence = occurrenceOf();
      serveDetail(occurrence);
      const { sheet } = await openSheet(occurrence);

      expect(sheet).toContainElement(document.activeElement as HTMLElement);
      expect(screen.getByRole("button", { name: "Voltar para a agenda" })).toHaveFocus();
    });

    it("Escape fecha a folha e o foco volta a quem a abriu", async () => {
      const occurrence = occurrenceOf();
      serveDetail(occurrence);
      const onClose = vi.fn();
      const { user, opener } = await openSheet(occurrence, { onClose });

      await user.keyboard("{Escape}");

      expect(onClose).toHaveBeenCalledTimes(1);
      await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
      expect(opener).toHaveFocus();
    });

    it("o botão de voltar e o de fechar têm nome e fecham a folha", async () => {
      const occurrence = occurrenceOf();
      serveDetail(occurrence);
      const onClose = vi.fn();
      const { user, sheet } = await openSheet(occurrence, { onClose });

      await user.click(within(sheet).getByRole("button", { name: "Voltar para a agenda" }));
      expect(onClose).toHaveBeenCalledTimes(1);

      await user.click(screen.getByRole("button", { name: "Abrir detalhe" }));
      await user.click(
        within(await screen.findByRole("dialog", { name: "Mobilidade e core" })).getByRole(
          "button",
          {
            name: "Fechar",
          },
        ),
      );
      expect(onClose).toHaveBeenCalledTimes(2);
    });

    it("o Tab não sai da folha", async () => {
      const occurrence = occurrenceOf();
      serveDetail(occurrence);
      const { user, sheet } = await openSheet(occurrence);

      // Voltar → Fechar → Reservar aula → (volta a) Voltar.
      for (let i = 0; i < 5; i += 1) {
        await user.tab();
        expect(sheet).toContainElement(document.activeElement as HTMLElement);
      }
    });
  });

  describe("CTA de reserva", () => {
    it("fica no rodapé da folha, em largura total, e está habilitado com vaga", async () => {
      const occurrence = occurrenceOf();
      serveDetail(occurrence);
      const { sheet } = await openSheet(occurrence);

      const cta = within(sheet).getByRole("button", { name: "Reservar aula" });
      expect(cta).toBeEnabled();
      expect(cta).toHaveClass("fb-ui-btn--primary", "fb-ui-btn--block");
      expect(cta.closest(".fb-ui-dialog__footer")).not.toBeNull();
      expect(cta).not.toHaveAttribute("aria-busy");
    });

    it("durante o envio: aria-busy, e um segundo clique não manda outra solicitação", async () => {
      const occurrence = occurrenceOf();
      serveDetail(occurrence);
      let release!: () => void;
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      let posts = 0;
      server.use(
        http.post("/api/reservations", async () => {
          posts += 1;
          await gate;
          return HttpResponse.json(reservationOf(occurrence), { status: 201 });
        }),
      );
      const { user, sheet } = await openSheet(occurrence);

      const cta = within(sheet).getByRole("button", { name: "Reservar aula" });
      await user.click(cta);

      await waitFor(() => expect(cta).toHaveAttribute("aria-busy", "true"));
      await user.click(cta);
      expect(posts).toBe(1);

      await act(async () => release());
      expect(await within(sheet).findByRole("status")).toHaveTextContent(
        "Reserva confirmada com sucesso. Bom treino!",
      );
      expect(posts).toBe(1);
    });

    it("em remarcação, o CTA é 'Remarcar para esta aula' e também mostra aria-busy no envio", async () => {
      const occurrence = occurrenceOf();
      serveDetail(occurrence);
      let release!: () => void;
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      server.use(
        http.post("/api/reservations/:id/reschedule", async () => {
          await gate;
          return HttpResponse.json({ ...reservationOf(occurrence), id: "res-2" }, { status: 201 });
        }),
      );
      const { user, sheet } = await openSheet(occurrence, {
        rescheduling: { reservationId: "res-1", from: occurrenceOf({ id: "occ-original" }) },
      });

      const cta = within(sheet).getByRole("button", { name: "Remarcar para esta aula" });
      await user.click(cta);
      await waitFor(() => expect(cta).toHaveAttribute("aria-busy", "true"));

      await act(async () => release());
      expect(await within(sheet).findByRole("status")).toHaveTextContent(
        "Reserva remarcada. Bom treino!",
      );
    });
  });

  describe("alerta de conflito", () => {
    it("conflito de horário: alerta com 'Conflito de reserva' e a mensagem do backend", async () => {
      const occurrence = occurrenceOf();
      serveDetail(occurrence);
      server.use(
        http.post("/api/reservations", () =>
          HttpResponse.json(
            {
              code: "SCHEDULE_CONFLICT",
              message: "Você já tem uma reserva em Spinning às 07h00, no mesmo horário desta aula.",
              details: {
                reservation: { ...reservationOf(occurrenceOf({ name: "Spinning" })), id: "res-s" },
              },
            },
            { status: 409 },
          ),
        ),
      );
      const { user, sheet } = await openSheet(occurrence);

      await user.click(within(sheet).getByRole("button", { name: "Reservar aula" }));

      const alert = await within(sheet).findByRole("alert");
      expect(alert).toHaveTextContent("Conflito de reserva:");
      expect(alert).toHaveTextContent(
        "Você já tem uma reserva em Spinning às 07h00, no mesmo horário desta aula.",
      );
      // O alerta tem ícone, então não depende só de cor.
      expect(alert.querySelector("svg")).not.toBeNull();
      expect(within(sheet).getByRole("button", { name: "Ver minha agenda" })).toBeEnabled();
    });

    it("outras recusas não levam o prefixo de conflito", async () => {
      const occurrence = occurrenceOf();
      serveDetail(occurrence);
      server.use(
        http.post("/api/reservations", () =>
          HttpResponse.json(
            { code: "DUPLICATE_RESERVATION", message: "Você já reservou esta aula." },
            { status: 409 },
          ),
        ),
      );
      const { user, sheet } = await openSheet(occurrence);

      await user.click(within(sheet).getByRole("button", { name: "Reservar aula" }));

      const alert = await within(sheet).findByRole("alert");
      expect(alert).toHaveTextContent("Você já reservou esta aula.");
      expect(alert).not.toHaveTextContent("Conflito de reserva");
    });
  });

  describe("estados", () => {
    it("aula lotada: o CTA 'Aula lotada' fica desabilitado, com o selo em texto", async () => {
      const occurrence = occurrenceOf({ available: 0 });
      serveDetail(occurrence);
      const { sheet } = await openSheet(occurrence);

      expect(within(sheet).getByRole("button", { name: "Aula lotada" })).toBeDisabled();
      expect(
        within(sheet).queryByRole("button", { name: "Reservar aula" }),
      ).not.toBeInTheDocument();
      expect(within(sheet).getByText("Lotada")).toBeInTheDocument();
      expect(within(sheet).getByText("0 de 8 vagas")).toBeInTheDocument();
      expect(within(sheet).getByRole("img", { name: "8 de 8 vagas ocupadas" })).toBeInTheDocument();
    });

    it("já reservada: mostra a reserva confirmada e as ações de cancelar e remarcar, sem Reservar", async () => {
      const occurrence = occurrenceOf({ myReservationId: "res-1" });
      serveDetail(occurrence);
      const { sheet } = await openSheet(occurrence);

      expect(within(sheet).getByText("RESERVA CONFIRMADA")).toBeInTheDocument();
      expect(within(sheet).getByRole("button", { name: "Cancelar reserva" })).toBeEnabled();
      expect(within(sheet).getByRole("button", { name: "Remarcar" })).toBeEnabled();
      expect(
        within(sheet).queryByRole("button", { name: "Reservar aula" }),
      ).not.toBeInTheDocument();
    });

    it("carregando: mostra 'Atualizando disponibilidade' até a resposta chegar", async () => {
      const occurrence = occurrenceOf();
      let release!: () => void;
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      server.use(
        http.get("/api/agenda/:id", async () => {
          await gate;
          return HttpResponse.json(occurrence);
        }),
      );
      const { sheet } = await openSheet(occurrence);

      const loading = within(sheet).getByRole("status");
      expect(loading).toHaveTextContent("Atualizando disponibilidade");
      expect(loading).toHaveAttribute("aria-busy", "true");
      // A folha já mostra os dados que tinha, sem ficar vazia.
      expect(within(sheet).getByText("3 de 8 vagas")).toBeInTheDocument();

      await act(async () => release());
      await waitFor(() => expect(within(sheet).queryByRole("status")).not.toBeInTheDocument());
    });

    it("erro: aula cancelada ou já iniciada mostra o aviso e desabilita o CTA", async () => {
      const occurrence = occurrenceOf();
      server.use(
        http.get("/api/agenda/:id", () =>
          HttpResponse.json(
            { code: "OCCURRENCE_NOT_FOUND", message: "Aula não encontrada." },
            { status: 404 },
          ),
        ),
      );
      const { sheet } = await openSheet(occurrence);

      const alert = await within(sheet).findByRole("alert");
      expect(alert).toHaveTextContent("Aula indisponível");
      expect(alert).toHaveTextContent("Esta aula não está mais disponível na agenda");
      expect(within(sheet).getByRole("button", { name: "Reservar aula" })).toBeDisabled();
    });

    it("offline: avisa em texto e desabilita o CTA; ao voltar a rede, reabilita", async () => {
      const occurrence = occurrenceOf();
      serveDetail(occurrence);
      const { sheet } = await openSheet(occurrence);
      const cta = within(sheet).getByRole("button", { name: "Reservar aula" });
      expect(cta).toBeEnabled();

      act(() => setBrowserOnline(false));

      expect(within(sheet).getByText("Sem conexão")).toBeInTheDocument();
      expect(cta).toBeDisabled();
      expect(cta).toHaveAttribute("title", expect.stringContaining("sem conexão"));

      act(() => setBrowserOnline(true));

      await waitFor(() => expect(within(sheet).queryByText("Sem conexão")).not.toBeInTheDocument());
      expect(cta).toBeEnabled();
    });
  });
});
