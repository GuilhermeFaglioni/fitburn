import { Link } from "react-router-dom";
import { BackIcon } from "../../components/icons/BackIcon";

/** Topo das telas da loja: botão de voltar (sempre para a tela de cima) e, quando a tela não tem outro `h1`, o título. */
export function ShopTopBar({ title, backTo, backLabel }: { title?: string; backTo: string; backLabel: string }) {
  return (
    <div className="fb-loja-top">
      <Link to={backTo} className="fb-loja-back" aria-label={backLabel}>
        <BackIcon />
      </Link>
      {title && <h1 className="fb-loja-top__title">{title}</h1>}
    </div>
  );
}
