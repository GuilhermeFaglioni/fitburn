import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../lib/auth/AuthContext";
import { visibleAdminMenuItems } from "../lib/auth/areas";
import { AdminBrand } from "./AdminBrand";
import { AppMenu } from "./AppMenu";
import { ThemeToggle } from "./ThemeToggle";
import { useHostThemeToggle } from "./themeToggleHost";
import { Button } from "./ui/Button";
import { LoadingState } from "./ui/States";
import { useFocusOnNavigation } from "./useFocusOnNavigation";

/** Mesmo ponto de quebra do CSS (admin.css, AppMenu.css): a partir daqui a navegação é a barra lateral. */
const DESKTOP_QUERY = "(min-width: 768px)";

/**
 * Casca das telas administrativas (#156, D-038): barra lateral clara de `--sidebar-w` e, ao lado, o cabeçalho com o
 * botão de tema e o conteúdo no contêiner (`--container-max`). É uma layout route própria porque o Cliente usa outra
 * casca. No celular a barra vira um cabeçalho com a marca, o tema e o botão Menu, que abre a gaveta. As telas continuam
 * rendendo o próprio título (h1) e conteúdo dentro do `main`. Enquanto a sessão não está pronta, o `main` mostra o
 * estado de carregando; sem conexão, "Sair" fica indisponível (RequiresNetwork) e o aviso global aparece no topo.
 */
export function AdminLayout() {
  const mainRef = useFocusOnNavigation();
  const { user } = useAuth();
  const { pathname } = useLocation();
  useHostThemeToggle();

  const [drawerOpen, setDrawerOpen] = useState(false);
  const drawerId = useId();
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const hasMenu = user ? visibleAdminMenuItems(user).length > 0 : false;

  // Escolher uma tela fecha a gaveta (o foco vai ao conteúdo, via useFocusOnNavigation).
  useEffect(() => {
    setDrawerOpen(false);
  }, [pathname]);

  // Se a janela passa a ser de desktop, a gaveta não faz mais sentido: a barra lateral toma o lugar.
  useEffect(() => {
    if (!drawerOpen || typeof window.matchMedia !== "function") return;
    const query = window.matchMedia(DESKTOP_QUERY);
    const handleChange = (event: MediaQueryListEvent) => {
      if (event.matches) setDrawerOpen(false);
    };
    query.addEventListener("change", handleChange);
    return () => query.removeEventListener("change", handleChange);
  }, [drawerOpen]);

  // Esc, clique no fundo ou Fechar: o foco volta ao botão Menu (alguns navegadores não o focam ao clicar). O clique no
  // fundo fecha no mousedown e o navegador ainda tira o foco do alvo depois do handler, então o foco volta no timeout.
  const closeDrawer = useCallback(() => {
    setDrawerOpen(false);
    setTimeout(() => menuButtonRef.current?.focus(), 0);
  }, []);

  return (
    <div className="fb-admin-shell">
      <AppMenu drawerId={drawerId} drawerOpen={drawerOpen} onDrawerClose={closeDrawer} />
      <div className="fb-admin__body">
        <header className="fb-admin__top">
          {/* No desktop a marca fica na barra lateral; o cabeçalho a mostra só no celular (admin.css). */}
          <AdminBrand className="fb-admin__brand--top" />
          <div className="fb-admin__top-actions">
            <ThemeToggle inline />
            {hasMenu && (
              <Button
                ref={menuButtonRef}
                size="sm"
                className="fb-admin__menu-button"
                aria-expanded={drawerOpen}
                aria-controls={drawerId}
                onClick={() => setDrawerOpen((open) => !open)}
              >
                Menu
              </Button>
            )}
          </div>
        </header>
        <main ref={mainRef} id="conteudo" tabIndex={-1} className="fb-admin-content">
          {user ? <Outlet /> : <LoadingState label="Carregando sua sessão…" />}
        </main>
      </div>
    </div>
  );
}
