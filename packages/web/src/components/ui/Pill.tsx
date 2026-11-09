import type { ButtonHTMLAttributes } from "react";
import { join } from "./join";

export interface PillProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "aria-pressed"> {
  pressed: boolean;
}

/** Pílula de filtro (#156, D-038): botão de alternância (`aria-pressed`); marcada inverte tinta e fundo. */
export function Pill({ pressed, className, type = "button", ...rest }: PillProps) {
  return <button {...rest} type={type} aria-pressed={pressed} className={join("fb-ui-pill", className)} />;
}
