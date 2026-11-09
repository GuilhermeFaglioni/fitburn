import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { QueryBlockState } from "../../components/QueryBlockState";
import { Alert } from "../../components/ui/Alert";
import { Card } from "../../components/ui/Card";
import { Checkbox } from "../../components/ui/Checkbox";
import { errorMessage } from "../../lib/auth/api";
import { useAuth } from "../../lib/auth/AuthContext";
import { isClientUser } from "../../lib/auth/areas";
import {
  getRankingConsent,
  rankingConsentQueryKey,
  setRankingConsent,
} from "../../lib/gamification/api";

export function RankingConsentControl({ surface }: { surface: "profile" | "gamification" }) {
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

  const content = (
    <>
      <h2
        id="fb-ranking-consent-title"
        className={surface === "profile" ? "fb-profile__card-title" : "fb-gami__section-title"}
      >
        Participação no ranking
      </h2>
      <p className="fb-ranking-consent__copy">
        Sua participação é opcional. Ao aderir, outros participantes veem seu primeiro nome, inicial
        do sobrenome, posição e presenças. Sem adesão, você não vê posições; seus pontos, histórico,
        sequência e marcos continuam disponíveis para você.
      </p>

      <QueryBlockState
        query={consentQuery}
        loading="Carregando…"
        error="Não foi possível carregar sua participação no ranking."
        hasData={consentQuery.data !== undefined}
      />
      {consentQuery.data && (
        <Checkbox
          className="fb-ranking-consent__toggle"
          label="Participar do ranking"
          checked={consentQuery.data.consented}
          disabled={consentMutation.isPending}
          onChange={(event) => consentMutation.mutate(event.currentTarget.checked)}
        />
      )}
      {consentMutation.isError && (
        <Alert className="fb-ranking-consent__error">
          {errorMessage(consentMutation.error, "Não foi possível atualizar sua participação.")}
        </Alert>
      )}
    </>
  );

  return surface === "profile" ? (
    <Card
      as="section"
      flat
      className="fb-profile__card fb-ranking-consent"
      aria-labelledby="fb-ranking-consent-title"
    >
      {content}
    </Card>
  ) : (
    <section
      className="fb-gami__section fb-ranking-consent"
      aria-labelledby="fb-ranking-consent-title"
    >
      {content}
    </section>
  );
}
