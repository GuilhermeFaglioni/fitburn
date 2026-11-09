import type { HTMLAttributes } from "react";
import { join } from "./join";

export interface AlertProps extends HTMLAttributes<HTMLDivElement> {
  /** `err`: recusa ou conflito (`role="alert"`); `ok`: resultado positivo (`role="status"`). */
  tone?: "err" | "ok";
}

const ICON = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": true,
  focusable: false,
} as const;

/**
 * Aviso em linha (#156, D-038): ícone e texto, nunca só cor. Erro anuncia na hora (`role="alert"`), sucesso é
 * `status`. Cores e raio vêm dos tokens `--danger*` e `--success*`.
 */
export function Alert({ tone = "err", className, children, role, ...rest }: AlertProps) {
  return (
    <div
      {...rest}
      role={role ?? (tone === "err" ? "alert" : "status")}
      className={join("fb-ui-alert", `fb-ui-alert--${tone}`, className)}
    >
      <svg className="fb-ui-alert__icon" {...ICON}>
        {tone === "err" ? (
          <>
            <circle cx="12" cy="12" r="9" />
            <path d="M12 7v6M12 17h.01" />
          </>
        ) : (
          <path d="M5 12.5l4.5 4.5L19 7.5" />
        )}
      </svg>
      <span className="fb-ui-alert__text">{children}</span>
    </div>
  );
}
