import { MAX_PRODUCT_IMAGE_SIZE_BYTES } from "@fitburn/contracts";
import {
  fitWithin,
  prepareProductImage,
  ProductImageError,
  PRODUCT_IMAGE_MAX_SIDE,
} from "../src/lib/shop/product-image";

/**
 * jsdom não decodifica nem desenha imagem: as APIs do navegador (`createImageBitmap` e o canvas) são simuladas na
 * borda. O que se confere é o contrato da função: tamanho final, formato, qualidade e erros.
 */
function stubBrowser({
  width,
  height,
  encode,
}: {
  width: number;
  height: number;
  /** Devolve o blob que o navegador produziria para o formato e a qualidade pedidos. */
  encode: (type: string, quality: number) => Blob | null;
}) {
  const bitmap = { width, height, close: vi.fn() };
  vi.stubGlobal("createImageBitmap", vi.fn().mockResolvedValue(bitmap));
  const context = { fillStyle: "", fillRect: vi.fn(), drawImage: vi.fn() };
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
    context as unknown as CanvasRenderingContext2D,
  );
  const toBlob = vi
    .spyOn(HTMLCanvasElement.prototype, "toBlob")
    .mockImplementation(function (callback, type, quality) {
      callback(encode(type ?? "image/png", Number(quality)));
    });
  return { bitmap, context, toBlob };
}

const blobOf = (type: string, size: number) => new Blob([new Uint8Array(size)], { type });
const photo = (name = "camiseta.png", type = "image/png") =>
  new File([new Uint8Array(10)], name, { type });

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("fitWithin", () => {
  it("reduz para 1200 px no lado maior, mantendo a proporção", () => {
    expect(PRODUCT_IMAGE_MAX_SIDE).toBe(1200);
    expect(fitWithin(3000, 2000)).toEqual({ width: 1200, height: 800 });
    expect(fitWithin(2000, 4000)).toEqual({ width: 600, height: 1200 });
  });

  it("não amplia foto que já cabe", () => {
    expect(fitWithin(800, 600)).toEqual({ width: 800, height: 600 });
    expect(fitWithin(1200, 1200)).toEqual({ width: 1200, height: 1200 });
  });
});

describe("prepareProductImage", () => {
  it("reduz a foto grande para 1200 px e a converte para WebP", async () => {
    const { context, toBlob, bitmap } = stubBrowser({
      width: 3000,
      height: 2000,
      encode: (type) => blobOf(type, 90_000),
    });

    const result = await prepareProductImage(photo("camiseta.png"));

    expect(context.drawImage).toHaveBeenCalledWith(bitmap, 0, 0, 1200, 800);
    expect(toBlob.mock.calls[0]?.[1]).toBe("image/webp");
    expect(result.type).toBe("image/webp");
    expect(result.name).toBe("camiseta.webp");
    expect(result.size).toBe(90_000);
    expect(bitmap.close).toHaveBeenCalled();
  });

  it("cai para JPEG quando o navegador não sabe gerar WebP", async () => {
    stubBrowser({
      width: 800,
      height: 600,
      // Sem suporte a WebP o canvas devolve PNG, ignorando o formato pedido.
      encode: (type) =>
        type === "image/jpeg" ? blobOf("image/jpeg", 50_000) : blobOf("image/png", 50_000),
    });

    const result = await prepareProductImage(photo("garrafa.webp", "image/webp"));

    expect(result.type).toBe("image/jpeg");
    expect(result.name).toBe("garrafa.jpg");
  });

  it("baixa a qualidade até a foto caber em 1,5 MB", async () => {
    const qualities: number[] = [];
    stubBrowser({
      width: 1200,
      height: 1200,
      encode: (type, quality) => {
        qualities.push(quality);
        return blobOf(
          type,
          quality > 0.7 ? MAX_PRODUCT_IMAGE_SIZE_BYTES + 1 : MAX_PRODUCT_IMAGE_SIZE_BYTES,
        );
      },
    });

    const result = await prepareProductImage(photo());

    expect(qualities.length).toBeGreaterThan(1);
    expect(qualities).toEqual([...qualities].sort((a, b) => b - a));
    expect(result.size).toBeLessThanOrEqual(MAX_PRODUCT_IMAGE_SIZE_BYTES);
  });

  it("recusa a foto que não cabe em 1,5 MB nem com a menor qualidade", async () => {
    stubBrowser({
      width: 1200,
      height: 1200,
      encode: (type) => blobOf(type, MAX_PRODUCT_IMAGE_SIZE_BYTES + 1),
    });

    await expect(prepareProductImage(photo())).rejects.toThrow(/1,5 MB/);
  });

  it("recusa formato que a loja não aceita, sem tentar decodificar", async () => {
    const { toBlob } = stubBrowser({ width: 10, height: 10, encode: (type) => blobOf(type, 10) });

    await expect(prepareProductImage(photo("animacao.gif", "image/gif"))).rejects.toThrow(
      "Use uma foto JPG, PNG ou WebP.",
    );
    expect(globalThis.createImageBitmap).not.toHaveBeenCalled();
    expect(toBlob).not.toHaveBeenCalled();
  });

  it("explica quando o navegador não consegue ler o arquivo", async () => {
    vi.stubGlobal("createImageBitmap", vi.fn().mockRejectedValue(new Error("corrompido")));

    const failure = prepareProductImage(photo());
    await expect(failure).rejects.toBeInstanceOf(ProductImageError);
    await expect(failure).rejects.toThrow("Não foi possível ler esta foto.");
  });
});
