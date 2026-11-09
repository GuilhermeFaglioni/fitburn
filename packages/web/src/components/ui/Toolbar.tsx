import type { HTMLAttributes } from "react";
import { join } from "./join";

/** Barra de filtros acima de uma tabela (#156, D-038): busca e seletores na mesma linha, que quebra no celular. */
export function Toolbar({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div {...rest} className={join("fb-ui-toolbar", className)} />;
}
