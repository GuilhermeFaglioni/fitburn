import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { join } from "./join";

export interface ActionMenuItem {
  key: string;
  label: string;
  /** Nome acessível mais completo que o texto visível (ex.: "Concluir meta X"); o texto visível continua dentro dele. */
  ariaLabel?: string;
  onSelect: () => void;
  /** Ação destrutiva: texto em `--danger`. */
  danger?: boolean;
}

export interface ActionMenuProps {
  /** Nome acessível do botão e do menu (ex.: "Ações da meta Frequentar 12 aulas"): diz sobre o que as ações agem. */
  label: string;
  items: readonly ActionMenuItem[];
  /**
   * `false`: os itens ficam `aria-disabled` (continuam focáveis e não fazem nada). O motivo, quando informado,
   * aparece em texto e é ligado aos itens por `aria-describedby`.
   */
  enabled?: boolean;
  disabledReason?: string;
  /** Conteúdo do botão (o ícone "⋯" por padrão). */
  children?: ReactNode;
  className?: string;
}

function KebabIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true" focusable="false">
      <circle cx="3.5" cy="8" r="1.3" />
      <circle cx="8" cy="8" r="1.3" />
      <circle cx="12.5" cy="8" r="1.3" />
    </svg>
  );
}

/**
 * Menu de ações base (#156, D-038): um botão "⋯" que abre um menu ARIA (`aria-haspopup="menu"`, `aria-expanded`,
 * `role="menu"` e `menuitem`). Ao abrir, o foco vai ao primeiro item. Setas, Home e End percorrem os itens; Escape
 * fecha e devolve o foco ao botão; Tab, clique fora e a saída do foco fecham. Escolher um item fecha o menu e devolve
 * o foco ao botão (a tela decide o que fazer depois, ex.: abrir um diálogo de confirmação). Só tokens.
 */
export function ActionMenu({
  label,
  items,
  enabled = true,
  disabledReason,
  children,
  className,
}: ActionMenuProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const reasonId = useId();

  const menuItems = () =>
    Array.from(menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []);

  // Ao abrir, o foco vai ao primeiro item (mouse ou teclado: é o que o padrão ARIA de menu pede).
  useEffect(() => {
    if (open) menuItems()[0]?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [open]);

  function close(returnFocus: boolean) {
    setOpen(false);
    if (returnFocus) triggerRef.current?.focus();
  }

  function onMenuKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const entries = menuItems();
    const index = entries.indexOf(document.activeElement as HTMLElement);
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        entries[(index + 1) % entries.length]?.focus();
        break;
      case "ArrowUp":
        event.preventDefault();
        entries[(index - 1 + entries.length) % entries.length]?.focus();
        break;
      case "Home":
        event.preventDefault();
        entries[0]?.focus();
        break;
      case "End":
        event.preventDefault();
        entries[entries.length - 1]?.focus();
        break;
      case "Escape":
        event.preventDefault();
        close(true);
        break;
      case "Tab":
        // O foco segue o caminho natural; o menu só se fecha.
        setOpen(false);
        break;
    }
  }

  function choose(item: ActionMenuItem) {
    if (!enabled) return;
    close(true);
    item.onSelect();
  }

  return (
    <div
      ref={rootRef}
      className={join("fb-ui-menu", className)}
      onBlur={(event) => {
        // O foco foi para fora do botão e do menu: fecha, sem roubar o foco de onde ele foi.
        const next = event.relatedTarget as Node | null;
        if (next && !rootRef.current?.contains(next)) setOpen(false);
      }}
    >
      <button
        ref={triggerRef}
        type="button"
        className="fb-ui-menu__trigger"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((current) => !current)}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" && !open) {
            event.preventDefault();
            setOpen(true);
          }
        }}
      >
        {children ?? <KebabIcon />}
      </button>
      {open && (
        <div className="fb-ui-menu__popover">
          <div
            id={menuId}
            ref={menuRef}
            role="menu"
            aria-label={label}
            className="fb-ui-menu__list"
            onKeyDown={onMenuKeyDown}
          >
            {items.map((item) => (
              <button
                key={item.key}
                type="button"
                role="menuitem"
                tabIndex={-1}
                aria-label={item.ariaLabel}
                className={join("fb-ui-menu__item", item.danger && "fb-ui-menu__item--danger")}
                aria-disabled={!enabled ? true : undefined}
                aria-describedby={!enabled && disabledReason ? reasonId : undefined}
                onClick={() => choose(item)}
              >
                {item.label}
              </button>
            ))}
          </div>
          {!enabled && disabledReason && (
            <p id={reasonId} className="fb-ui-menu__reason">
              {disabledReason}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
