import { useCallback, useEffect, useState } from "react";
import {
  applyTheme,
  currentTheme,
  hasManualTheme,
  readStoredTheme,
  storeTheme,
  subscribeSystemTheme,
  systemTheme,
  type Theme,
} from "./theme";

/** Tema em vigor e a troca entre claro e escuro (a escolha é guardada por aparelho). */
export function useTheme(): { theme: Theme; toggle: () => void } {
  const [theme, setTheme] = useState<Theme>(currentTheme);

  useEffect(() => {
    // O script anti-flash já aplica a escolha salva; sem ele (script bloqueado), aplica aqui.
    const stored = readStoredTheme();
    if (stored && !hasManualTheme()) {
      applyTheme(stored);
      setTheme(stored);
    }
    // Sem escolha manual, acompanha o sistema.
    return subscribeSystemTheme(() => {
      if (!hasManualTheme()) setTheme(systemTheme());
    });
  }, []);

  const toggle = useCallback(() => {
    const next: Theme = currentTheme() === "dark" ? "light" : "dark";
    applyTheme(next);
    storeTheme(next);
    setTheme(next);
  }, []);

  return { theme, toggle };
}
