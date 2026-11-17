import { Blob as NodeBlob, File as NodeFile } from "node:buffer";
import { useEffect, useState } from "react";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import {
  Module,
  PermissionAction,
  PermissionScope,
  type EffectivePermission,
  type ShopProductDetail,
  type ShopProductImage,
} from "@fitburn/contracts";
import { AuthProvider, useAuth } from "../src/lib/auth/AuthContext";
import { ProductFormPage } from "../src/pages/shop/ProductFormPage";
import { mockSuccessfulLogin } from "./auth-mocks";
import { setBrowserOnline } from "./connectivity-helpers";
import { server } from "./msw-server";

const ALL_ACTIONS = [
  PermissionAction.VIEW,
  PermissionAction.CREATE,
  PermissionAction.EDIT,
  PermissionAction.DELETE,
  PermissionAction.EXECUTE,
];

function lojaPermissions(actions: EffectivePermission["actions"] = ALL_ACTIONS): EffectivePermission[] {
  return [{ module: Module.LOJA, actions, scope: PermissionScope.ALL }];
}

function image(id: string, position: number, overrides: Partial<ShopProductImage> = {}): ShopProductImage {
  return {
    id,
    mimeType: "image/webp",
    sizeBytes: 90_000,
    position,
    isCover: position === 0,
    url: `/api/shop/product-images/${id}`,
    ...overrides,
  };
}

function detail(images: ShopProductImage[] | undefined): ShopProductDetail {
  return {
    id: "p-camiseta",
    name: "Camiseta Dry Fit",
    description: null,
    category: null,
    priceCents: 8990,
    promoPriceCents: null,
    visivel: true,
    destaque: false,
    permiteMaisDeUmaUnidade: false,
    limitePorPedido: null,
    variantCount: 1,
    stock: 5,
    soldOutVariantCount: 0,
    createdAt: "2026-11-01T10:00:00.000Z",
    images,
    options: [],
    variants: [
      {
        id: "v-unica",
        label: null,
        values: [],
        stock: 5,
        priceCents: null,
        effectivePriceCents: 8990,
        ativa: true,
      },
    ],
  };
}

function LoggedIn() {
  const { login } = useAuth();
  const [ready, setReady] = useState(false);
  useEffect(() => {
    void login("admin@fitburn.local", "SenhaForte123!").then(() => setReady(true));
  }, [login]);
  if (!ready) return null;
  return (
    <Routes>
      <Route path="/loja-admin/produtos" element={<p>Lista de produtos</p>} />
      <Route path="/loja-admin/produtos/novo" element={<ProductFormPage />} />
      <Route path="/loja-admin/produtos/:id" element={<ProductFormPage />} />
    </Routes>
  );
}

function renderAt(path: string) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <MemoryRouter initialEntries={[path]}>
          <LoggedIn />
        </MemoryRouter>
      </AuthProvider>
    </QueryClientProvider>,
  );
}

/** A seção "Fotos" do formulário. */
async function photosSection() {
  return screen.findByRole("region", { name: /Fotos/ });
}

