import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ErrorState, LoadingState } from "../../components/states";
import { errorMessage } from "../../lib/auth/api";
import { useAuth } from "../../lib/auth/AuthContext";
import { isClientUser } from "../../lib/auth/areas";
import {
  getRankingConsent,
  rankingConsentQueryKey,
  setRankingConsent,
} from "../../lib/gamification/api";

export function RankingConsentControl({
  surface,
}: {
  surface: "profile" | "gamification";
}) {
  const { user } = useAuth();
  const isClient = user ? isClientUser(user) : false;
  const queryClient = useQueryClient();
  const consentQuery = useQuery({
    queryKey: rankingConsentQueryKey,
    queryFn: getRankingConsent,
    enabled: isClient,
  });
  const consentMutation = useMutation({
    mutationFn: setRankingConsent,
    onSuccess: (response) => {
      queryClient.setQueryData(rankingConsentQueryKey, response);
      void queryClient.invalidateQueries({ queryKey: ["gamification", "ranking"] });
    },
  });

  if (!isClient) return null;

  const className =
    surface === "profile"
      ? "fb-profile__card fb-ranking-consent"
      : "fb-gami__section fb-ranking-consent";

  return (
    <section className={className} aria-labelledby="fb-ranking-consent-title">
      <h2
        id="fb-ranking-consent-title"
        className={surface === "profile" ? "fb-profile__card-title" : "fb-gami__section-title"}
      >
        Participação no ranking
      </h2>
      <p className="fb-ranking-consent__copy">
        Sua participação é opcional. Ao aderir, outros participantes veem seu primeiro nome,
        inicial do sobrenome, posição e presenças. Sem adesão, você não vê posições; seus pontos,
        histórico, sequência e marcos continuam disponíveis para você.
      </p>

      {consentQuery.isLoading && <LoadingState surface="dark" />}
      {consentQuery.isError && (
        <ErrorState
          surface="dark"
          message="Não foi possível carregar sua participação no ranking."
          onRetry={() => void consentQuery.refetch()}
        />
      )}
      {consentQuery.data && (
        <label className="fb-ranking-consent__toggle">
          <input
            type="checkbox"
            checked={consentQuery.data.consented}
            disabled={consentMutation.isPending}
            onChange={(event) => consentMutation.mutate(event.currentTarget.checked)}
          />
          <span>Participar do ranking</span>
        </label>
      )}
      {consentMutation.isError && (
        <p className="fb-ranking-consent__error" role="alert">
          {errorMessage(consentMutation.error, "Não foi possível atualizar sua participação.")}
        </p>
      )}
    </section>
  );
}
