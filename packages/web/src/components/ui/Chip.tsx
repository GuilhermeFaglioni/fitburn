import type { ButtonHTMLAttributes } from "react";
import { join } from "./join";

export interface ChipProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "aria-pressed" | "children"> {
  /** Rótulo pequeno, em cima (ex.: "Ter"). */
  label: string;
  /** Contador em destaque, embaixo (ex.: o dia do mês, "10"). */
  value: string;
  pressed: boolean;
}

/** Chip de dia (#156, D-038): botão de alternância com rótulo e número em destaque. Marcado usa o gradiente CTA. */
export function Chip({ label, value, pressed, className, type = "button", ...rest }: ChipProps) {
  return (
    <button {...rest} type={type} aria-pressed={pressed} className={join("fb-ui-chip", className)}>
      {label}
      {/* O espaço mantém o nome acessível legível ("Ter 10", e não "Ter10"); no layout ele some (flex). */}{" "}
      <b className="fb-ui-chip__value">{value}</b>
    </button>
  );
}
