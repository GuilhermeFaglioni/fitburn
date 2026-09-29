import { useEffect } from "react";
import { trackedFetch } from "../lib/connectivity/connectivity-store";
import { useOnline } from "../lib/connectivity/useOnline";

const PROBE_INTERVAL_MS = 5_000;

/**
 * Pergunta à API se ela responde. Qualquer resposta (mesmo de erro) prova que há
 * rede e derruba o aviso; se falhar de novo, o aviso continua. É a saída para
 * uma falha de rede sem evento "online" do navegador (Wi-Fi sem internet): com
 * as ações desabilitadas, ninguém mais dispararia uma requisição para se recuperar.
 */
function probeConnection() {
  void trackedFetch("/api/health").catch(() => undefined);
}

/**
 * Aviso global de "sem conexão": aparece no topo de qualquer tela enquanto o
 * navegador estiver offline ou as requisições estiverem falhando por rede.
 */
export function OfflineBanner() {
  const online = useOnline();

  useEffect(() => {
    if (online) return;
    const timer = setInterval(probeConnection, PROBE_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [online]);

  if (online) return null;

  return (
    <div role="alert" className="fb-offline-banner">
      <strong>Sem conexão.</strong> As ações que precisam de internet ficam indisponíveis até a
      conexão voltar.
      <button type="button" className="fb-offline-banner__retry" onClick={probeConnection}>
        Verificar conexão
      </button>
    </div>
  );
}
