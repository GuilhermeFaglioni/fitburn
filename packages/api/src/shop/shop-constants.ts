/** Mensagem de 403 OUT_OF_SCOPE: todas as rotas da loja exigem escopo total. */
export const SHOP_FULL_SCOPE_MESSAGE = "Só quem tem acesso a todos os dados gerencia a loja.";

/**
 * Lock consultivo da ordem e das categorias: criar, ordenar e excluir categoria,
 * e trocar a categoria de um produto, passam por ele (nessa ordem de travamento,
 * sempre antes do lock de destaque). Assim a exclusão não perde um produto
 * ativo que acabou de ser vinculado à categoria.
 */
export const SHOP_CATEGORY_LOCK = "shop-category-order";

/** Lock consultivo do limite de destaques no Início (no máximo 3). */
export const SHOP_FEATURED_LOCK = "shop-featured";
