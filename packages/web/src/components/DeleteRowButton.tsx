import { useEffect, useState } from "react";
import { ApiError } from "../lib/auth/api";
import { BlockedAction } from "./BlockedAction";

interface DeleteRowButtonProps {
  onDelete: () => Promise<unknown>;
  /** Sem permissão de excluir: bloqueio padrão do BlockedAction. */
  allowed: boolean;
  deniedReason: string;
  /** Exclusão sabidamente impossível (ex.: registro em uso): botão esmaecido, sem ação. */
  inUseReason?: string;
}

/**
 * "Excluir" vermelho das tabelas administrativas. Se a API recusar a
 * exclusão, a mensagem aparece no popover escuro do canvas de design
 * (TemplatesModalidades.dc.html), ancorado na célula de ações — por isso
 * a célula precisa de position: relative.
 */
export function DeleteRowButton({
  onDelete,
  allowed,
  deniedReason,
  inUseReason,
}: DeleteRowButtonProps) {
  const [error, setError] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    if (!error) return;
    const timer = setTimeout(() => setError(null), 6000);
    return () => clearTimeout(timer);
  }, [error]);

  async function handleClick() {
    if (inUseReason) return;
    setIsDeleting(true);
    try {
      await onDelete();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Não foi possível excluir.");
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <>
      <BlockedAction allowed={allowed} reason={deniedReason}>
        <button
          type="button"
          className="fb-row-btn fb-row-btn--danger"
          aria-disabled={inUseReason ? true : undefined}
          title={inUseReason}
          disabled={isDeleting}
          onClick={() => void handleClick()}
        >
          Excluir
        </button>
      </BlockedAction>
      {error && (
        <div role="alert" className="fb-blocked-popover">
          {error}
        </div>
      )}
    </>
  );
}
