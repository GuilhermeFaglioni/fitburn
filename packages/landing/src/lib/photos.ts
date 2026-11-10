import type { ImageMetadata } from "astro";

/**
 * Fotos de banco em `src/assets/photos/<slot>.jpg` (seção 6 do plano). Enquanto o arquivo do slot não
 * existir, a página mostra um espaço reservado com a mesma proporção, e os slots não mudam.
 */
const files = import.meta.glob<{ default: ImageMetadata }>("../assets/photos/*.{jpg,jpeg,png}", {
  eager: true,
});

export function photoFor(slot: string): ImageMetadata | undefined {
  const entry = Object.entries(files).find(([path]) =>
    new RegExp(`/${slot}\\.(jpe?g|png)$`).test(path),
  );
  return entry?.[1].default;
}
