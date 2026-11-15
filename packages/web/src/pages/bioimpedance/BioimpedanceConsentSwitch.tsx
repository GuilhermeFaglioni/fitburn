import { useState } from "react";
import { errorMessage } from "../../lib/auth/api";
import { useAuth } from "../../lib/auth/AuthContext";
import { isClientUser } from "../../lib/auth/areas";
import { useBioimpedanceConsent } from "../../lib/bioimpedance/useBioimpedanceConsent";
import { QueryBlockState } from "../../components/QueryBlockState";
import { Alert } from "../../components/ui/Alert";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { Dialog } from "../../components/ui/Dialog";
import { Switch } from "../../components/ui/Switch";

/** Perfil › Privacidade: interruptor do consentimento de bioimpedância; desligar pede confirmação (D-042). */
export function BioimpedanceConsentSwitch() {
  const { user } = useAuth();
  const isClient = user ? isClientUser(user) : false;
  const { query, mutation } = useBioimpedanceConsent(isClient);
  const [confirming, setConfirming] = useState(false);

  if (!isClient) return null;

  const consent = query.data;
  return (
    <Card as="section" flat className="fb-profile__card" aria-labelledby="fb-bio-privacy-title">
      <h2 id="fb-bio-privacy-title" className="fb-profile__card-title">
        Privacidade
      </h2>
      <QueryBlockState
        query={query}
        loading="Carregando…"
        error="Não foi possível carregar sua autorização de bioimpedância."
        hasData={consent !== undefined}
      />
      {consent && (
        <Switch
          label="Registrar minha bioimpedância"
          description="A equipe pode salvar os valores das suas avaliações e você vê a evolução. Desligar impede novos registros."
          checked={consent.consented}
          disabled={mutation.isPending}
          onChange={(next) => (next ? mutation.mutate(true) : setConfirming(true))}
        />
      )}
      {mutation.isError && (
        <Alert>{errorMessage(mutation.error, "Não foi possível atualizar sua autorização.")}</Alert>
      )}
      {confirming && (
        <Dialog
          title="Desligar o registro da bioimpedância?"
          description="A equipe não poderá registrar novas avaliações. A equipe também deixa de ver as avaliações já registradas. Você continua vendo as suas e pode excluí-las."
          onClose={() => setConfirming(false)}
          actions={
            <>
              <Button size="sm" onClick={() => setConfirming(false)}>
                Voltar
              </Button>
              <Button
                size="sm"
                variant="danger"
                onClick={() => {
                  setConfirming(false);
                  mutation.mutate(false);
                }}
              >
                Desligar
              </Button>
            </>
          }
        />
      )}
    </Card>
  );
}
