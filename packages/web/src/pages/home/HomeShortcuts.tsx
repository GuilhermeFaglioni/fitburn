import { HomeBodyShortcut } from "./HomeBodyShortcut";
import { HomeShopShortcut } from "./HomeShopShortcut";

/**
 * Atalhos deslizantes do Início (N2, #201): Corpo e Loja lado a lado, logo abaixo da saudação. Cada um é um carrossel
 * independente, com o próprio carregando, erro e sem conexão. A Loja sem produtos não renderiza nada e o Corpo
 * ocupa a largura toda (a linha é flex, cada atalho divide o espaço que existe).
 */
export function HomeShortcuts() {
  return (
    <div className="fb-home__shortcuts">
      <HomeBodyShortcut />
      <HomeShopShortcut />
    </div>
  );
}
