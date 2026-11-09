import type { ReactNode } from "react";
import { join } from "./join";

export interface AccordionItem {
  id: string;
  title: ReactNode;
  content: ReactNode;
  defaultOpen?: boolean;
}

export interface AccordionProps {
  items: readonly AccordionItem[];
  className?: string;
}

/**
 * Acordeão base (#156, D-038) sobre `<details>`/`<summary>`: o navegador cuida de abrir, fechar e do teclado
 * (Enter e Espaço no título). O indicador (+ que vira − girando) é decorativo.
 */
export function Accordion({ items, className }: AccordionProps) {
  return (
    <div className={join("fb-ui-accordion", className)}>
      {items.map((item) => (
        <details key={item.id} className="fb-ui-accordion__item" open={item.defaultOpen}>
          <summary>
            <span className="fb-ui-accordion__title">{item.title}</span>
            <span className="fb-ui-accordion__icon" aria-hidden="true" />
          </summary>
          <div className="fb-ui-accordion__panel">{item.content}</div>
        </details>
      ))}
    </div>
  );
}
