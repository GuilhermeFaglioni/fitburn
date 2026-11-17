import { useEffect, useState, type ReactNode } from "react";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AuthProvider, useAuth } from "../src/lib/auth/AuthContext";
import { CartProvider, useCart, type CartLine } from "../src/lib/shop/cart";
import { mockSuccessfulLogin } from "./auth-mocks";

/**
 * Carrinho do cliente (L4, #193): fica no aparelho (localStorage), por usuário, lido e escrito em try/catch. Se o
 * armazenamento falhar, o carrinho segue funcionando na sessão, sem persistir.
 */
const CAMISETA: Omit<CartLine, "quantity"> = {
  productId: "p-1",
  variantId: "v-1",
  name: "Camiseta Dry Fit",
  variantLabel: "Preta · M",
  unitPriceCents: 6990,
  imageUrl: null,
  maxQuantity: 3,
};

const KEY = "fitburn:cart:user-1";

function Probe() {
  const cart = useCart();
  return (
    <div>
      <p data-testid="count">{cart.count}</p>
      <p data-testid="total">{cart.totalCents}</p>
      <p data-testid="note">{cart.note}</p>
      <ul>
        {cart.lines.map((line) => (
          <li key={line.variantId}>
            {line.name} x{line.quantity}
          </li>
        ))}
      </ul>
      <button onClick={() => cart.add(CAMISETA, 2)}>add2</button>
      <button onClick={() => cart.add(CAMISETA, 1)}>add1</button>
      <button onClick={() => cart.setQuantity("v-1", 9)}>set9</button>
      <button onClick={() => cart.remove("v-1")}>remove</button>
      <button onClick={() => cart.setNote("Retiro na sexta")}>note</button>
    </div>
  );
}

function LoggedIn({ children }: { children: ReactNode }) {
  const { login } = useAuth();
  const [ready, setReady] = useState(false);
  useEffect(() => {
    void login("cliente@fitburn.local", "SenhaForte123!").then(() => setReady(true));
  }, [login]);
  return ready ? <>{children}</> : null;
}

function renderCart() {
  return render(
    <AuthProvider>
      <LoggedIn>
        <CartProvider>
          <Probe />
        </CartProvider>
      </LoggedIn>
    </AuthProvider>,
  );
}

describe("carrinho do cliente", () => {
  beforeEach(() => {
    window.localStorage.clear();
    mockSuccessfulLogin("Cliente");
  });
  afterEach(() => {
    vi.restoreAllMocks();
    window.localStorage.clear();
  });

  it("adiciona, soma a mesma variação e respeita o máximo por pedido", async () => {
    const user = userEvent.setup();
    renderCart();
    await screen.findByTestId("count");

    await user.click(screen.getByText("add2"));
    expect(screen.getByText("Camiseta Dry Fit x2")).toBeInTheDocument();
    await user.click(screen.getByText("add2"));
    // 2 + 2 passa do limite de 3: fica em 3
    expect(screen.getByText("Camiseta Dry Fit x3")).toBeInTheDocument();
    expect(screen.getByTestId("count")).toHaveTextContent("1");
    expect(screen.getByTestId("total")).toHaveTextContent("20970");
  });

  it("muda a quantidade (dentro do máximo, nunca abaixo de 1), remove e guarda a observação", async () => {
    const user = userEvent.setup();
    renderCart();
    await screen.findByTestId("count");

    await user.click(screen.getByText("add1"));
    await user.click(screen.getByText("set9"));
    expect(screen.getByText("Camiseta Dry Fit x3")).toBeInTheDocument();
    await user.click(screen.getByText("note"));
    expect(screen.getByTestId("note")).toHaveTextContent("Retiro na sexta");
    await user.click(screen.getByText("remove"));
    expect(screen.queryByText(/Camiseta Dry Fit/)).not.toBeInTheDocument();
    expect(screen.getByTestId("count")).toHaveTextContent("0");
  });

  it("guarda no aparelho na chave do usuário e volta a ler depois de recarregar", async () => {
    const user = userEvent.setup();
    const first = renderCart();
    await screen.findByTestId("count");
    await user.click(screen.getByText("add2"));
    await user.click(screen.getByText("note"));

    const saved = JSON.parse(window.localStorage.getItem(KEY) ?? "null");
    expect(saved.items).toHaveLength(1);
    expect(saved.items[0]).toMatchObject({ variantId: "v-1", quantity: 2 });
    expect(saved.note).toBe("Retiro na sexta");

    first.unmount();
    renderCart();
    expect(await screen.findByText("Camiseta Dry Fit x2")).toBeInTheDocument();
    expect(screen.getByTestId("note")).toHaveTextContent("Retiro na sexta");
  });

  it("não mistura o carrinho de outro usuário", async () => {
    window.localStorage.setItem(
      "fitburn:cart:user-2",
      JSON.stringify({ items: [{ ...CAMISETA, quantity: 1 }], note: "" }),
    );
    renderCart();

    expect(await screen.findByTestId("count")).toHaveTextContent("0");
  });

  it("ignora um conteúdo guardado inválido e começa vazio", async () => {
    window.localStorage.setItem(KEY, "{isto não é json");
    renderCart();

    expect(await screen.findByTestId("count")).toHaveTextContent("0");
  });

  it("se o armazenamento falhar (ler e gravar), o carrinho segue funcionando na sessão", async () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new DOMException("bloqueado", "SecurityError");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("cheio", "QuotaExceededError");
    });
    const user = userEvent.setup();
    renderCart();
    await screen.findByTestId("count");

    await act(async () => {
      await user.click(screen.getByText("add2"));
    });

    expect(screen.getByText("Camiseta Dry Fit x2")).toBeInTheDocument();
    expect(screen.getByTestId("count")).toHaveTextContent("1");
  });
});
