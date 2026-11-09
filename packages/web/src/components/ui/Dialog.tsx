import { useId, type ReactNode } from "react";
import { FOCUSABLE, useCloseOnEscape, useDialogFocus } from "../Modal";
import { join } from "./join";

export interface DialogProps {
  title: string;
  /** Texto de apoio abaixo do título; vira a descrição acessível do diálogo. */
  description?: ReactNode;
  onClose: () => void;
  /** Conteúdo entre a descrição e as ações (campos, avisos). */
  children?: ReactNode;
  /** Botões do rodapé, alinhados à direita. */
  actions?: ReactNode;
  className?: string;
}

/**
 * Diálogo base (#156, D-038): cantos `--r-xl`, sombra `--sh-3`, fundo escurecido por token. Foco inicial no primeiro
 * controle, Tab preso dentro, Escape e clique no fundo fecham, e o foco volta a quem abriu (os três últimos vêm de
 * `useDialogFocus`/`useCloseOnEscape`, os mesmos do `Modal` legado). Monte-o só enquanto estiver aberto.
 */
export function Dialog({ title, description, onClose, children, actions, className }: DialogProps) {
  const titleId = useId();
  const descriptionId = useId();
  const dialogRef = useDialogFocus<HTMLDivElement>(true, FOCUSABLE);
  useCloseOnEscape(onClose);

  return (
    <div
      className="fb-ui-dialog-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        className={join("fb-ui-dialog", className)}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        tabIndex={-1}
      >
        <h2 id={titleId} className="fb-ui-dialog__title">
          {title}
        </h2>
        {description && (
          <p id={descriptionId} className="fb-ui-dialog__description">
            {description}
          </p>
        )}
        {children}
        {actions && <div className="fb-ui-dialog__actions">{actions}</div>}
      </div>
    </div>
  );
}