describe("Fotos do produto (L3)", () => {
  let current: ShopProductDetail;
  let authorizations: string[];
  let imageRequests: string[];

  beforeEach(() => {
    current = detail([image("img-1", 0), image("img-2", 1), image("img-3", 2)]);
    authorizations = [];
    imageRequests = [];
    let objectUrls = 0;
    URL.createObjectURL = vi.fn(() => `blob:foto-${++objectUrls}`);
    URL.revokeObjectURL = vi.fn();
    mockSuccessfulLogin("Administrador", lojaPermissions());
    server.use(
      http.get("/api/shop/admin/categories", () => HttpResponse.json([])),
      http.get("/api/shop/admin/products", () => HttpResponse.json([])),
      http.get("/api/shop/admin/products/:id", () => HttpResponse.json(current)),
      http.get("/api/shop/product-images/:id", ({ params, request }) => {
        imageRequests.push(String(params.id));
        authorizations.push(request.headers.get("Authorization") ?? "");
        return new HttpResponse(new Uint8Array([1, 2, 3]), { headers: { "Content-Type": "image/webp" } });
      }),
    );
  });

  describe("exibição", () => {
    it("mostra as fotos na ordem, com a primeira como capa, lidas pela rota versionada da API com o token", async () => {
      renderAt("/loja-admin/produtos/p-camiseta");

      const section = await photosSection();
      expect(within(section).getByRole("heading", { level: 2, name: /Fotos/ })).toHaveTextContent("3 de 5");
      await waitFor(() => expect(within(section).getAllByRole("img")).toHaveLength(3));
      const photos = within(section).getAllByRole("img");
      expect(photos.map((photo) => photo.getAttribute("alt"))).toEqual([
        "Foto 1 de 3 (capa)",
        "Foto 2 de 3",
        "Foto 3 de 3",
      ]);
      await waitFor(() => expect(photos.every((photo) => photo.getAttribute("src")?.startsWith("blob:"))).toBe(true));
      expect(imageRequests.sort()).toEqual(["img-1", "img-2", "img-3"]);
      expect(authorizations.every((value) => value.startsWith("Bearer "))).toBe(true);
      expect(within(section).getAllByText("CAPA")).toHaveLength(1);
    });

    it("oferece um botão de adicionar por espaço livre (2 de 5) e explica o formato", async () => {
      renderAt("/loja-admin/produtos/p-camiseta");

      const section = await photosSection();
      expect(await within(section).findAllByRole("button", { name: /Adicionar foto/ })).toHaveLength(2);
      expect(within(section).getByText(/JPG, PNG ou WebP/)).toBeInTheDocument();
      expect(within(section).getByText(/reduzidas no navegador antes do envio/)).toBeInTheDocument();
    });

    it("sem foto: estado vazio com os 5 espaços para adicionar", async () => {
      current = detail([]);
      renderAt("/loja-admin/produtos/p-camiseta");

      const section = await photosSection();
      expect(within(section).getByRole("heading", { level: 2, name: /Fotos/ })).toHaveTextContent("0 de 5");
      expect(within(section).getByText("Nenhuma foto ainda.")).toBeInTheDocument();
      expect(within(section).getAllByRole("button", { name: /Adicionar foto/ })).toHaveLength(5);
      expect(within(section).queryByRole("img")).not.toBeInTheDocument();
    });

    it("trata a resposta sem `images` como produto sem fotos", async () => {
      current = detail(undefined);
      renderAt("/loja-admin/produtos/p-camiseta");

      const section = await photosSection();
      expect(within(section).getByText("Nenhuma foto ainda.")).toBeInTheDocument();
    });

    it("com as 5 fotos, não oferece adicionar e avisa o limite", async () => {
      current = detail([0, 1, 2, 3, 4].map((position) => image(`img-${position}`, position)));
      renderAt("/loja-admin/produtos/p-camiseta");

      const section = await photosSection();
      expect(within(section).queryByRole("button", { name: /Adicionar foto/ })).not.toBeInTheDocument();
      expect(within(section).getByText(/Limite de 5 fotos/)).toBeInTheDocument();
    });

    it("mostra um espaço de carregamento até a foto chegar e um aviso quando ela não carrega", async () => {
      current = detail([image("img-1", 0), image("img-2", 1)]);
      server.use(
        http.get("/api/shop/product-images/img-1", () => HttpResponse.json({ code: "NOT_FOUND", message: "x" }, { status: 404 })),
      );
      renderAt("/loja-admin/produtos/p-camiseta");

      const section = await photosSection();
      expect(await within(section).findByText("Foto 1 não carregou.")).toBeInTheDocument();
      expect(await within(section).findByAltText("Foto 2 de 2")).toHaveAttribute("src", expect.stringMatching(/^blob:/));
    });
  });

  describe("cadastro de um produto novo", () => {
    it("explica que as fotos ficam disponíveis depois de salvar, sem oferecer o envio", async () => {
      renderAt("/loja-admin/produtos/novo");

      const section = await photosSection();
      expect(within(section).getByText(/As fotos ficam disponíveis depois de salvar o produto/)).toBeInTheDocument();
      expect(within(section).queryByRole("button", { name: /Adicionar foto/ })).not.toBeInTheDocument();
    });
  });

  describe("envio", () => {
    /** Simula, na borda, o que o navegador faz com a foto escolhida: decodifica 3000×2000 e entrega um WebP de 80 KB. */
    function stubBrowserImage(encodedSize = 80_000) {
      const bitmap = { width: 3000, height: 2000, close: vi.fn() };
      vi.stubGlobal("createImageBitmap", vi.fn().mockResolvedValue(bitmap));
      const context = { fillStyle: "", fillRect: vi.fn(), drawImage: vi.fn() };
      vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
        context as unknown as CanvasRenderingContext2D,
      );
      vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation(function (callback, type) {
        callback(new Blob([new Uint8Array(encodedSize)], { type: type ?? "image/webp" }));
      });
      return { context, bitmap };
    }

    const pick = (name = "camiseta.png", type = "image/png") =>
      new File([new Uint8Array(2_000_000)], name, { type });

    let uploads: { file: File; mimeType: unknown; sizeBytes: unknown }[];
    const gate: { release: (() => void) | null } = { release: null };

    beforeEach(async () => {
      // jsdom 30 + vitest 5.0.1: o `fetch` simulado não sabe ler `Blob`/`File`/`FormData` do jsdom no corpo da
      // requisição (a compatibilidade do vitest procura um símbolo interno que o jsdom 30 não tem mais). O envio usa
      // as classes nativas do Node, as mesmas que o `fetch` do navegador espera.
      const NodeFormData = (await new Response(new URLSearchParams()).formData()).constructor;
      vi.stubGlobal("FormData", NodeFormData);
      vi.stubGlobal("Blob", NodeBlob);
      vi.stubGlobal("File", NodeFile);
      uploads = [];
      gate.release = null;
      server.use(
        http.post("/api/shop/admin/products/:id/images", async ({ request }) => {
          const form = await request.formData();
          const file = form.get("file") as File;
          uploads.push({ file, mimeType: form.get("mimeType"), sizeBytes: form.get("sizeBytes") });
          if (gate.release === null) {
            // Segura a resposta até o teste liberar, para ver o estado "enviando".
            await new Promise<void>((resolve) => {
              gate.release = resolve;
            });
          }
          const created = image("img-novo", current.images?.length ?? 0, { sizeBytes: file.size });
          current = detail([...(current.images ?? []), created]);
          return HttpResponse.json(created, { status: 201 });
        }),
      );
    });

    afterEach(() => {
      vi.restoreAllMocks();
      vi.unstubAllGlobals();
    });

    it("reduz a foto, envia o arquivo com mime e tamanho e passa a mostrá-la na grade", async () => {
      const { context, bitmap } = stubBrowserImage();
      const user = userEvent.setup();
      renderAt("/loja-admin/produtos/p-camiseta");
      const section = await photosSection();

      await user.upload(within(section).getByLabelText("Arquivo da foto"), pick());

      // enquanto envia: o espaço mostra o carregamento e o envio fica indisponível
      expect(await within(section).findByText("Enviando foto…")).toBeInTheDocument();
      expect(within(section).getAllByRole("button", { name: /Adicionar foto/ })).toSatisfy(
        (buttons: HTMLElement[]) => buttons.every((button) => (button as HTMLButtonElement).disabled),
      );
      await waitFor(() => expect(uploads).toHaveLength(1));
      act(() => gate.release?.());

      await waitFor(() => expect(within(section).getAllByRole("img")).toHaveLength(4));
      expect(within(section).getByRole("heading", { level: 2, name: /Fotos/ })).toHaveTextContent("4 de 5");
      expect(within(section).queryByText("Enviando foto…")).not.toBeInTheDocument();
      expect(context.drawImage).toHaveBeenCalledWith(bitmap, 0, 0, 1200, 800);
      const [upload] = uploads;
      expect(upload?.file.type).toBe("image/webp");
      expect(upload?.file.name).toBe("camiseta.webp");
      expect(upload?.file.size).toBe(80_000);
      expect(upload?.mimeType).toBe("image/webp");
      expect(upload?.sizeBytes).toBe("80000");
    });

    it("mostra o motivo da recusa da API e não muda a grade", async () => {
      stubBrowserImage();
      server.use(
        http.post("/api/shop/admin/products/:id/images", () =>
          HttpResponse.json(
            { code: "CONFLICT", message: "O produto já tem 5 fotos." },
            { status: 409 },
          ),
        ),
      );
      const user = userEvent.setup();
      renderAt("/loja-admin/produtos/p-camiseta");
      const section = await photosSection();

      await user.upload(within(section).getByLabelText("Arquivo da foto"), pick());

      expect(await within(section).findByRole("alert")).toHaveTextContent("O produto já tem 5 fotos.");
      expect(within(section).queryByText("Enviando foto…")).not.toBeInTheDocument();
      expect(within(section).getByRole("heading", { level: 2, name: /Fotos/ })).toHaveTextContent("3 de 5");
    });

    it("recusa formato fora de JPG, PNG e WebP sem chamar a API", async () => {
      stubBrowserImage();
      const user = userEvent.setup({ applyAccept: false });
      renderAt("/loja-admin/produtos/p-camiseta");
      const section = await photosSection();

      await user.upload(within(section).getByLabelText("Arquivo da foto"), pick("animacao.gif", "image/gif"));

      expect(await within(section).findByRole("alert")).toHaveTextContent("Use uma foto JPG, PNG ou WebP.");
      expect(uploads).toHaveLength(0);
    });

    it("avisa quando a foto não cabe em 1,5 MB nem depois de reduzida", async () => {
      stubBrowserImage(1_500_001);
      const user = userEvent.setup();
      renderAt("/loja-admin/produtos/p-camiseta");
      const section = await photosSection();

      await user.upload(within(section).getByLabelText("Arquivo da foto"), pick());

      expect(await within(section).findByRole("alert")).toHaveTextContent(/acima de 1,5 MB/);
      expect(uploads).toHaveLength(0);
    });

    it("o erro some quando a próxima foto é enviada com sucesso", async () => {
      stubBrowserImage();
      gate.release = () => undefined;
      const user = userEvent.setup({ applyAccept: false });
      renderAt("/loja-admin/produtos/p-camiseta");
      const section = await photosSection();
      const input = within(section).getByLabelText("Arquivo da foto");

      await user.upload(input, pick("animacao.gif", "image/gif"));
      expect(await within(section).findByRole("alert")).toBeInTheDocument();
      await user.upload(input, pick());

      await waitFor(() => expect(within(section).getAllByRole("img")).toHaveLength(4));
      expect(within(section).queryByRole("alert")).not.toBeInTheDocument();
    });
  });

  // Ordem, capa, remoção, offline e permissão entram nos blocos seguintes.
  void setBrowserOnline;
});
