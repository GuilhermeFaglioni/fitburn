import type { ReactNode } from "react";

/**
 * Estados compartilhados de carregando, vazio, erro e feedback: todas as telas
 * usam estes componentes para que a aparência e o anúncio para leitores de tela
 * sejam os mesmos. `surface` escolhe o tema da área (clara nas telas
 * administrativas, escura nas do cliente); `className` permite um ajuste local
 * de espaçamento sem reimplementar o estado.
 */
export type StateSurface = "light" | "dark";

function join(...parts: (string | undefined | false)[]): string {
  return parts.filter(Boolean).join(" ");
}

export function LoadingState({
  label = "Carregando…",
  surface = "light",
  className,
}: {
  label?: string;
  surface?: StateSurface;
  className?: string;
}) {
  return (
    <p
      role="status"
      data-state="loading"
      className={join("fb-state", "fb-state--loading", `fb-state--${surface}`, className)}
    >
      {label}
    </p>
  );
}

export function EmptyState({
  message,
  action,
  surface = "light",
  className,
}: {
  message: ReactNode;
  action?: ReactNode;
  surface?: StateSurface;
  className?: string;
}) {
  return (
    <div
      data-state="empty"
      className={join("fb-state", "fb-state--empty", `fb-state--${surface}`, className)}
    >
      <span>{message}</span>
      {action}
    </div>
  );
}

export function ErrorState({
  message,
  onRetry,
  surface = "light",
  className,
}: {
  message: ReactNode;
  /** Quando informado, mostra "Tentar novamente" ao lado da mensagem. */
  onRetry?: () => void;
  surface?: StateSurface;
  className?: string;
}) {
  return (
    <div
      role="alert"
      data-state="error"
      className={join("fb-state", "fb-state--error", `fb-state--${surface}`, className)}
    >
      <span>{message}</span>
      {onRetry && (
        <button type="button" className="fb-state__retry" onClick={onRetry}>
          Tentar novamente
        </button>
      )}
    </div>
  );
}

/** Retorno de uma ação: sucesso (status, não interrompe) ou erro (alerta). */
export function Feedback({
  tone,
  children,
  surface = "light",
  className,
}: {
  tone: "success" | "error";
  children: ReactNode;
  surface?: StateSurface;
  className?: string;
}) {
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      data-state={tone}
      className={join("fb-state", `fb-state--${tone}`, `fb-state--${surface}`, className)}
    >
      {children}
    </div>
  );
}
