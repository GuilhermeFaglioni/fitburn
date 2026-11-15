import { Link, useNavigate } from "react-router-dom";
import { errorMessage } from "../../lib/auth/api";
import { useBioimpedanceConsent } from "../../lib/bioimpedance/useBioimpedanceConsent";
import { QueryBlockState } from "../../components/QueryBlockState";
import { Alert } from "../../components/ui/Alert";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";

/**
 * Composição corporal (`/bioimpedancia`). Sem consentimento (D-042), mostra a autorização com
 * "Autorizar registro" e "Agora não"; com ele, a tela de resumo das avaliações (próximas fatias).
 */
export function BioimpedancePage() {
  const navigate = useNavigate();
  const { query, mutation } = useBioimpedanceConsent();
  const consent = query.data;

  return (
    <div className="fb-bio">
      <h1 className="fb-bio__title">Composição corporal</h1>

      <QueryBlockState
        query={query}
        loading="Carregando…"
        error="Não foi possível carregar sua autorização de bioimpedância."
        hasData={consent !== undefined}
      />

      {consent && !consent.consented && (
        <Card as="section" flat className="fb-bio__card" aria-labelledby="fb-bio-consent-title">
          <h2 id="fb-bio-consent-title" className="fb-bio__subtitle">
            Acompanhe sua evolução
          </h2>
          <p className="fb-bio__copy">
            Quando você faz a bioimpedância na Fitburn, a equipe pode registrar os resultados aqui:
            peso, massa muscular, gordura, água e a análise por segmento do corpo.
          </p>
          <ul className="fb-bio__list">
            <li>Guardamos só os valores, não a imagem do laudo.</li>
            <li>Você e a equipe da Fitburn veem os dados. Ninguém mais.</li>
            <li>Você pode desligar quando quiser, no Perfil.</li>
          </ul>
          <Link to="/privacidade" className="fb-bio__link">
            Ler a política de privacidade
          </Link>
          {mutation.isError && (
            <Alert>
              {errorMessage(mutation.error, "Não foi possível registrar sua autorização.")}
            </Alert>
          )}
          <div className="fb-bio__actions">
            <Button
              variant="primary"
              block
              busy={mutation.isPending}
              onClick={() => mutation.mutate(true)}
            >
              Autorizar registro
            </Button>
            <Button variant="ghost" disabled={mutation.isPending} onClick={() => navigate("/")}>
              Agora não
            </Button>
          </div>
        </Card>
      )}

      {consent?.consented && (
        <Card as="section" flat className="fb-bio__card">
          <p className="fb-bio__copy">
            Você ainda não tem avaliações registradas. Faça a bioimpedância na recepção da Fitburn e
            a equipe registra os resultados aqui.
          </p>
        </Card>
      )}
    </div>
  );
}
