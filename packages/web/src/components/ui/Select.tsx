import { useId } from "react";
import type { ReactNode, SelectHTMLAttributes } from "react";
import { join } from "./join";

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label: string;
  /** Ajuda em repouso. Some quando há erro (uma só mensagem por campo). */
  help?: string;
  /** Erro: marca `aria-invalid`, mostra a mensagem anunciada (`role="alert"`) e a liga ao campo. */
  error?: string;
  /** Rótulo só para leitores de tela (barras de filtro). */
  hideLabel?: boolean;
  children: ReactNode;
}

/**
 * Lista de escolha base (#156, D-038): mesmo rótulo, borda, foco e mensagem do `Field`, sobre o `<select>` nativo
 * (teclado, leitor de tela e o seletor do celular de graça). O erro e a ajuda são ligados por `aria-describedby`.
 */
export function Select({
  label,
  help,
  error,
  hideLabel,
  id,
  className,
  children,
  "aria-describedby": describedBy,
  "aria-invalid": ariaInvalid,
  ...select
}: SelectProps) {
  const generated = useId();
  const selectId = id ?? generated;
  const messageId = `${selectId}-msg`;
  const message = error ?? help;
  const describedby = join(describedBy, message && messageId) || undefined;
  return (
    <div className={join("fb-ui-field", className)}>
      <label
        htmlFor={selectId}
        className={join("fb-ui-field__label", hideLabel && "fb-ui-sr-only")}
      >
        {label}
      </label>
      <select
        {...select}
        id={selectId}
        className="fb-ui-input fb-ui-select"
        aria-invalid={error ? true : ariaInvalid}
        aria-describedby={describedby}
      >
        {children}
      </select>
      {message && (
        <span
          id={messageId}
          role={error ? "alert" : undefined}
          className={join("fb-ui-help", error && "fb-ui-help--err")}
        >
          {message}
        </span>
      )}
    </div>
  );
}
