import { useEffect, useId, useRef, type ReactNode } from "react";

/** Diálogo modal do canvas de design (fundo escurecido, cartão branco de 460px). */
export function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const titleId = useId();
  const dialogRef = useDialogFocus<HTMLDivElement>();
  useCloseOnEscape(onClose);

  return (
    <div
      className="fb-modal-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        className="fb-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
      >
        <h2 id={titleId} className="fb-modal__title">
          {title}
        </h2>
        {children}
      </div>
    </div>
  );
}

/** Fecha um diálogo com Esc. */
export function useCloseOnEscape(onClose: () => void) {
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);
}

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Foco de um diálogo modal: ao abrir, leva o foco ao primeiro campo (ou ao
 * próprio diálogo, que é anunciado pelo título); o Tab e o Shift+Tab ficam
 * presos dentro dele; ao fechar, devolve o foco a quem o abriu. Vai no
 * elemento com role="dialog" e tabIndex={-1}. `active` (padrão: sempre) serve
 * a painéis que só viram diálogo enquanto estão abertos (a gaveta do menu).
 */
export function useDialogFocus<T extends HTMLElement>(active = true) {
  const ref = useRef<T>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog || !active) return;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;

    const firstField = dialog.querySelector<HTMLElement>(
      'input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled])',
    );
    (firstField ?? dialog).focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "Tab" || !dialog) return;
      const items = Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (items.length === 0) {
        event.preventDefault();
        dialog.focus();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      if (event.shiftKey && (active === first || active === dialog)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    }
    dialog.addEventListener("keydown", handleKeyDown);

    return () => {
      dialog.removeEventListener("keydown", handleKeyDown);
      // Só devolve o foco se ninguém o levou para outro lugar de propósito (ex.: ao
      // escolher uma tela, o foco já foi para o conteúdo dela).
      const current = document.activeElement;
      const focusWasLost = !current || current === document.body || dialog.contains(current);
      if (opener?.isConnected && focusWasLost) opener.focus();
    };
  }, [active]);

  return ref;
}
