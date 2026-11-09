import type { ReactNode } from "react";
import { join } from "./join";

export interface PageHeaderProps {
  /** Rótulo curto acima do título (ex.: "Clientes", "Cadastro"). */
  kicker?: string;
  /** Título da tela: o `h1`. */
  title: ReactNode;
  /** Selo ao lado do título (ex.: a situação do cliente). */
  badge?: ReactNode;
  /** Ações da tela, à direita do título (quebram abaixo no celular). */
  actions?: ReactNode;
  /** Trilha acima do cabeçalho (ex.: "Clientes / Novo cliente"); o último item é a tela atual. */
  crumb?: ReactNode;
  className?: string;
}

/**
 * Cabeçalho de tela do admin (#156, D-038): kicker, título (`h1`) e ações. A trilha, quando existe, vem acima e é uma
 * navegação rotulada. Estilo em `styles/components.css` (`.fb-ui-pagehead`); só tokens.
 */
export function PageHeader({ kicker, title, badge, actions, crumb, className }: PageHeaderProps) {
  return (
    <>
      {crumb && (
        <nav aria-label="Trilha de navegação" className="fb-ui-crumb">
          {crumb}
        </nav>
      )}
      <header className={join("fb-ui-pagehead", className)}>
        <div className="fb-ui-pagehead__text">
          {kicker && <p className="fb-ui-pagehead__kicker">{kicker}</p>}
          {/* O selo fica fora do h1: o nome acessível do título é só o título. */}
          <div className="fb-ui-pagehead__titlerow">
            <h1 className="fb-ui-pagehead__title">{title}</h1>
            {badge}
          </div>
        </div>
        {actions && <div className="fb-ui-pagehead__actions">{actions}</div>}
      </header>
    </>
  );
}
