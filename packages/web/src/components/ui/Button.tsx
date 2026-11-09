import type { ButtonHTMLAttributes, MouseEvent, Ref } from "react";
import { join } from "./join";

export type ButtonVariant = "primary" | "secondary" | "soft" | "ghost" | "danger" | "ghost-danger";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: "md" | "sm";
  /** Ocupa a largura toda do contêiner. */
  block?: boolean;
  /** Carregando: `aria-busy`, spinner e nenhum clique passa. Não usa `disabled`, para o foco do teclado não se perder. */
  busy?: boolean;
  /** Ref do `<button>` (React 19 repassa `ref` como prop): quem precisa devolver o foco ao botão o usa. */
  ref?: Ref<HTMLButtonElement>;
}

/**
 * Botão base (#156, D-038): primário com gradiente CTA, secundário, soft, ghost, perigo e pequeno. `ghost-danger` é o
 * "Excluir" discreto das linhas de tabela (texto em `--danger`, sem preenchimento).
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
