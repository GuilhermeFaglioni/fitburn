import type { ElementType, HTMLAttributes } from "react";
import { join } from "./join";

export interface CardProps extends HTMLAttributes<HTMLElement> {
  /** Elemento HTML do card (`div` por padrão). */
  as?: ElementType;
  /** Destaque: borda de 2px na cor de marca e fundo tingido (ex.: plano recomendado). */
  selected?: boolean;
  /** Sem sombra. */
  flat?: boolean;
}

/** Card base (#156, D-038): raio `--r-lg`, `--sh-2`, padding de 24px. */
export function Card({ as: Tag = "div", selected = false, flat = false, className, ...rest }: CardProps) {
  return (
    <Tag
      {...rest}
      className={join("fb-ui-card", selected && "fb-ui-card--selected", flat && "fb-ui-card--flat", className)}
    />
  );
}
