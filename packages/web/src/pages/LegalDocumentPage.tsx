import { useState, type ReactNode } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { errorMessage } from "../lib/auth/api";
import { useAuth } from "../lib/auth/AuthContext";
import { getLegalDocument, type LegalDocumentKey } from "../lib/onboarding/api";
import { QueryBlockState } from "../components/QueryBlockState";
import { Alert } from "../components/ui/Alert";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { Checkbox } from "../components/ui/Checkbox";

const DOCUMENTS = {
  "privacy-policy": {
    checkboxLabel: "Li a política de privacidade",
    buttonLabel: "Registrar ciência",
    failureMessage: "Não foi possível registrar sua ciência.",
    onboardingHeading: "Ciência da política de privacidade",
    manifestationAction: "acknowledgePrivacy",
  },
  "terms-of-use": {
    checkboxLabel: "Li e aceito os termos de uso",
    buttonLabel: "Aceitar termos",
    failureMessage: "Não foi possível registrar seu aceite.",
    onboardingHeading: "Aceite dos termos de uso",
    manifestationAction: "acceptTerms",
  },
} satisfies Record<
  LegalDocumentKey,
  {
    checkboxLabel: string;
    buttonLabel: string;
    failureMessage: string;
    onboardingHeading: string;
    manifestationAction: "acknowledgePrivacy" | "acceptTerms";
  }
>;

function useLegalDocument(documentKey: LegalDocumentKey) {
  return useQuery({
    queryKey: ["legal-document", documentKey],
    queryFn: () => getLegalDocument(documentKey),
  });
}

/** Carregando, erro ou sem conexão do documento (`QueryBlockState`); some quando o texto chega. */
function LegalDocumentRequestState({ query }: { query: ReturnType<typeof useLegalDocument> }) {
  return (
    <QueryBlockState
      query={query}
      loading="Carregando documento"
      error={errorMessage(query.error, "Não foi possível carregar o documento.")}
      hasData={query.data !== undefined}
    />
  );
}

/** Coluna de leitura das telas legais e das etapas do onboarding: sozinha na página, sem casca. */
function LegalPageFrame({ children }: { children: ReactNode }) {
  return (
    <main id="conteudo" tabIndex={-1} className="fb-flow fb-legal">
      {children}
    </main>
  );
}

function LegalDocumentText({ content }: { content: string }) {
  return (
    <div className="fb-legal__copy">
      {content
        .split(/\n\s*\n/)
        .filter(Boolean)
        .map((paragraph, index) => (
          <p key={`${index}-${paragraph.slice(0, 24)}`}>{paragraph}</p>
        ))}
    </div>
  );
}

function LegalDocumentContent({
  title,
  version,
  content,
}: {
  title: string;
  version: string;
  content: string;
}) {
  return (
    <>
      <p className="fb-legal__meta">Versão {version}</p>
      <Card as="article" flat className="fb-legal__doc" aria-label={title}>
        <LegalDocumentText content={content} />
      </Card>
    </>
  );
}

function BackToLogin() {
  return (
    <Link to="/login" className="fb-legal__back">
      <svg
        width="16"
        height="16"
        viewBox="0 0 16 16"
        fill="none"
        aria-hidden="true"
        focusable="false"
      >
        <path
          d="M13 8H3M7 4L3 8l4 4"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      Voltar ao login
    </Link>
  );
}

/**
 * Política de privacidade e Termos de uso (D-038, telas extrapoladas da base): leitura em coluna de até 65
 * caracteres, voltar ao login, versão vigente e o link para o outro documento. O texto vem da API e não é alterado.
 */
export function LegalDocumentPage({ documentKey }: { documentKey: LegalDocumentKey }) {
  const query = useLegalDocument(documentKey);

  return (
    <LegalPageFrame>
      <BackToLogin />
      <LegalDocumentRequestState query={query} />
      {query.data && (
        <>
          <h1 className="fb-flow__title">{query.data.title}</h1>
          <LegalDocumentContent
            title={query.data.title}
            version={query.data.version}
            content={query.data.content}
          />
          <nav aria-label="Outros documentos legais" className="fb-legal__links">
            {documentKey !== "privacy-policy" && (
              <Link to="/privacidade">Política de privacidade</Link>
            )}
            {documentKey !== "terms-of-use" && <Link to="/termos">Termos de uso</Link>}
          </nav>
        </>
      )}
    </LegalPageFrame>
  );
}

/**
 * Etapa do onboarding de ciência da política ou aceite dos termos: o texto vigente, o checkbox de confirmação e o botão
 * de avançar (desabilitado até confirmar; `aria-busy` enquanto registra). Ordem e obrigação do aceite não mudam.
 */
export function LegalManifestationStep({ documentKey }: { documentKey: LegalDocumentKey }) {
  const { acknowledgePrivacy, acceptTerms } = useAuth();
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const document = DOCUMENTS[documentKey];
  const query = useLegalDocument(documentKey);
  const actions = { acknowledgePrivacy, acceptTerms };
  const mutation = useMutation({
    mutationFn: actions[document.manifestationAction],
    onError: (failure) => setError(errorMessage(failure, document.failureMessage)),
  });

  return (
    <LegalPageFrame>
      <LegalDocumentRequestState query={query} />
      {query.data && (
        <>
          <h1 className="fb-flow__title">{document.onboardingHeading}</h1>
          <LegalDocumentContent
            title={query.data.title}
            version={query.data.version}
            content={query.data.content}
          />
          <Checkbox
            label={document.checkboxLabel}
            checked={confirmed}
            onChange={(event) => {
              setConfirmed(event.target.checked);
              setError(null);
            }}
          />
          {error && <Alert>{error}</Alert>}
          <Button
            variant="primary"
            block
            busy={mutation.isPending}
            disabled={!confirmed}
            onClick={() => mutation.mutate()}
          >
            {mutation.isPending ? "Salvando…" : document.buttonLabel}
          </Button>
        </>
      )}
    </LegalPageFrame>
  );
}
