import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { z } from "zod";
import { useAuth } from "../auth/AuthContext";

/**
 * Carrinho do cliente (L4, #193, spec #183): fica no aparelho até virar pedido, numa chave por usuário. Todo acesso
 * ao localStorage é protegido (modo privado e bloqueio de dados do site fazem a leitura e a escrita lançar): se
 * falhar, o carrinho segue funcionando na memória da sessão, sem persistir.
 */

const cartLineSchema = z.object({
  productId: z.string(),
  variantId: z.string(),
  name: z.string(),
  variantLabel: z.string().nullable(),
  unitPriceCents: z.number().int().nonnegative(),
  /** Rota da capa na API; sem foto, nulo. */
  imageUrl: z.string().nullable(),
  /** Máximo por pedido: 1 quando o produto não permite mais de uma unidade; nulo quando não há limite. */
  maxQuantity: z.number().int().positive().nullable(),
  quantity: z.number().int().positive(),
});
export type CartLine = z.infer<typeof cartLineSchema>;

const storedCartSchema = z.object({
  items: z.array(cartLineSchema),
  note: z.string(),
});

interface Cart {
  lines: CartLine[];
  note: string;
}

const EMPTY_CART: Cart = { lines: [], note: "" };

export function cartStorageKey(userId: string): string {
  return `fitburn:cart:${userId}`;
}

function readCart(userId: string | null): Cart {
  if (!userId) return EMPTY_CART;
  try {
    const raw = window.localStorage.getItem(cartStorageKey(userId));
    if (raw === null) return EMPTY_CART;
    const parsed = storedCartSchema.safeParse(JSON.parse(raw));
    return parsed.success ? { lines: parsed.data.items, note: parsed.data.note } : EMPTY_CART;
  } catch {
    return EMPTY_CART;
  }
}

function writeCart(userId: string, cart: Cart): void {
  try {
    window.localStorage.setItem(
      cartStorageKey(userId),
      JSON.stringify({ items: cart.lines, note: cart.note }),
    );
  } catch {
    // Sem armazenamento: o carrinho continua só na memória desta sessão.
  }
}

function clampQuantity(quantity: number, max: number | null): number {
  const atLeastOne = Math.max(1, Math.floor(quantity));
  return max === null ? atLeastOne : Math.min(atLeastOne, max);
}

export interface CartValue {
  lines: CartLine[];
  note: string;
  /** Linhas no carrinho (a sacola do cabeçalho conta produtos diferentes, como na proposta). */
  count: number;
  totalCents: number;
  /** Soma a quantidade a uma variação já no carrinho (até o máximo) ou cria a linha. */
  add: (line: Omit<CartLine, "quantity">, quantity: number) => void;
  setQuantity: (variantId: string, quantity: number) => void;
  remove: (variantId: string) => void;
  setNote: (note: string) => void;
  clear: () => void;
}

const NOOP_CART: CartValue = {
  lines: [],
  note: "",
  count: 0,
  totalCents: 0,
  add: () => undefined,
  setQuantity: () => undefined,
  remove: () => undefined,
  setNote: () => undefined,
  clear: () => undefined,
};

/** Sem `CartProvider` (telas fora do app do cliente, testes de casca) o carrinho é vazio e não grava. */
const CartContext = createContext<CartValue>(NOOP_CART);

interface CartState {
  userId: string | null;
  cart: Cart;
  /** Mudou desde a leitura: precisa gravar. */
  dirty: boolean;
}

export function CartProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const [state, setState] = useState<CartState>(() => ({
    userId,
    cart: readCart(userId),
    dirty: false,
  }));

  // Outra pessoa entrou neste aparelho: lê o carrinho dela, nunca o da anterior.
  let current = state;
  if (state.userId !== userId) {
    current = { userId, cart: readCart(userId), dirty: false };
    setState(current);
  }

  useEffect(() => {
    if (current.dirty && current.userId) writeCart(current.userId, current.cart);
  }, [current]);

  const value = useMemo<CartValue>(() => {
    const change = (update: (cart: Cart) => Cart) =>
      setState((previous) => ({ ...previous, cart: update(previous.cart), dirty: true }));
    const { lines, note } = current.cart;
    return {
      lines,
      note,
      count: lines.length,
      totalCents: lines.reduce((sum, line) => sum + line.unitPriceCents * line.quantity, 0),
      add: (line, quantity) =>
        change((cart) => {
          const existing = cart.lines.find((item) => item.variantId === line.variantId);
          if (!existing) {
            return {
              ...cart,
              lines: [...cart.lines, { ...line, quantity: clampQuantity(quantity, line.maxQuantity) }],
            };
          }
          return {
            ...cart,
            lines: cart.lines.map((item) =>
              item === existing
                ? {
                    ...item,
                    ...line,
                    quantity: clampQuantity(item.quantity + quantity, line.maxQuantity),
                  }
                : item,
            ),
          };
        }),
      setQuantity: (variantId, quantity) =>
        change((cart) => ({
          ...cart,
          lines: cart.lines.map((item) =>
            item.variantId === variantId
              ? { ...item, quantity: clampQuantity(quantity, item.maxQuantity) }
              : item,
          ),
        })),
      remove: (variantId) =>
        change((cart) => ({
          ...cart,
          lines: cart.lines.filter((item) => item.variantId !== variantId),
        })),
      setNote: (next) => change((cart) => ({ ...cart, note: next })),
      clear: () => change(() => EMPTY_CART),
    };
  }, [current]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartValue {
  return useContext(CartContext);
}
