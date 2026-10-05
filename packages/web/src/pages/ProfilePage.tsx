import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { updateOwnProfileRequestSchema, type UserDetail } from "@fitburn/contracts";
import { errorMessage } from "../lib/auth/api";
import { useAuth } from "../lib/auth/AuthContext";
import { isClientUser } from "../lib/auth/areas";
import { formatLocalDate } from "../lib/agenda/format";
import { getMyProfile, updateMyProfile } from "../lib/profile/api";
import { ErrorState, Feedback, LoadingState } from "../components/states";
import { MyPlanSection } from "./plans/MyPlanSection";
import { RequiresNetwork } from "../components/RequiresNetwork";

interface FormState {
  fullName: string;
  email: string;
  phone: string;
  birthDate: string;
  document: string;
  address: string;
}

function toForm(profile: UserDetail): FormState {
  return {
    fullName: profile.fullName,
    email: profile.email,
    phone: profile.phone ?? "",
    birthDate: profile.birthDate ?? "",
    document: profile.document ?? "",
    address: profile.address ?? "",
  };
}

/** Campo opcional em branco vira nulo: é como a API limpa o dado. */
function blankToNull(value: string): string | null {
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

function initialsOf(fullName: string): string {
  const words = fullName.split(/\s+/).filter(Boolean);
  const first = words[0]?.[0] ?? "";
  const last = words.length > 1 ? (words[words.length - 1]?.[0] ?? "") : "";
  return (first + last).toUpperCase();
}

const FIELDS: Array<{
  key: keyof FormState;
  label: string;
  type: string;
  wide?: boolean;
  autoComplete?: string;
}> = [
  { key: "fullName", label: "Nome completo", type: "text", autoComplete: "name" },
  { key: "email", label: "E-mail", type: "email", autoComplete: "email" },
  { key: "phone", label: "Telefone", type: "tel", autoComplete: "tel" },
  { key: "birthDate", label: "Data de nascimento", type: "date", autoComplete: "bday" },
  { key: "document", label: "CPF", type: "text" },
  { key: "address", label: "Endereço", type: "text", wide: true, autoComplete: "street-address" },
];

function viewValue(profile: UserDetail, key: keyof FormState): string {
  if (key === "birthDate") return profile.birthDate ? formatLocalDate(profile.birthDate) : "—";
  return profile[key] || "—";
}

/**
 * Perfil / Minha conta (PerfilDesktop.dc.html / PerfilMobile.dc.html): os
 * dados pessoais de quem está logado, com modo de visualização e de edição, e
 * o logout. Serve ao cliente (casca escura) e à equipe (casca administrativa,
 * clara). Perfil de acesso, status e senha não aparecem para edição.
 */
export function ProfilePage() {
  const { user, logout, updateIdentity } = useAuth();
  const queryClient = useQueryClient();
  const profileQuery = useQuery({ queryKey: ["me"], queryFn: getMyProfile });
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<FormState | null>(null);
  const [error, setError] = useState<string | null>(null);

  const saveMutation = useMutation({
    mutationFn: updateMyProfile,
    onSuccess: (saved) => {
      queryClient.setQueryData(["me"], saved);
      updateIdentity({ fullName: saved.fullName, email: saved.email });
      setEditing(false);
      setForm(null);
      setError(null);
    },
    onError: (failure) => setError(errorMessage(failure, "Não foi possível salvar as alterações.")),
  });

  const profile = profileQuery.data;
  const light = user ? !isClientUser(user) : false;

  function startEdit() {
    if (!profile) return;
    setForm(toForm(profile));
    setError(null);
    setEditing(true);
  }

  function cancelEdit() {
    setEditing(false);
    setForm(null);
    setError(null);
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!form) return;
    const parsed = updateOwnProfileRequestSchema.safeParse({
      fullName: form.fullName,
      email: form.email,
      phone: blankToNull(form.phone),
      birthDate: blankToNull(form.birthDate),
      document: blankToNull(form.document),
      address: blankToNull(form.address),
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Dados inválidos.");
      return;
    }
    setError(null);
    saveMutation.mutate(parsed.data);
  }

  return (
    <div className={`fb-profile${light ? " fb-profile--light" : ""}`}>
      <h1 className="fb-profile__title">{light ? "Minha conta" : "Perfil"}</h1>

      {profileQuery.isLoading && <LoadingState surface="dark" />}
      {profileQuery.isError && (
        <ErrorState
          surface="dark"
          message="Não foi possível carregar os seus dados."
          onRetry={() => void profileQuery.refetch()}
        />
      )}

      {profile && (
        <>
          <div className="fb-profile__identity">
            <span className="fb-profile__avatar" aria-hidden="true">
              {initialsOf(profile.fullName)}
            </span>
            <div className="fb-profile__identity-text">
              <span className="fb-profile__name">{profile.fullName}</span>
              <span className="fb-profile__email">{profile.email}</span>
            </div>
          </div>

          <section className="fb-profile__card" aria-labelledby="fb-profile-data">
            <div className="fb-profile__card-head">
              <h2 id="fb-profile-data" className="fb-profile__card-title">
                Dados pessoais
              </h2>
              {!editing && (
                <button type="button" className="fb-profile__link-btn" onClick={startEdit}>
                  Editar
                </button>
              )}
            </div>

            {!editing && (
              <dl className="fb-profile__grid">
                {FIELDS.map(({ key, label, wide }) => (
                  <div key={key} className={`fb-profile__item${wide ? " fb-profile__wide" : ""}`}>
                    <dt className="fb-profile__label">{label}</dt>
                    <dd className="fb-profile__value">{viewValue(profile, key)}</dd>
                  </div>
                ))}
              </dl>
            )}

            {editing && form && (
              <form className="fb-profile__form" onSubmit={submit} noValidate>
                <div className="fb-profile__grid">
                  {FIELDS.map(({ key, label, type, wide, autoComplete }) => (
                    <label
                      key={key}
                      className={`fb-profile__field${wide ? " fb-profile__wide" : ""}`}
                    >
                      <span className="fb-profile__field-label">{label}</span>
                      <input
                        id={`fb-profile-${key}`}
                        className="fb-profile__input"
                        type={type}
                        autoComplete={autoComplete}
                        value={form[key]}
                        onChange={(event) => setForm({ ...form, [key]: event.target.value })}
                      />
                    </label>
                  ))}
                </div>

                {error && (
                  <Feedback tone="error" surface="dark">
                    {error}
                  </Feedback>
                )}

                <div className="fb-profile__actions">
                  <button
                    type="button"
                    className="fb-profile__btn fb-profile__btn--ghost"
                    onClick={cancelEdit}
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="fb-profile__btn fb-profile__btn--primary"
                    disabled={saveMutation.isPending}
                  >
                    Salvar alterações
                  </button>
                </div>
              </form>
            )}
          </section>
        </>
      )}

      {!light && <MyPlanSection />}

      <div className="fb-profile__divider" aria-hidden="true" />

      <RequiresNetwork>
        <button type="button" className="fb-profile__logout" onClick={() => void logout()}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path
              d="M6 14H3.5C2.7 14 2 13.3 2 12.5V3.5C2 2.7 2.7 2 3.5 2H6"
              stroke="currentColor"
              strokeWidth="1.4"
              strokeLinecap="round"
            />
            <path
              d="M10.5 11L14 8L10.5 5"
              stroke="currentColor"
              strokeWidth="1.4"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path d="M14 8H6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
          </svg>
          Sair da conta
        </button>
      </RequiresNetwork>
    </div>
  );
}
