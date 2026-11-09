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
  /** `id` do elemento com `role="dialog"`, para o `aria-controls` do botão que o abre. */
  id?: string;
  /**
   * `sheet`: folha. No celular sobe da borda inferior (respeita reduced motion); no desktop é o cartão centralizado.
   * `drawer`: gaveta. Painel de altura total preso à borda esquerda, que entra deslizando (a navegação do admin no celular).
   * As duas têm barra superior, corpo que rola e rodapé fixo (`topBar`, `eyebrow`, `footer`).
   */
  variant?: "default" | "sheet" | "drawer";
  /** Folha e gaveta: barra acima do título (voltar e fechar). Entra antes de tudo na ordem de foco. */
  topBar?: ReactNode;
  /** Folha e gaveta: selo ou rótulo acima do título. */
  eyebrow?: ReactNode;
  /** Folha e gaveta: rodapé fixo, sempre visível (ex.: o botão principal em largura total). */
  footer?: ReactNode;
}

/**
 * Diálogo base (#156, D-038): cantos `--r-xl`, sombra `--sh-3`, fundo escurecido por token. Foco inicial no primeiro
 * controle, Tab preso dentro, Escape e clique no fundo fecham, e o foco volta a quem abriu (os três últimos vêm de
 * `useDialogFocus`/`useCloseOnEscape`, de components/Modal.tsx). Monte-o só enquanto estiver aberto.
 */
export function Dialog({
  title,
  description,
  onClose,
  children,
  actions,
  className,
  id,
  variant = "default",
  topBar,
  eyebrow,
  footer,
}: DialogProps) {
  const structured = variant !== "default";
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
      className={join(
        "fb-ui-dialog-backdrop",
        variant === "sheet" && "fb-ui-dialog-backdrop--sheet",
        variant === "drawer" && "fb-ui-dialog-backdrop--drawer",
      )}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        id={id}
        className={join(
          "fb-ui-dialog",
          variant === "sheet" && "fb-ui-dialog--sheet",
          variant === "drawer" && "fb-ui-dialog--drawer",
          className,
        )}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        tabIndex={-1}
      >
        {structured ? (
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
