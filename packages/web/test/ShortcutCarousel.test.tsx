import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useLocation } from "react-router-dom";
import { ShortcutCarousel } from "../src/components/ui/ShortcutCarousel";

function Probe() {
  const location = useLocation();
  return <output data-testid="local">{location.pathname}</output>;
}

function renderCarousel(count = 3) {
  const slides = Array.from({ length: count }, (_, index) => ({
    key: `s${index}`,
    to: `/destino/${index}`,
    children: <span>Conteúdo {index}</span>,
  }));
  return render(
    <MemoryRouter>
      <ShortcutCarousel label="Atalho de teste" slides={slides} footLink={{ to: "/mais", label: "Mais →" }} />
      <Probe />
    </MemoryRouter>,
  );
}

function activeDot(container: HTMLElement): number {
  return Array.from(container.querySelectorAll(".fb-ui-carousel__dots i")).findIndex((dot) =>
    dot.hasAttribute("data-active"),
  );
}

describe("carrossel de atalho (N2)", () => {
  it("é um carrossel acessível: grupo com roledescription, nome e slides 'N de M'", () => {
    renderCarousel();
    const carousel = screen.getByRole("group", { name: "Atalho de teste" });
    expect(carousel).toHaveAttribute("aria-roledescription", "carrossel");
    const slides = screen.getAllByRole("group", { name: /^\d de 3$/ });
    expect(slides).toHaveLength(3);
    for (const slide of slides) expect(slide).toHaveAttribute("aria-roledescription", "slide");
    expect(screen.getByRole("link", { name: "Conteúdo 1" })).toHaveAttribute("href", "/destino/1");
  });

  it("não troca sozinho: sem aria-live e sem temporizador de autoplay", () => {
    const { container } = renderCarousel();
    expect(container.querySelector(".fb-ui-carousel__track")).toHaveAttribute("aria-live", "off");
  });

  it("os pontinhos são decorativos e o primeiro começa ativo", () => {
    const { container } = renderCarousel();
    const dots = container.querySelector(".fb-ui-carousel__dots");
    expect(dots).toHaveAttribute("aria-hidden", "true");
    expect(dots?.querySelectorAll("i")).toHaveLength(3);
    expect(activeDot(container)).toBe(0);
  });

  it("com um slide só não mostra pontinhos, mas mantém o link do rodapé", () => {
    const { container } = renderCarousel(1);
    expect(container.querySelector(".fb-ui-carousel__dots")).toBeNull();
    expect(screen.getByRole("link", { name: "Mais →" })).toHaveAttribute("href", "/mais");
  });

  it("seta para a direita leva o foco ao próximo slide e os pontinhos acompanham", async () => {
    const user = userEvent.setup();
    const { container } = renderCarousel();
    await user.tab();
    expect(screen.getByRole("link", { name: "Conteúdo 0" })).toHaveFocus();

    await user.keyboard("{ArrowRight}");
    expect(screen.getByRole("link", { name: "Conteúdo 1" })).toHaveFocus();
    expect(activeDot(container)).toBe(1);

    await user.keyboard("{ArrowRight}{ArrowRight}");
    // Não passa do último.
    expect(screen.getByRole("link", { name: "Conteúdo 2" })).toHaveFocus();
    expect(activeDot(container)).toBe(2);

    await user.keyboard("{ArrowLeft}");
    expect(screen.getByRole("link", { name: "Conteúdo 1" })).toHaveFocus();
  });

  it("Home e End vão ao primeiro e ao último slide", async () => {
    const user = userEvent.setup();
    const { container } = renderCarousel();
    await user.tab();
    await user.keyboard("{End}");
    expect(screen.getByRole("link", { name: "Conteúdo 2" })).toHaveFocus();
    await user.keyboard("{Home}");
    expect(screen.getByRole("link", { name: "Conteúdo 0" })).toHaveFocus();
    expect(activeDot(container)).toBe(0);
  });

  it("Tab até um slide fora da tela atualiza os pontinhos", async () => {
    const user = userEvent.setup();
    const { container } = renderCarousel();
    await user.tab();
    await user.tab();
    expect(screen.getByRole("link", { name: "Conteúdo 1" })).toHaveFocus();
    expect(activeDot(container)).toBe(1);
  });

  it("Enter no slide em foco e o clique abrem o destino do slide", async () => {
    const user = userEvent.setup();
    renderCarousel();
    await user.tab();
    await user.keyboard("{ArrowRight}{Enter}");
    expect(screen.getByTestId("local")).toHaveTextContent("/destino/1");
  });

  it("o link do rodapé abre o destino dele", async () => {
    const user = userEvent.setup();
    renderCarousel();
    await user.click(screen.getByRole("link", { name: "Mais →" }));
    expect(screen.getByTestId("local")).toHaveTextContent("/mais");
  });
});
