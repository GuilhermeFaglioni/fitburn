import type { ReactNode } from "react";
import { Button } from "./Button";
import { join } from "./join";

/**
 * Estados base (#156, D-038): vazio, erro, offline e carregando. O tema decide as cores (só tokens). Cada estado traz
 * texto e, quando cabe, uma ação; o offline tem ícone e texto, então não depende só de cor.
 */

interface StateShellProps {
  className?: string;
}

const iconProps = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": true,
  focusable: false,
} as const;

export interface EmptyStateProps extends StateShellProps {
  title: string;
  description?: ReactNode;
  /** Ação principal (ex.: um botão ou link). */
  action?: ReactNode;
}

export function EmptyState({ title, description, action, className }: EmptyStateProps) {
  return (
    <div data-state="empty" className={join("fb-ui-state", "fb-ui-state--empty", className)}>
      <p className="fb-ui-state__title">{title}</p>
      {description && <p className="fb-ui-state__text">{description}</p>}
      {action && <div className="fb-ui-state__action">{action}</div>}
    </div>
  );
}

export interface ErrorStateProps extends StateShellProps {
  title?: string;
  description?: ReactNode;
  /** Quando informado, mostra o botão de tentar de novo. */
  onRetry?: () => void;
  retryLabel?: string;
}

export function ErrorState({
  title = "Algo deu errado",
  description,
  onRetry,
  retryLabel = "Tentar novamente",
  className,
}: ErrorStateProps) {
  return (
    <div role="alert" data-state="error" className={join("fb-ui-state", "fb-ui-state--error", className)}>
      <svg className="fb-ui-state__icon" {...iconProps}>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7.5v5.5M12 16.5h.01" />
      </svg>
      <p className="fb-ui-state__title">{title}</p>
      {description && <p className="fb-ui-state__text">{description}</p>}
      {onRetry && (
        <div className="fb-ui-state__action">
          <Button size="sm" onClick={onRetry}>
            {retryLabel}
          </Button>
        </div>
      )}
    </div>
  );
}

export interface OfflineStateProps extends StateShellProps {
  title?: string;
  description?: ReactNode;
  onRetry?: () => void;
  retryLabel?: string;
}

export function OfflineState({
  title = "Sem conexão",
  description = "Esta tela precisa de internet. Confira a conexão e tente de novo.",
  onRetry,
  retryLabel = "Verificar conexão",
  className,
}: OfflineStateProps) {
  return (
    <div role="status" data-state="offline" className={join("fb-ui-state", "fb-ui-state--offline", className)}>
      <svg className="fb-ui-state__icon" {...iconProps}>
        <path d="M3 3l18 18" />
        <path d="M8.5 16.4a5 5 0 0 1 7 0M5 12.9a10 10 0 0 1 3.2-2.1M19 12.9a10 10 0 0 0-5.4-2.8M2 9.4a15 15 0 0 1 4.3-2.6M22 9.4A15 15 0 0 0 12 5.5" />
        <path d="M12 20h.01" />
      </svg>
      <p className="fb-ui-state__title">{title}</p>
      {description && <p className="fb-ui-state__text">{description}</p>}
      {onRetry && (
        <div className="fb-ui-state__action">
          <Button size="sm" onClick={onRetry}>
            {retryLabel}
          </Button>
        </div>
      )}
    </div>
  );
}

export interface LoadingStateProps extends StateShellProps {
  label?: string;
}

export function LoadingState({ label = "Carregando…", className }: LoadingStateProps) {
  return (
    <p role="status" aria-busy="true" data-state="loading" className={join("fb-ui-state", "fb-ui-state--loading", className)}>
      <span className="fb-ui-state__spinner" aria-hidden="true" />
      {label}
    </p>
  );
}
