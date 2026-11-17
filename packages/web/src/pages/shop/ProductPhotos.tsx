import { MAX_PRODUCT_IMAGES, type ShopProductDetail, type ShopProductImage } from "@fitburn/contracts";
import { Badge } from "../../components/ui/Badge";
import { Card } from "../../components/ui/Card";
import { EmptyState } from "../../components/ui/States";
import { useShopProductImageSrc } from "../../lib/shop/api";

interface ProductPhotosProps {
  /** Sem produto (cadastro novo) a seção só avisa que as fotos vêm depois de salvar. */
  product?: ShopProductDetail;
}

/**
 * Seção "Fotos" do produto (L3, #191, D-040): grade de 5 espaços, até 5 fotos, a primeira é a capa. As fotos são
 * gravadas na hora (não esperam o "Salvar produto"), então a seção só existe na edição; no cadastro novo ela avisa
 * que as fotos ficam disponíveis depois de salvar o produto.
 */
export function ProductPhotos({ product }: ProductPhotosProps) {
  if (!product) {
    return (
      <PhotosCard>
        <p className="fb-ui-note">
          As fotos ficam disponíveis depois de salvar o produto. Salve o produto e abra-o de novo para
          adicionar até {MAX_PRODUCT_IMAGES} fotos.
        </p>
      </PhotosCard>
    );
  }
  return <PhotosGrid images={[...(product.images ?? [])].sort((a, b) => a.position - b.position)} />;
}

function PhotosCard({ count, children }: { count?: number; children: React.ReactNode }) {
  return (
    <Card as="section" aria-labelledby="shop-product-photos" className="fb-ui-card--form">
      <h2 id="shop-product-photos" className="fb-ui-section-title">
        Fotos{" "}
        {count !== undefined && (
          <span className="fb-shop-soft fb-shop-section-count">
            · {count} de {MAX_PRODUCT_IMAGES}
          </span>
        )}
      </h2>
      <div className="fb-shop-card-body">{children}</div>
    </Card>
  );
}

function PhotosGrid({ images }: { images: ShopProductImage[] }) {
  const free = MAX_PRODUCT_IMAGES - images.length;
  const spaces = Array.from({ length: free }, (_, index) => images.length + index + 1);

  return (
    <PhotosCard count={images.length}>
      {images.length === 0 && (
        <EmptyState title="Nenhuma foto ainda." description="Adicione até 5 fotos; a primeira é a capa." />
      )}
      <ol className="fb-shop-photos" aria-label="Fotos do produto">
        {images.map((image, index) => (
          <li key={image.id} className="fb-shop-photo">
            <Photo image={image} number={index + 1} total={images.length} />
          </li>
        ))}
        {spaces.map((number, index) => (
          <li key={`livre-${number}`} className="fb-shop-photo">
            <button type="button" className="fb-shop-photo__add" aria-label={`Adicionar foto no espaço ${number}`}>
              + Adicionar foto
              {index === 0 && <span className="fb-shop-photo__hint">JPG, PNG ou WebP</span>}
            </button>
          </li>
        ))}
      </ol>
      {free === 0 && <p className="fb-ui-help">Limite de {MAX_PRODUCT_IMAGES} fotos por produto.</p>}
      <p className="fb-ui-help">
        Arraste para mudar a ordem; a primeira foto é a capa. As fotos são reduzidas no navegador antes do envio.
      </p>
    </PhotosCard>
  );
}

function Photo({ image, number, total }: { image: ShopProductImage; number: number; total: number }) {
  const { src, query } = useShopProductImageSrc(image.url);
  const label = `Foto ${number} de ${total}${image.isCover ? " (capa)" : ""}`;
  const failed = query.isError;
  const offline = !failed && !src && query.fetchStatus === "paused";

  return (
    <div className="fb-shop-photo__frame" aria-busy={!src && !failed && !offline}>
      {src ? (
        <img className="fb-shop-photo__img" src={src} alt={label} />
      ) : failed ? (
        <span className="fb-shop-photo__status">Foto {number} não carregou.</span>
      ) : offline ? (
        <span className="fb-shop-photo__status">Sem conexão.</span>
      ) : (
        <span className="fb-ui-state__spinner" aria-hidden="true" />
      )}
      {image.isCover && (
        <Badge tone="brand" className="fb-shop-photo__badge">
          CAPA
        </Badge>
      )}
    </div>
  );
}
