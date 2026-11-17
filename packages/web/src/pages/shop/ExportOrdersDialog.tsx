import { useState } from "react";
import { addDays, gymToday } from "@fitburn/contracts";
import { Alert } from "../../components/ui/Alert";
import { Button } from "../../components/ui/Button";
import { Dialog } from "../../components/ui/Dialog";
import { Field } from "../../components/ui/Field";
import { errorMessage } from "../../lib/auth/api";
import { useNetworkRequired } from "../../lib/connectivity/useNetworkRequired";
import { exportShopOrdersCsv } from "../../lib/shop/admin-orders-api";

/**
 * Exportação de pedidos em CSV (L8, #202): período de/até (datas locais, inclusivas) já preenchido com o do filtro
 * da aba. A API valida o período (de depois de até, mais de 92 dias) e a mensagem dela aparece dentro, com o diálogo
 * aberto para corrigir; no sucesso o arquivo baixa e o diálogo fecha. Sem conexão, "Exportar" fica desabilitado.
 */
export function ExportOrdersDialog({
  initialRange,
  onClose,
}: {
  initialRange: { from: string; to: string };
  onClose: () => void;
}) {
  const { offline, reason: offlineReason } = useNetworkRequired();
  const [from, setFrom] = useState(initialRange.from);
  const [to, setTo] = useState(initialRange.to);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleExport() {
    if (running) return;
    setRunning(true);
    setError(null);
    try {
      await exportShopOrdersCsv(from, to);
      onClose();
    } catch (caught) {
      setError(errorMessage(caught, "Não foi possível exportar os pedidos."));
      setRunning(false);
    }
  }

  return (
    <Dialog
      title="Exportar pedidos (CSV)"
      description="Pedidos criados no período, uma linha por item. O período vai até 92 dias."
      onClose={onClose}
      actions={
        <>
          <Button disabled={running} onClick={onClose}>
            Voltar
          </Button>
          <Button
            variant="primary"
            busy={running}
            disabled={offline || from === "" || to === ""}
            aria-disabled={offline || undefined}
            title={offline ? offlineReason : undefined}
            onClick={() => void handleExport()}
          >
            {running ? "Exportando…" : "Exportar"}
          </Button>
        </>
      }
    >
      <div className="fb-ui-form-grid">
        <Field label="De" type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
        <Field label="Até" type="date" value={to} onChange={(event) => setTo(event.target.value)} />
      </div>
      {error && <Alert>{error}</Alert>}
    </Dialog>
  );
}

/** Período padrão do diálogo: o do filtro da aba; "Todo o período" não tem intervalo, então vale os últimos 30 dias. */
export function defaultExportRange(range: { from: string; to: string }): { from: string; to: string } {
  if (range.from && range.to) return range;
  const today = gymToday();
  return { from: addDays(today, -29), to: today };
}
