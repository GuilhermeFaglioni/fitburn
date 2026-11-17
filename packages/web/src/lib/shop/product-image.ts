import { MAX_PRODUCT_IMAGE_SIZE_BYTES, PRODUCT_IMAGE_MIME_TYPES } from "@fitburn/contracts";

/** D-040: o navegador reduz a foto antes de enviar; a API confere o mime e o tamanho de novo. */
export const PRODUCT_IMAGE_MAX_SIDE = 1200;

/** Qualidades tentadas, da maior para a menor, até a foto caber no limite da API. */
const QUALITY_STEPS = [0.85, 0.75, 0.65, 0.5] as const;
const PREFERRED_TYPE = "image/webp";
const FALLBACK_TYPE = "image/jpeg";
const EXTENSIONS: Record<string, string> = { [PREFERRED_TYPE]: "webp", [FALLBACK_TYPE]: "jpg" };

/** Erro que a equipe consegue resolver sozinha (outro arquivo); a mensagem já vai pronta para a tela. */
export class ProductImageError extends Error {}

/** Tamanho final: cabe em `maxSide` no lado maior, mantém a proporção e nunca amplia. */
export function fitWithin(
  width: number,
  height: number,
  maxSide: number = PRODUCT_IMAGE_MAX_SIDE,
): { width: number; height: number } {
  const scale = Math.min(1, maxSide / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

function isAcceptedType(type: string): boolean {
  return (PRODUCT_IMAGE_MIME_TYPES as readonly string[]).includes(type);
}

function encode(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

function renamed(name: string, type: string): string {
  const base = name.replace(/\.[^./\\]+$/, "") || "foto";
  return `${base}.${EXTENSIONS[type] ?? "jpg"}`;
}

/**
 * Reduz a foto para no máximo 1200 px no lado maior e a converte para WebP (JPEG nos navegadores sem WebP no
 * canvas), baixando a qualidade até caber em 1,5 MB. Lança `ProductImageError` com a mensagem para a equipe quando
 * o formato não é aceito, o arquivo não abre ou nem a menor qualidade cabe no limite.
 */
export async function prepareProductImage(file: File): Promise<File> {
  if (!isAcceptedType(file.type)) throw new ProductImageError("Use uma foto JPG, PNG ou WebP.");

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new ProductImageError("Não foi possível ler esta foto. Tente outro arquivo.");
  }

  try {
    const { width, height } = fitWithin(bitmap.width, bitmap.height);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) throw new ProductImageError("Este navegador não consegue reduzir a foto.");
    // Fundo branco: PNG com transparência não pode virar fundo preto ao ir para JPEG.
    context.fillStyle = "white";
    context.fillRect(0, 0, width, height);
    context.drawImage(bitmap, 0, 0, width, height);

    let type = PREFERRED_TYPE;
    for (const quality of QUALITY_STEPS) {
      let blob = await encode(canvas, type, quality);
      if (blob && blob.type !== type && type === PREFERRED_TYPE) {
        type = FALLBACK_TYPE;
        blob = await encode(canvas, type, quality);
      }
      if (!blob) throw new ProductImageError("Não foi possível reduzir esta foto. Tente outro arquivo.");
      if (blob.size <= MAX_PRODUCT_IMAGE_SIZE_BYTES) {
        return new File([blob], renamed(file.name, type), { type });
      }
    }
    throw new ProductImageError(
      "A foto continua acima de 1,5 MB mesmo depois de reduzida. Escolha outra foto.",
    );
  } finally {
    bitmap.close();
  }
}
