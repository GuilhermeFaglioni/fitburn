import { useId } from "react";
import type { TextareaHTMLAttributes } from "react";
import { join } from "./join";

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label: string;
  /** Ajuda em repouso. Some quando há erro (uma só mensagem por campo). */
  help?: string;
  /** Erro: marca `aria-invalid`, mostra a mensagem anunciada (`role="alert"`) e a liga ao campo. */
  error?: string;
}

/**
 * Campo de texto de várias linhas base (#156, D-038): o mesmo rótulo, borda, foco e mensagem do `Field`, sobre o
 * `<textarea>` nativo. Existe porque observações podem ter quebras de linha, que um `<input>` apagaria ao editar.
 */
export function Textarea({
  label,
  help,
  error,
  id,
  className,
  rows = 3,
  "aria-describedby": describedBy,
  "aria-invalid": ariaInvalid,
  ...textarea
}: TextareaProps) {
  const generated = useId();
  const textareaId = id ?? generated;
  const messageId = `${textareaId}-msg`;
  const message = error ?? help;
  const describedby = join(describedBy, message && messageId) || undefined;
  return (
    <div className={join("fb-ui-field", className)}>
      <label htmlFor={textareaId} className="fb-ui-field__label">
        {label}
      </label>
      <textarea
        {...textarea}
        id={textareaId}
        rows={rows}
        className="fb-ui-input fb-ui-textarea"
        aria-invalid={error ? true : ariaInvalid}
        aria-describedby={describedby}
      />
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
