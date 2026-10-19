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
  },
  "terms-of-use": {
    checkboxLabel: "Li e aceito os termos de uso",
    buttonLabel: "Aceitar termos",
    failureMessage: "Não foi possível registrar seu aceite.",
  },
} satisfies Record<
  LegalDocumentKey,
  { checkboxLabel: string; buttonLabel: string; failureMessage: string }
>;

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

export function LegalDocumentPage({ documentKey }: { documentKey: LegalDocumentKey }) {
  const query = useQuery({
    queryKey: ["legal-document", documentKey],
    queryFn: () => getLegalDocument(documentKey),
  });

  return (
    <main id="conteudo" tabIndex={-1} className="fb-profile fb-legal-document">
      <Link to="/login" className="fb-back-link">
        Voltar ao login
      </Link>
      {query.isPending ? (
        <LoadingState label="Carregando documento" />
      ) : query.isError ? (
        <p role="alert">{errorMessage(query.error, "Não foi possível carregar o documento.")}</p>
      ) : (
        <>
          <h1 className="fb-profile__title">{query.data.title}</h1>
          <p>Versão {query.data.version}</p>
          <div className="fb-profile__alert" role="note">
            Conteúdo provisório para validação técnica. Esta ainda não é a versão jurídica aprovada.
          </div>
          <article className="fb-profile__card" aria-label={query.data.title}>
            <LegalDocumentText content={query.data.content} />
          </article>
          <nav aria-label="Outros documentos legais" className="fb-legal-document__links">
            {documentKey !== "privacy-policy" && (
              <Link to="/privacidade">Política de privacidade</Link>
            )}
            {documentKey !== "terms-of-use" && <Link to="/termos">Termos de uso</Link>}
          </nav>
        </>
      )}
    </main>
  );
}

export function LegalManifestationStep({ documentKey }: { documentKey: LegalDocumentKey }) {
  const { acknowledgePrivacy, acceptTerms } = useAuth();
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const document = DOCUMENTS[documentKey];
  const query = useQuery({
    queryKey: ["legal-document", documentKey],
    queryFn: () => getLegalDocument(documentKey),
  });
  const mutation = useMutation({
    mutationFn: () => (documentKey === "privacy-policy" ? acknowledgePrivacy() : acceptTerms()),
    onError: (failure) => setError(errorMessage(failure, document.failureMessage)),
  });
  if (query.isPending) return <LoadingState label="Carregando documento" />;
  if (query.isError) {
    return (
      <p role="alert">{errorMessage(query.error, "Não foi possível carregar o documento.")}</p>
    );
  }

  return (
    <main id="conteudo" tabIndex={-1} className="fb-profile fb-legal-document">
      <h1 className="fb-profile__title">
        {documentKey === "privacy-policy"
          ? "Ciência da política de privacidade"
          : "Aceite dos termos de uso"}
      </h1>
      <p>Versão {query.data.version}</p>
      <div className="fb-profile__alert" role="note">
        Conteúdo provisório para validação técnica. Esta ainda não é a versão jurídica aprovada.
      </div>
      <article className="fb-profile__card" aria-label={query.data.title}>
        <LegalDocumentText content={query.data.content} />
      </article>
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
