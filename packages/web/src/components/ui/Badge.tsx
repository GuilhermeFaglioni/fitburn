import type { HTMLAttributes } from "react";
import { join } from "./join";

export type BadgeTone = "neutral" | "brand" | "solid" | "ok" | "warn" | "err";

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone;
  /** Ponto colorido antes do texto (decorativo). */
  dot?: boolean;
}

/** Selo (#156, D-038): neutro, marca, sólido, ok, aviso e erro. O significado vai no texto, nunca só na cor. */
export function Badge({ tone = "neutral", dot = false, className, children, ...rest }: BadgeProps) {
  return (
    <span {...rest} className={join("fb-ui-badge", `fb-ui-badge--${tone}`, className)}>
      {dot && <span className="fb-ui-badge__dot" aria-hidden="true" />}
      {children}
    </span>
  );
}
