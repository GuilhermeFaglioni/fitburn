import { useId, useRef, useState } from "react";
import { errorMessage } from "../lib/auth/api";
import { RequiresNetwork } from "./RequiresNetwork";

interface ExportCsvButtonProps {
  label: string;
  onExport: () => Promise<void>;
  className?: string;
  /** Desabilita o botão por um motivo da tela (ex.: período sem intervalo). Pede o `hint` junto. */
  disabled?: boolean;
  /** Texto visível sob o botão, associado a ele por `aria-describedby` (explica o `disabled`). */
  hint?: string;
}

/**
 * Botão de exportação em CSV: enquanto a exportação roda fica desabilitado
 * ("Exportando…") e ignora cliques repetidos; erro da API aparece como alerta
 * logo abaixo; sem conexão fica desabilitado com a explicação padrão. A tela
 * também pode desabilitá-lo (`disabled`) e dizer o motivo em texto visível (`hint`).
 */
export function ExportCsvButton({
  label,
  onExport,
  className = "fb-btn-secondary",
  disabled = false,
  hint,
}: ExportCsvButtonProps) {
  const hintId = useId();
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<unknown>(null);
  // O estado só atualiza na próxima renderização; a ref barra o segundo clique do mesmo instante.
  const runningRef = useRef(false);

  async function handleClick() {
    if (disabled || runningRef.current) return;
    runningRef.current = true;
    setRunning(true);
    setError(null);
    try {
      await onExport();
    } catch (caught) {
      setError(caught);
    } finally {
      runningRef.current = false;
      setRunning(false);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
      <RequiresNetwork>
        <button
          type="button"
          className={className}
          disabled={running || disabled}
          aria-busy={running}
          aria-describedby={hint ? hintId : undefined}
          onClick={() => void handleClick()}
        >
          {running ? "Exportando…" : label}
        </button>
      </RequiresNetwork>
      {hint && (
        <p id={hintId} className="fb-export-hint">
          {hint}
        </p>
      )}
      {error !== null && (
        <p role="alert" className="fb-error-box">
          {errorMessage(error, "Não foi possível exportar o relatório.")}
        </p>
      )}
    </div>
  );
}
