import { useOnline } from "../lib/connectivity/useOnline";
import { ErrorState, LoadingState, OfflineState } from "./ui/States";

/** O que uma consulta (react-query) diz sobre um bloco: o necessário para escolher o estado. */
export interface QueryStatus {
  isPending: boolean;
  isError: boolean;
  /** `paused`: a consulta espera a rede voltar (o react-query não dispara fetch offline). */
  fetchStatus: "fetching" | "paused" | "idle";
  refetch: () => unknown;
}

/**
 * Estado de um bloco que ainda não tem dado: carregando, sem conexão ou erro (componentes de `ui/States`).
 * Devolve `null` quando já há dado (primeira carga ou cache), para o bloco seguir com o conteúdo.
 */
export function QueryBlockState({
  query,
  loading,
  error,
  hasData,
  className,
}: {
  query: QueryStatus;
  /** Texto do carregando, específico do bloco. */
  loading: string;
  /** Mensagem do erro (e do offline), específica do bloco. */
  error: string;
  /** Já há dado (da primeira carga ou do cache): nada a mostrar aqui. */
  hasData: boolean;
  className?: string;
}) {
  const online = useOnline();
  if (hasData) return null;

  const waitingForNetwork = query.isPending && query.fetchStatus === "paused";
  if (waitingForNetwork || (query.isError && !online)) {
    // Sem rede o problema é a conexão, não o bloco: o botão tenta de novo.
    return (
      <OfflineState
        className={className}
        description={error}
        retryLabel="Tentar novamente"
        onRetry={() => void query.refetch()}
      />
    );
  }
  if (query.isError) {
    return <ErrorState className={className} title={error} onRetry={() => void query.refetch()} />;
  }
  if (query.isPending) return <LoadingState className={className} label={loading} />;
  return null;
}
