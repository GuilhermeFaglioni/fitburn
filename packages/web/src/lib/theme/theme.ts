/**
 * Tema claro e escuro (D-038). Sem escolha manual, vale `prefers-color-scheme` e o <html> fica sem `data-theme`.
 * A escolha manual vai no atributo `data-theme` do <html> e em localStorage (chave `fb-theme`, a mesma da proposta).
 * Todo acesso ao localStorage é protegido: modo privado e bloqueio de dados do site fazem a leitura e a escrita lançar.
 * O script public/theme-init.js repete a leitura antes do CSS (evita o flash do tema errado) e usa a mesma chave.
 */
export type Theme = "light" | "dark";

export const THEME_STORAGE_KEY = "fb-theme";

/** Cor da barra do navegador por tema: o `--bg` de cada tema (manifest.webmanifest fica em #0a0a0a, ver vite.config). */
export const THEME_COLOR: Record<Theme, string> = { light: "#FFFFFF", dark: "#0A0A0A" };

export function parseTheme(value: unknown): Theme | null {
  return value === "light" || value === "dark" ? value : null;
}

export function readStoredTheme(): Theme | null {
  try {
    return parseTheme(window.localStorage.getItem(THEME_STORAGE_KEY));
  } catch {
    return null;
  }
}

export function storeTheme(theme: Theme): void {
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Sem armazenamento a troca vale só para esta sessão.
  }
}

const DARK_QUERY = "(prefers-color-scheme: dark)";

/** O jsdom e navegadores antigos não têm matchMedia: sem ele, o claro. */
export function systemTheme(): Theme {
  if (typeof window.matchMedia !== "function") return "light";
  return window.matchMedia(DARK_QUERY).matches ? "dark" : "light";
}

/** Chama `listener` quando o sistema troca de tema. Devolve a função que cancela. */
export function subscribeSystemTheme(listener: () => void): () => void {
  if (typeof window.matchMedia !== "function") return () => undefined;
  const query = window.matchMedia(DARK_QUERY);
  query.addEventListener("change", listener);
  return () => query.removeEventListener("change", listener);
}

/** Há escolha manual aplicada no <html>? */
export function hasManualTheme(): boolean {
  return parseTheme(document.documentElement.getAttribute("data-theme")) !== null;
}

/** Tema em vigor: a escolha manual no <html> ou, sem ela, o do sistema. */
export function currentTheme(): Theme {
  return parseTheme(document.documentElement.getAttribute("data-theme")) ?? systemTheme();
}

export function applyTheme(theme: Theme): void {
  document.documentElement.setAttribute("data-theme", theme);
  document
    .querySelectorAll('meta[name="theme-color"]')
    .forEach((meta) => meta.setAttribute("content", THEME_COLOR[theme]));
}
