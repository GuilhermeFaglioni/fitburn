import { useId } from "react";
import type { InputHTMLAttributes, ReactNode } from "react";
import { join } from "./join";

export interface FieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  /** Ajuda em repouso. Some quando há erro ou sucesso (uma só mensagem por campo). */
  help?: string;
  /** Erro: marca `aria-invalid`, mostra a mensagem anunciada (`role="alert"`) e a liga ao campo. */
  error?: string;
  success?: string;
  /** Controle dentro do campo, à direita do input (ex.: mostrar/ocultar senha). O input reserva o espaço dele. */
  trailing?: ReactNode;
}

/**
 * Campo de texto base (#156, D-038): rótulo, input e mensagem de apoio, nos estados repouso, foco, erro, sucesso e
 * desabilitado. O erro e a ajuda são ligados ao input por `aria-describedby` (somado ao que o chamador passar).
 */
export function Field({
  label,
  help,
  error,
  success,
  trailing,
  id,
  className,
  "aria-describedby": describedBy,
  "aria-invalid": ariaInvalid,
  ...input
}: FieldProps) {
  const generated = useId();
  const inputId = id ?? generated;
  const messageId = `${inputId}-msg`;
  const message = error ?? success ?? help;
  const describedby = join(describedBy, message && messageId) || undefined;
  const renderInput = (extraClass?: string) => (
    <input
      {...input}
      id={inputId}
      className={join("fb-ui-input", !error && success && "fb-ui-input--ok", extraClass)}
      aria-invalid={error ? true : ariaInvalid}
      aria-describedby={describedby}
    />
  );
  return (
    <div className={join("fb-ui-field", className)}>
      <label htmlFor={inputId} className="fb-ui-field__label">
        {label}
      </label>
      {trailing ? (
        <div className="fb-ui-field__control">
          {renderInput("fb-ui-input--has-trailing")}
          <div className="fb-ui-field__trailing">{trailing}</div>
        </div>
      ) : (
        renderInput()
      )}
      {message && (
        <span
          id={messageId}
          role={error ? "alert" : undefined}
          className={join("fb-ui-help", error && "fb-ui-help--err", !error && success && "fb-ui-help--ok")}
        >
          {message}
        </span>
      )}
    </div>
  );
}
