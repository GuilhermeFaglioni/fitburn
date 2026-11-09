import { FlameMark } from "./icons/FlameMark";

/** Marca da casca administrativa: a chama e o nome, na barra lateral, na gaveta e no cabeçalho do celular. */
export function AdminBrand({ className }: { className?: string }) {
  return (
    <span className={className ? `fb-admin__brand ${className}` : "fb-admin__brand"}>
      <FlameMark className="fb-admin__brand-mark" />
      FITBURN
    </span>
  );
}
