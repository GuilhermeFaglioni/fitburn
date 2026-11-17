import { useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { join } from "./join";

/**
 * Carrossel de atalho (N2, #201, "B · Atalhos deslizantes"): um cartão com slides tocáveis, scroll-snap horizontal,
 * pontinhos de posição e um link no rodapé. Sem troca automática: só muda quando a pessoa desliza ou usa o teclado.
 * Acessível como carrossel (`aria-roledescription`), cada slide é um grupo "N de M" com um único link. Tab entra no
 * slide, e as setas, Home e End levam o foco ao slide vizinho. Com `prefers-reduced-motion` a rolagem é direta.
 */

export interface ShortcutSlide {
  key: string;
  /** Destino do toque no slide. */
  to: string;
  /** Classe extra do link do slide (o conteúdo é de quem usa o componente). */
  className?: string;
  children: ReactNode;
}

export interface ShortcutCarouselProps {
  /** Nome do carrossel para leitores de tela ("Composição corporal"). */
  label: string;
  slides: readonly ShortcutSlide[];
  /** Link do rodapé, sempre visível ("Evolução →"). */
  footLink: { to: string; label: string };
  className?: string;
}

/** O cartão do atalho, também usado nos estados (carregando, erro, sem conexão) de cada atalho. */
export function ShortcutFrame({
  label,
  className,
  children,
}: {
  label: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div role="group" aria-label={label} className={join("fb-ui-carousel", className)}>
      {children}
    </div>
  );
}

function prefersReducedMotion(): boolean {
  return typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function ShortcutCarousel({ label, slides, footLink, className }: ShortcutCarouselProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  const count = slides.length;

  function indexFromScroll(track: HTMLDivElement): number {
    if (track.clientWidth === 0) return 0;
    return Math.min(count - 1, Math.max(0, Math.round(track.scrollLeft / track.clientWidth)));
  }

  function go(index: number) {
    const track = trackRef.current;
    if (!track) return;
    const next = Math.min(count - 1, Math.max(0, index));
    setActive(next);
    const link = track.querySelectorAll<HTMLElement>("[data-slide-link]")[next];
    link?.focus({ preventScroll: true });
    track.scrollTo?.({
      left: next * track.clientWidth,
      behavior: prefersReducedMotion() ? "auto" : "smooth",
    });
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    const target = (event.target as HTMLElement).closest("[data-slide]");
    const current = target ? Number(target.getAttribute("data-slide")) : active;
    const next =
      event.key === "ArrowRight"
        ? current + 1
        : event.key === "ArrowLeft"
          ? current - 1
          : event.key === "Home"
            ? 0
            : event.key === "End"
              ? count - 1
              : null;
    if (next === null) return;
    event.preventDefault();
    go(next);
  }

  return (
    <div
      role="group"
      aria-roledescription="carrossel"
      aria-label={label}
      className={join("fb-ui-carousel", className)}
    >
      <div
        ref={trackRef}
        className="fb-ui-carousel__track"
        aria-live="off"
        onKeyDown={onKeyDown}
        onScroll={(event) => setActive(indexFromScroll(event.currentTarget))}
        onFocus={(event) => {
          // Tab até um slide fora da tela: o navegador o traz para a vista e os pontinhos acompanham.
          const slide = (event.target as HTMLElement).closest("[data-slide]");
          if (slide) setActive(Number(slide.getAttribute("data-slide")));
        }}
      >
        {slides.map((slide, index) => (
          <div
            key={slide.key}
            role="group"
            aria-roledescription="slide"
            aria-label={`${index + 1} de ${count}`}
            data-slide={index}
            className="fb-ui-carousel__slide"
          >
            <Link
              to={slide.to}
              data-slide-link=""
              className={join("fb-ui-carousel__link", slide.className)}
            >
              {slide.children}
            </Link>
          </div>
        ))}
      </div>
      <div className="fb-ui-carousel__foot">
        {count > 1 ? (
          <span className="fb-ui-carousel__dots" aria-hidden="true">
            {slides.map((slide, index) => (
              <i key={slide.key} data-active={index === active || undefined} />
            ))}
          </span>
        ) : (
          <span />
        )}
        <Link to={footLink.to} className="fb-ui-carousel__more">
          {footLink.label}
        </Link>
      </div>
    </div>
  );
}
