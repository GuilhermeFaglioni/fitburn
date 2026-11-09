import type { Key, ReactNode } from "react";
import { join } from "./join";

export interface DescriptionItem {
  key?: Key;
  term: string;
  detail: ReactNode;
}

/** Lista de termo e valor (#156, D-038), ex.: os dados pessoais de um cliente. Uma coluna só no celular. */
export function DescriptionList({
  items,
  className,
}: {
  items: readonly DescriptionItem[];
  className?: string;
}) {
  return (
    <dl className={join("fb-ui-dl", className)}>
      {items.map((item) => (
        <div key={item.key ?? item.term} className="fb-ui-dl__row">
          <dt>{item.term}</dt>
          <dd>{item.detail}</dd>
        </div>
      ))}
    </dl>
  );
}
