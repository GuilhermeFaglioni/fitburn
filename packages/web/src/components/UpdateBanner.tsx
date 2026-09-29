import { useEffect, useState } from "react";
import { useRegisterSW } from "virtual:pwa-register/react";

const UPDATE_CHECK_INTERVAL_MS = 60 * 60 * 1000;

/**
 * Aviso de nova versão. O service worker novo, baixado depois de um deploy,
 * fica esperando (registerType "prompt"): a versão em uso não muda debaixo do
 * usuário no meio de uma ação. Ao tocar em "Recarregar", o novo é ativado e a
 * página recarregada. Também consulta o servidor de hora em hora, para quem
 * mantém o app aberto por muito tempo (PWA instalada) receber o aviso.
 */
export function UpdateBanner() {
  const [registration, setRegistration] = useState<{ update: () => Promise<unknown> } | null>(null);
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW: (_url, swRegistration) => setRegistration(swRegistration ?? null),
  });

  useEffect(() => {
    if (!registration) return;
    const timer = setInterval(() => {
      // Sem rede a consulta falha; ela se repete na próxima hora.
      void registration.update().catch(() => undefined);
    }, UPDATE_CHECK_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [registration]);

  if (!needRefresh) return null;

  return (
    <div role="status" className="fb-update-banner">
      Nova versão disponível.
      <button
        type="button"
        className="fb-update-banner__action"
        onClick={() => void updateServiceWorker(true)}
      >
        Recarregar
      </button>
    </div>
  );
}
