import { useRef, useState, type ChangeEvent, type ReactNode } from "react";
import {
  MAX_PRODUCT_IMAGES,
  Module,
  PermissionAction,
  PRODUCT_IMAGE_MIME_TYPES,
  type ShopProductDetail,
  type ShopProductImage,
} from "@fitburn/contracts";
import { Alert } from "../../components/ui/Alert";
import { ActionMenu, type ActionMenuItem } from "../../components/ui/ActionMenu";
import { Badge } from "../../components/ui/Badge";
import { Card } from "../../components/ui/Card";
import { EmptyState, LoadingState } from "../../components/ui/States";
import { errorMessage } from "../../lib/auth/api";
import { useAuth } from "../../lib/auth/AuthContext";
import { useNetworkRequired } from "../../lib/connectivity/useNetworkRequired";
import {
  useArrangeShopProductImages,
  useDeleteShopProductImage,
  useShopProductImageSrc,
  useUploadShopProductImage,
} from "../../lib/shop/api";
import { prepareProductImage, ProductImageError } from "../../lib/shop/product-image";
import { ConfirmDeleteDialog } from "./ConfirmDeleteDialog";
import { ShopAction } from "./ShopAction";

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
          As fotos ficam disponíveis depois de salvar o produto. Salve o produto e abra-o de novo
          para adicionar até {MAX_PRODUCT_IMAGES} fotos.
        </p>
      </PhotosCard>
    );
  }
  return (
    <PhotosGrid
      productId={product.id}
      images={[...(product.images ?? [])].sort((a, b) => a.position - b.position)}
    />
  );
}

