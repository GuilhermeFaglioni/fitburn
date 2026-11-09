import type { ReactNode } from "react";
import { NavLink } from "react-router-dom";
import { join } from "./join";

export interface BottomNavItem {
  to: string;
  label: string;
  /** Ícone (SVG com `currentColor`); fica escondido dos leitores de tela, o rótulo já nomeia o link. */
  icon: ReactNode;
  /** Só marca como atual na rota exata (ex.: "/" do início). */
  end?: boolean;
}

export interface BottomNavProps {
  /** Nome da navegação para leitores de tela. */
  label: string;
  /** Os itens vêm de quem usa: o componente não fixa o conteúdo nem a quantidade. */
  items: readonly BottomNavItem[];
  className?: string;
}

/**
 * Barra inferior (#156, D-038). A página atual recebe `aria-current="page"` do `NavLink`; cada item tem alvo de
 * toque de 44px e a barra distribui as colunas conforme a quantidade de itens.
 */
export function BottomNav({ label, items, className }: BottomNavProps) {
  return (
    <nav
      aria-label={label}
      className={join("fb-ui-bottom-nav", className)}
      style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}
    >
      {items.map((item) => (
        <NavLink key={item.to} to={item.to} end={item.end} className="fb-ui-bottom-nav__item">
          <span className="fb-ui-bottom-nav__icon" aria-hidden="true">
            {item.icon}
          </span>
          <span className="fb-ui-bottom-nav__label">{item.label}</span>
        </NavLink>
      ))}
    </nav>
  );
}
