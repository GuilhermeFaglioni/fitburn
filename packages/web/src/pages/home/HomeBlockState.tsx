import type { ReactNode } from "react";
import { useOnline } from "../../lib/connectivity/useOnline";
import { EmptyState, ErrorState, LoadingState, OfflineState } from "../../components/ui/States";

/** O que uma consulta (react-query) diz sobre um bloco da Home: o necessário para escolher o estado. */
export interface QueryStatus {
  isPending: boolean;
  isError: boolean;
  /** `paused`: a consulta espera a rede voltar (o react-query não dispara fetch offline). */
  fetchStatus: "fetching" | "paused" | "idle";
  refetch: () => unknown;
}

/**
 * Estado de um bloco da Home que ainda não tem dado: carregando, sem conexão ou erro. Devolve `null` quando já há
 * dado (primeira carga ou cache), para o bloco seguir com o conteúdo. Cada bloco carrega e falha sozinho.
 */
export function HomeBlockState({
  query,
  loading,
  error,
  hasData,
}: {
  query: QueryStatus;
  /** Texto do carregando, específico do bloco. */
  loading: string;
  /** Mensagem do erro, específica do bloco. */
  error: string;
  /** Já há dado (da primeira carga ou do cache): nada a mostrar aqui. */
  hasData: boolean;
}) {
  const online = useOnline();
  if (hasData) return null;

  const waitingForNetwork = query.isPending && query.fetchStatus === "paused";
  if (waitingForNetwork || (query.isError && !online)) {
    // Sem rede o problema é a conexão, não o bloco: o botão tenta de novo.
    return (
      <OfflineState
        className="fb-home__state"
        description={error}
        retryLabel="Tentar novamente"
        onRetry={() => void query.refetch()}
      />
    );
  }
  if (query.isError) {
    return (
      <ErrorState className="fb-home__state" title={error} onRetry={() => void query.refetch()} />
    );
  }
  if (query.isPending) return <LoadingState className="fb-home__state" label={loading} />;
  return null;
}

/** Estado vazio compacto da Home (faixa tracejada da proposta). */
export function HomeEmpty({ title, action }: { title: string; action?: ReactNode }) {
  return <EmptyState className="fb-home__state" title={title} action={action} />;
}
