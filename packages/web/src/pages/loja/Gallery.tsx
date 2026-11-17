import { useRef, useState } from "react";
import type { ShopProductImage } from "@fitburn/contracts";
import { Badge } from "../../components/ui/Badge";
import { ProductImage } from "./ProductImage";

/**
 * Galeria do produto: todas as fotos numa faixa que rola de lado (deslizar no celular, setas e rolagem no
 * computador), com pontos para ir a cada uma. A rolagem suave some com movimento reduzido (shop.css).
 */
export function Gallery({ images, promo }: { images: ShopProductImage[]; promo: boolean }) {
  const track = useRef<HTMLUListElement>(null);
  const [current, setCurrent] = useState(0);
  const sorted = [...images].sort((a, b) => a.position - b.position);

  if (sorted.length === 0) {
    return (
      <div className="fb-loja-gallery">
        <div className="fb-loja-gallery__empty">
          <ProductImage image={null} alt="" />
        </div>
      </div>
    );
  }

  function onScroll() {
    const element = track.current;
    if (!element || element.clientWidth === 0) return;
    setCurrent(Math.round(element.scrollLeft / element.clientWidth));
  }

  function goTo(index: number) {
    const element = track.current;
    if (element) element.scrollLeft = index * element.clientWidth;
    setCurrent(index);
  }

  return (
    <div className="fb-loja-gallery" role="region" aria-label="Fotos do produto">
      <div className="fb-loja-gallery__frame">
        <ul ref={track} className="fb-loja-gallery__track" tabIndex={0} onScroll={onScroll}>
          {sorted.map((image, index) => (
            <li key={image.id} className="fb-loja-gallery__slide">
              <ProductImage
                image={image}
                alt={`Foto ${index + 1} de ${sorted.length}`}
                className="fb-loja-gallery__img"
              />
            </li>
          ))}
        </ul>
        {promo && (
          <Badge tone="brand" className="fb-loja-gallery__tag">
            PROMO
          </Badge>
        )}
      </div>
      {sorted.length > 1 && (
        <div className="fb-loja-dots">
          {sorted.map((image, index) => (
            <button
              key={image.id}
              type="button"
              className="fb-loja-dot"
              aria-label={`Ver foto ${index + 1} de ${sorted.length}`}
              aria-current={index === current}
              onClick={() => goTo(index)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
