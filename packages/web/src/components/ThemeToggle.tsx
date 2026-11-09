import { ThemeIcon } from "./icons/ThemeIcon";
import { useTheme } from "../lib/theme/useTheme";

/**
 * Alternância manual entre tema claro e escuro (D-038), fixa no topo. O texto mostra o tema em vigor;
 * a escolha é guardada por aparelho. Cada casca (cliente, login, admin) encaixa o botão no próprio cabeçalho
 * nos PRs de tela; até lá ele vive no AppShell, para existir em todas as telas.
 */
export function ThemeToggle() {
  const { theme, toggle } = useTheme();
  const current = theme === "dark" ? "escuro" : "claro";
  const other = theme === "dark" ? "claro" : "escuro";
  return (
    <button
      type="button"
      className="fb-theme-toggle"
      onClick={toggle}
      aria-label={`Tema ${current}. Alternar para o tema ${other}`}
    >
      <ThemeIcon theme={theme} />
      <span className="fb-theme-toggle__label">{theme === "dark" ? "Escuro" : "Claro"}</span>
    </button>
  );
}
