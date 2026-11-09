import type { ButtonHTMLAttributes, MouseEvent } from "react";
import { join } from "./join";

export type ButtonVariant = "primary" | "secondary" | "soft" | "ghost" | "danger";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: "md" | "sm";
  /** Ocupa a largura toda do contêiner. */
  block?: boolean;
  /** Carregando: `aria-busy`, spinner e nenhum clique passa. Não usa `disabled`, para o foco do teclado não se perder. */
  busy?: boolean;
}

/**
 * Botão base (#156, D-038): primário com gradiente CTA, secundário, soft, ghost, perigo e pequeno.
 * Estilo em `styles/components.css` (`.fb-ui-btn`); só tokens.
 */
export function Button({
  variant = "secondary",
  size = "md",
  block = false,
  busy = false,
  type = "button",
  className,
  onClick,
  children,
  ...rest
}: ButtonProps) {
  const handleClick = (event: MouseEvent<HTMLButtonElement>) => {
    if (busy) {
      event.preventDefault();
      return;
    }
    onClick?.(event);
  };
  return (
    <button
      {...rest}
      type={type}
      aria-busy={busy || undefined}
      className={join(
        "fb-ui-btn",
        `fb-ui-btn--${variant}`,
        size === "sm" && "fb-ui-btn--sm",
        block && "fb-ui-btn--block",
        className,
      )}
      onClick={handleClick}
    >
      {busy && <span className="fb-ui-spinner" aria-hidden="true" />}
      {children}
    </button>
  );
}
