import { ThemeIcon } from "./icons/ThemeIcon";
import { useTheme } from "../lib/theme/useTheme";

/**
 * Alternância manual entre tema claro e escuro (D-038). O texto mostra o tema em vigor; a escolha é guardada por
 * aparelho. Com `inline` o botão segue o fluxo do cabeçalho da casca (cliente); sem ele fica fixo no topo, que é como
 * o AppShell o oferece às telas cuja casca ainda não tem cabeçalho próprio (login, admin).
 */
export function ThemeToggle({ inline = false }: { inline?: boolean }) {
  const { theme, toggle } = useTheme();
  const current = theme === "dark" ? "escuro" : "claro";
  const other = theme === "dark" ? "claro" : "escuro";
  return (
    <button
      type="button"
      className={inline ? "fb-theme-toggle fb-theme-toggle--inline" : "fb-theme-toggle"}
      onClick={toggle}
      aria-label={`Tema ${current}. Alternar para o tema ${other}`}
    >
      <ThemeIcon theme={theme} />
      <span className="fb-theme-toggle__label">{theme === "dark" ? "Escuro" : "Claro"}</span>
    </button>
  );
}
