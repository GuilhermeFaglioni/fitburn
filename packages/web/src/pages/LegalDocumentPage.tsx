import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { errorMessage } from "../lib/auth/api";
import { useAuth } from "../lib/auth/AuthContext";
import { getLegalDocument, type LegalDocumentKey } from "../lib/onboarding/api";
import { LoadingState } from "../components/states";

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

function LegalDocumentRequestState({ pending, error }: { pending: boolean; error: unknown }) {
  return pending ? (
    <LoadingState label="Carregando documento" />
  ) : (
    <p role="alert">{errorMessage(error, "Não foi possível carregar o documento.")}</p>
  );
}

function LegalDocumentText({ content }: { content: string }) {
  return (
    <div className="fb-profile__legal-copy">
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
      <p>Versão {version}</p>
      <article className="fb-profile__card" aria-label={title}>
        <LegalDocumentText content={content} />
      </article>
    </>
  );
}

export function LegalDocumentPage({ documentKey }: { documentKey: LegalDocumentKey }) {
  const query = useLegalDocument(documentKey);

  if (query.isPending || query.isError) {
    return (
      <main id="conteudo" tabIndex={-1} className="fb-profile fb-legal-document">
        <Link to="/login" className="fb-back-link">
          Voltar ao login
        </Link>
        <LegalDocumentRequestState pending={query.isPending} error={query.error} />
      </main>
    );
  }

  return (
    <main id="conteudo" tabIndex={-1} className="fb-profile fb-legal-document">
      <Link to="/login" className="fb-back-link">
        Voltar ao login
      </Link>
      <h1 className="fb-profile__title">{query.data.title}</h1>
      <LegalDocumentContent
        title={query.data.title}
        version={query.data.version}
        content={query.data.content}
      />
      <nav aria-label="Outros documentos legais" className="fb-legal-document__links">
        {documentKey !== "privacy-policy" && <Link to="/privacidade">Política de privacidade</Link>}
        {documentKey !== "terms-of-use" && <Link to="/termos">Termos de uso</Link>}
      </nav>
    </main>
  );
}

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
  if (query.isPending || query.isError) {
    return <LegalDocumentRequestState pending={query.isPending} error={query.error} />;
  }

  return (
    <main id="conteudo" tabIndex={-1} className="fb-profile fb-legal-document">
      <h1 className="fb-profile__title">{document.onboardingHeading}</h1>
      <LegalDocumentContent
        title={query.data.title}
        version={query.data.version}
        content={query.data.content}
      />
      <label className="fb-profile__legal-confirmation">
        <input
          type="checkbox"
          checked={confirmed}
          onChange={(event) => {
            setConfirmed(event.target.checked);
            setError(null);
          }}
        />
        {document.checkboxLabel}
      </label>
      {error && (
        <p role="alert" className="fb-profile__alert">
          {error}
        </p>
      )}
      <button
        type="button"
        className="fb-btn-primary"
        disabled={!confirmed || mutation.isPending}
        onClick={() => mutation.mutate()}
      >
        {mutation.isPending ? "Salvando…" : document.buttonLabel}
      </button>
    </main>
  );
}
