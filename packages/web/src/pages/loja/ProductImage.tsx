import { BagIcon } from "../../components/icons/BagIcon";
import { useShopProductImageSrc } from "../../lib/shop/api";

/**
 * Foto do produto: a rota exige o token, então os bytes vêm por `useShopProductImageSrc`. Sem foto, ou enquanto ela
 * não chega (carregando, sem conexão, erro), o espaço mostra a sacola da marca e a tela segue legível.
 */
export function ProductImage({
  url,
  alt,
  className,
}: {
  /** Rota da foto na API (versionada pelo id); sem ela, o espaço da marca. */
  url: string | null | undefined;
  /** Texto alternativo; vazio quando o nome do produto já está ao lado. */
  alt: string;
  className?: string;
}) {
  if (!url) return <Placeholder className={className} />;
  return <LoadedImage url={url} alt={alt} className={className} />;
}

function LoadedImage({
  url,
  alt,
  className,
}: {
  url: string;
  alt: string;
  className?: string;
}) {
  const { src, query } = useShopProductImageSrc(url);
  if (!src) return <Placeholder className={className} busy={query.isPending && query.fetchStatus === "fetching"} />;
  return <img className={className} src={src} alt={alt} />;
}

function Placeholder({ className, busy }: { className?: string; busy?: boolean }) {
  return (
    <span className="fb-loja-photo-empty" aria-busy={busy || undefined}>
      <BagIcon className={className} />
    </span>
  );
}
