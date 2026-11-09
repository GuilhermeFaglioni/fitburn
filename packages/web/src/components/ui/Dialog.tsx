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
  /**
   * `sheet`: folha. No celular sobe da borda inferior (respeita reduced motion); no desktop é o cartão centralizado.
   * Tem barra superior, corpo que rola e rodapé fixo (`topBar`, `eyebrow`, `footer`).
   */
  variant?: "default" | "sheet";
  /** Folha: barra acima do título (voltar e fechar). Entra antes de tudo na ordem de foco. */
  topBar?: ReactNode;
  /** Folha: selo ou rótulo acima do título. */
  eyebrow?: ReactNode;
  /** Folha: rodapé fixo, sempre visível (ex.: o botão principal em largura total). */
  footer?: ReactNode;
}

/**
 * Diálogo base (#156, D-038): cantos `--r-xl`, sombra `--sh-3`, fundo escurecido por token. Foco inicial no primeiro
 * controle, Tab preso dentro, Escape e clique no fundo fecham, e o foco volta a quem abriu (os três últimos vêm de
 * `useDialogFocus`/`useCloseOnEscape`, os mesmos do `Modal` legado). Monte-o só enquanto estiver aberto.
 */
export function Dialog({
  title,
  description,
  onClose,
  children,
  actions,
  className,
  variant = "default",
  topBar,
  eyebrow,
  footer,
}: DialogProps) {
  const sheet = variant === "sheet";
  const titleId = useId();
  const descriptionId = useId();
  const dialogRef = useDialogFocus<HTMLDivElement>(true, FOCUSABLE);
  useCloseOnEscape(onClose);

  const heading = (
    <>
      {eyebrow}
      <h2 id={titleId} className="fb-ui-dialog__title">
        {title}
      </h2>
      {description && (
        <p id={descriptionId} className="fb-ui-dialog__description">
          {description}
        </p>
      )}
    </>
  );

  return (
    <div
      className={join("fb-ui-dialog-backdrop", sheet && "fb-ui-dialog-backdrop--sheet")}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        className={join("fb-ui-dialog", sheet && "fb-ui-dialog--sheet", className)}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        tabIndex={-1}
      >
        {sheet ? (
          <>
            {topBar && <div className="fb-ui-dialog__topbar">{topBar}</div>}
            <div className="fb-ui-dialog__body">
              {heading}
              {children}
            </div>
            {footer && <div className="fb-ui-dialog__footer">{footer}</div>}
          </>
        ) : (
          <>
            {heading}
            {children}
            {actions && <div className="fb-ui-dialog__actions">{actions}</div>}
          </>
        )}
      </div>
    </div>
  );
}