function PhotosCard({ count, children }: { count?: number; children: ReactNode }) {
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

function PhotosGrid({ productId, images }: { productId: string; images: ShopProductImage[] }) {
  const { can } = useAuth();
  const { offline, reason: offlineReason } = useNetworkRequired();
  const upload = useUploadShopProductImage();
  const arrange = useArrangeShopProductImages();
  const remove = useDeleteShopProductImage();
  const dragFrom = useRef<number | null>(null);
  const [removing, setRemoving] = useState<{ image: ShopProductImage; number: number } | null>(
    null,
  );
  const inputRef = useRef<HTMLInputElement>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const free = MAX_PRODUCT_IMAGES - images.length;
  const spaces = Array.from({ length: free }, (_, index) => images.length + index + 1);
  const canAdd = can(Module.LOJA, PermissionAction.CREATE);
  const canArrange = can(Module.LOJA, PermissionAction.EDIT);
  const canRemove = can(Module.LOJA, PermissionAction.DELETE);
  const busy = sending || arrange.isPending;
  const draggable = canArrange && !offline && !busy;

  /** A primeira posição é a capa: a ordem nova vai para a API e, se a primeira mudou, a capa vai junto. */
  function arrangeTo(imageIds: string[]) {
    if (imageIds.every((id, index) => id === images[index]?.id)) return;
    setError(null);
    arrange.mutate(
      { productId, imageIds, currentCoverId: images.find((image) => image.isCover)?.id },
      {
        onError: (failure) =>
          setError(errorMessage(failure, "Não foi possível reordenar as fotos.")),
      },
    );
  }

  function moveTo(from: number, to: number) {
    const ids = images.map((image) => image.id);
    const [moved] = ids.splice(from, 1);
    if (moved === undefined) return;
    ids.splice(to, 0, moved);
    arrangeTo(ids);
  }

  function menuItems(image: ShopProductImage, index: number): ActionMenuItem[] {
    const number = index + 1;
    const items: ActionMenuItem[] = [];
    if (canArrange) {
      if (index > 0) {
        items.push({ key: "cover", label: "Tornar capa", onSelect: () => moveTo(index, 0) });
        items.push({
          key: "before",
          label: "Mover para antes",
          onSelect: () => moveTo(index, index - 1),
        });
      }
      if (index < images.length - 1) {
        items.push({
          key: "after",
          label: "Mover para depois",
          onSelect: () => moveTo(index, index + 1),
        });
      }
    }
    if (canRemove) {
      items.push({
        key: "remove",
        label: "Remover",
        danger: true,
        onSelect: () => setRemoving({ image, number }),
      });
    }
    return items;
  }

  /** Reduz a foto no navegador e a envia; a grade se atualiza pelo detalhe do produto, recarregado após o envio. */
  async function send(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setError(null);
    setSending(true);
    try {
      const prepared = await prepareProductImage(file);
      await upload.mutateAsync({ productId, file: prepared });
    } catch (failure) {
      setError(
        failure instanceof ProductImageError
          ? failure.message
          : errorMessage(failure, "Não foi possível enviar a foto."),
      );
    } finally {
      setSending(false);
    }
  }

  return (
    <PhotosCard count={images.length}>
      {images.length === 0 && (
        <EmptyState
          title="Nenhuma foto ainda."
          description="Adicione até 5 fotos; a primeira é a capa."
        />
      )}
      {error && <Alert>{error}</Alert>}
      <input
        ref={inputRef}
        type="file"
        hidden
        aria-label="Arquivo da foto"
        accept={PRODUCT_IMAGE_MIME_TYPES.join(",")}
        onChange={(event) => void send(event)}
      />
      <ol className="fb-shop-photos" aria-label="Fotos do produto">
        {images.map((image, index) => {
          const items = menuItems(image, index);
          return (
            <li
              key={image.id}
              className="fb-shop-photo"
              draggable={draggable || undefined}
              onDragStart={(event) => {
                if (!draggable) return;
                dragFrom.current = index;
                event.dataTransfer?.setData("text/plain", image.id);
              }}
              onDragOver={(event) => {
                if (draggable && dragFrom.current !== null) event.preventDefault();
              }}
              onDrop={(event) => {
                event.preventDefault();
                const from = dragFrom.current;
                dragFrom.current = null;
                if (draggable && from !== null && from !== index) moveTo(from, index);
              }}
              onDragEnd={() => {
                dragFrom.current = null;
              }}
            >
              <Photo image={image} number={index + 1} total={images.length} />
              {items.length > 0 && (
                <ActionMenu
                  className="fb-shop-photo__menu"
                  label={`Ações da foto ${index + 1}`}
                  items={items}
                  enabled={!offline && !busy}
                  disabledReason={offline ? offlineReason : undefined}
                />
              )}
            </li>
          );
        })}
        {spaces.map((number, index) => (
          <li key={`livre-${number}`} className="fb-shop-photo">
            {sending && index === 0 ? (
              <div className="fb-shop-photo__frame">
                <LoadingState label="Enviando foto…" className="fb-shop-photo__sending" />
              </div>
            ) : (
              <ShopAction allowed={canAdd} reason="Você não tem permissão para adicionar fotos.">
                <button
                  type="button"
                  className="fb-shop-photo__add"
                  aria-label={`Adicionar foto no espaço ${number}`}
                  disabled={busy}
                  onClick={() => inputRef.current?.click()}
                >
                  + Adicionar foto
                  {index === 0 && <span className="fb-shop-photo__hint">JPG, PNG ou WebP</span>}
                </button>
              </ShopAction>
            )}
          </li>
        ))}
      </ol>
      {offline && (
        <p className="fb-ui-note">
          Sem conexão: enviar e alterar fotos fica indisponível até a conexão voltar.
        </p>
      )}
      {arrange.isPending && <LoadingState label="Salvando as fotos…" />}
      {free === 0 && (
        <p className="fb-ui-help">Limite de {MAX_PRODUCT_IMAGES} fotos por produto.</p>
      )}
      <p className="fb-ui-help">
        Arraste para mudar a ordem; a primeira foto é a capa. As fotos são reduzidas no navegador
        antes do envio.
      </p>
      {removing && (
        <ConfirmDeleteDialog
          title={`Remover a foto ${removing.number}${removing.image.isCover ? " (capa)" : ""}?`}
          description={
            removing.image.isCover && images.length > 1
              ? "A foto sai do produto e a próxima passa a ser a capa. Isso não pode ser desfeito."
              : "A foto sai do produto. Isso não pode ser desfeito."
          }
          fallbackError="Não foi possível remover a foto."
          onConfirm={() => remove.mutateAsync({ productId, imageId: removing.image.id })}
          onClose={() => setRemoving(null)}
        />
      )}
    </PhotosCard>
  );
}

function Photo({
  image,
  number,
  total,
}: {
  image: ShopProductImage;
  number: number;
  total: number;
}) {
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
