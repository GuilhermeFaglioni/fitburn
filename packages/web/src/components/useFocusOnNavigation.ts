import { useEffect, useRef, type RefObject } from "react";
import { useLocation } from "react-router-dom";

/**
 * Numa SPA a troca de tela não recarrega a página, então quem usa teclado ou
 * leitor de tela ficaria com o foco no link do menu. Ao mudar de rota, leva o
 * foco ao conteúdo (o `main`, com tabIndex -1). Não roda na primeira montagem,
 * para não roubar o foco do início da página nem do campo que a tela focou.
 */
export function useFocusOnNavigation(): RefObject<HTMLElement | null> {
  const ref = useRef<HTMLElement | null>(null);
  const { pathname } = useLocation();
  const previous = useRef(pathname);

  useEffect(() => {
    if (previous.current === pathname) return;
    previous.current = pathname;
    ref.current?.focus({ preventScroll: true });
  }, [pathname]);

  return ref;
}
