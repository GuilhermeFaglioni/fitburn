import { useId, useRef, useState } from "react";
import { errorMessage } from "../lib/auth/api";
import { RequiresNetwork } from "./RequiresNetwork";
import { Alert } from "./ui/Alert";
import { Button } from "./ui/Button";

interface ExportCsvButtonProps {
  label: string;
  onExport: () => Promise<void>;
  /** Desabilita o botão por um motivo da tela (ex.: período sem intervalo). Pede o `hint` junto. */
  disabled?: boolean;
  /** Texto visível sob o botão, associado a ele por `aria-describedby` (explica o `disabled`). */
  hint?: string;
}

/**
 * Botão de exportação em CSV (`Button` da base, D-038): enquanto a exportação roda fica desabilitado
 * ("Exportando…") e ignora cliques repetidos; erro da API aparece como alerta
 * logo abaixo; sem conexão fica desabilitado com a explicação padrão. A tela
 * também pode desabilitá-lo (`disabled`) e dizer o motivo em texto visível (`hint`).
 */
export function ExportCsvButton({
  label,
  onExport,
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
    <div className="fb-ui-export">
      <RequiresNetwork>
        <Button
          size="sm"
          disabled={running || disabled}
          busy={running}
          aria-describedby={hint ? hintId : undefined}
          onClick={() => void handleClick()}
        >
          {running ? "Exportando…" : label}
        </Button>
      </RequiresNetwork>
      {hint && (
        <p id={hintId} className="fb-ui-note">
          {hint}
        </p>
      )}
      {error !== null && <Alert>{errorMessage(error, "Não foi possível exportar o relatório.")}</Alert>}
    </div>
  );
}
