import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  changeOwnPasswordRequestSchema,
  updateOwnProfileRequestSchema,
  type UserDetail,
} from "@fitburn/contracts";
import { ApiError, errorMessage } from "../lib/auth/api";
import { useAuth } from "../lib/auth/AuthContext";
import { isClientUser } from "../lib/auth/areas";
import { formatLocalDate } from "../lib/agenda/format";
import { getMyProfile, updateMyProfile } from "../lib/profile/api";
import { QueryBlockState } from "../components/QueryBlockState";
import { RequiresNetwork } from "../components/RequiresNetwork";
import { Alert } from "../components/ui/Alert";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { Field } from "../components/ui/Field";
import { MyPlanSection } from "./plans/MyPlanSection";
import { RankingConsentControl } from "./gamification/RankingConsentControl";

interface FormState {
  fullName: string;
  email: string;
  phone: string;
  birthDate: string;
  document: string;
  address: string;
}

type PasswordField = "currentPassword" | "newPassword";

/**
 * Problema de um formulário: a mensagem vai no campo indicado (`aria-invalid` e `aria-describedby`); sem campo, é um
 * aviso do formulário. `alsoInvalid` marca outros campos sem repetir a mensagem (uma só mensagem anunciada).
 */
interface Issue<K extends string> {
  message: string;
  field: K | null;
  alsoInvalid?: K[];
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

function isFormField(path: unknown): path is keyof FormState {
  return typeof path === "string" && FIELDS.some(({ key }) => key === path);
}

function isPasswordField(path: unknown): path is PasswordField {
  return path === "currentPassword" || path === "newPassword";
}

/** O campo de um erro da API que a tela sabe apontar; os demais ficam como aviso do formulário. */
function profileFailure(failure: unknown): Issue<keyof FormState> {
  const message = errorMessage(failure, "Não foi possível salvar as alterações.");
  const onEmail = failure instanceof ApiError && failure.code === "EMAIL_ALREADY_IN_USE";
  return { message, field: onEmail ? "email" : null };
}

function passwordFailure(failure: unknown): Issue<PasswordField> {
  const message = errorMessage(failure, "Não foi possível alterar a senha.");
  const onCurrent = failure instanceof ApiError && failure.code === "CURRENT_PASSWORD_INVALID";
  return { message, field: onCurrent ? "currentPassword" : null };
}

/**
 * Perfil / Minha conta (D-038, tela extrapolada da base; referência: seção "Perfil" do preview): o cabeçalho com o
 * avatar de iniciais, os dados pessoais, o plano (só cliente), a troca de senha, a participação no ranking (só
 * cliente) e a saída. Serve ao cliente e à equipe (casca administrativa); perfil de acesso e status não aparecem para
 * edição. Também é a etapa de troca obrigatória de senha do onboarding (`requiredPasswordChange`).
 */
export function ProfilePage({
  requiredPasswordChange = false,
}: {
  requiredPasswordChange?: boolean;
}) {
  const { user, logout, updateIdentity, changeOwnPassword } = useAuth();
  const queryClient = useQueryClient();
  const profileQuery = useQuery({
    queryKey: ["me"],
    queryFn: getMyProfile,
    enabled: !requiredPasswordChange,
  });
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<FormState | null>(null);
  const [issue, setIssue] = useState<Issue<keyof FormState> | null>(null);
  const [changingPassword, setChangingPassword] = useState(requiredPasswordChange);
  const [passwordForm, setPasswordForm] = useState({ currentPassword: "", newPassword: "" });
  const [passwordIssue, setPasswordIssue] = useState<Issue<PasswordField> | null>(null);
  const [passwordMessage, setPasswordMessage] = useState<string | null>(null);

  const saveMutation = useMutation({
    mutationFn: updateMyProfile,
    onSuccess: (saved) => {
      queryClient.setQueryData(["me"], saved);
      updateIdentity({ fullName: saved.fullName, email: saved.email });
      setEditing(false);
      setForm(null);
      setIssue(null);
    },
    onError: (failure) => setIssue(profileFailure(failure)),
  });

  const passwordMutation = useMutation({
    mutationFn: ({
      currentPassword,
      newPassword,
    }: {
      currentPassword: string;
      newPassword: string;
    }) => changeOwnPassword(currentPassword, newPassword),
    onSuccess: () => {
      setPasswordForm({ currentPassword: "", newPassword: "" });
      setChangingPassword(false);
      setPasswordIssue(null);
      setPasswordMessage("Senha alterada com sucesso.");
    },
    onError: (failure) => setPasswordIssue(passwordFailure(failure)),
  });

  const profile = profileQuery.data;
  const isClient = user ? isClientUser(user) : false;
  const light = user ? !isClient : false;

  function startEdit() {
    if (!profile) return;
    setForm(toForm(profile));
    setIssue(null);
    setEditing(true);
  }

  function cancelEdit() {
    setEditing(false);
    setForm(null);
    setIssue(null);
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!form) return;
    if (isClient && (!form.phone.trim() || !form.birthDate.trim())) {
      const blank = (["phone", "birthDate"] as const).filter((key) => !form[key].trim());
      setIssue({
        message: "Telefone e data de nascimento são obrigatórios.",
        field: blank[0] ?? null,
        alsoInvalid: blank.slice(1),
      });
      return;
    }
    const parsed = updateOwnProfileRequestSchema.safeParse({
      fullName: form.fullName,
      email: form.email,
      phone: blankToNull(form.phone),
      birthDate: blankToNull(form.birthDate),
      document: blankToNull(form.document),
      address: blankToNull(form.address),
    });
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      const path = first?.path[0];
      setIssue({
        message: first?.message ?? "Dados inválidos.",
        field: isFormField(path) ? path : null,
      });
      return;
    }
    setIssue(null);
    saveMutation.mutate(parsed.data);
  }

  function startPasswordChange() {
    setPasswordForm({ currentPassword: "", newPassword: "" });
    setPasswordIssue(null);
    setPasswordMessage(null);
    setChangingPassword(true);
  }

  function cancelPasswordChange() {
    setPasswordForm({ currentPassword: "", newPassword: "" });
    setPasswordIssue(null);
    setChangingPassword(false);
    passwordMutation.reset();
  }

  function submitPasswordChange(event: FormEvent) {
    event.preventDefault();
    const parsed = changeOwnPasswordRequestSchema.safeParse(passwordForm);
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      const path = first?.path[0];
      setPasswordIssue({
        message: first?.message ?? "Dados inválidos.",
        field: isPasswordField(path) ? path : null,
      });
      return;
    }
    setPasswordIssue(null);
    setPasswordMessage(null);
    passwordMutation.mutate(parsed.data);
  }

  const fieldError = (key: keyof FormState) => (issue?.field === key ? issue.message : undefined);
  const fieldInvalid = (key: keyof FormState) =>
    issue?.alsoInvalid?.includes(key) ? true : undefined;
  const passwordFieldError = (key: PasswordField) =>
    passwordIssue?.field === key ? passwordIssue.message : undefined;

  return (
    <div className="fb-profile">
      <h1 className="fb-profile__title">
        {requiredPasswordChange ? "Troca obrigatória de senha" : light ? "Minha conta" : "Perfil"}
      </h1>

      {requiredPasswordChange && (
        <p className="fb-profile__lead">
          Defina uma senha pessoal para liberar o acesso ao Fitburn.
        </p>
      )}

      {!requiredPasswordChange && (
        <QueryBlockState
          query={profileQuery}
          loading="Carregando…"
          error="Não foi possível carregar os seus dados."
          hasData={profile !== undefined}
        />
      )}

      {!requiredPasswordChange && profile && (
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

          <Card as="section" flat className="fb-profile__card" aria-labelledby="fb-profile-data">
            <div className="fb-profile__card-head">
              <h2 id="fb-profile-data" className="fb-profile__card-title">
                Dados pessoais
              </h2>
              {!editing && (
                <Button variant="soft" size="sm" onClick={startEdit}>
                  Editar
                </Button>
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
                    <Field
                      key={key}
                      id={`fb-profile-${key}`}
                      className={wide ? "fb-profile__wide" : undefined}
                      label={label}
                      type={type}
                      autoComplete={autoComplete}
                      required={isClient && (key === "phone" || key === "birthDate")}
                      value={form[key]}
                      error={fieldError(key)}
                      aria-invalid={fieldInvalid(key)}
                      onChange={(event) => setForm({ ...form, [key]: event.target.value })}
                    />
                  ))}
                </div>

                {issue && issue.field === null && <Alert>{issue.message}</Alert>}

                <div className="fb-profile__actions">
                  <Button variant="ghost" onClick={cancelEdit}>
                    Cancelar
                  </Button>
                  <Button type="submit" variant="primary" busy={saveMutation.isPending}>
                    Salvar alterações
                  </Button>
                </div>
              </form>
            )}
          </Card>
        </>
      )}

      {!requiredPasswordChange && !light && <MyPlanSection />}

      {(requiredPasswordChange || profile) && (
        <Card as="section" flat className="fb-profile__card" aria-labelledby="fb-profile-password">
          <div className="fb-profile__card-head">
            <h2 id="fb-profile-password" className="fb-profile__card-title">
              {requiredPasswordChange ? "Defina uma nova senha" : "Senha"}
            </h2>
            {!requiredPasswordChange && !changingPassword && (
              <Button variant="soft" size="sm" onClick={startPasswordChange}>
                Alterar senha
              </Button>
            )}
          </div>

          {passwordMessage && <Alert tone="ok">{passwordMessage}</Alert>}

          {changingPassword ? (
            <form className="fb-profile__form" onSubmit={submitPasswordChange} noValidate>
              <div className="fb-profile__grid">
                <Field
                  label="Senha atual"
                  type="password"
                  autoComplete="current-password"
                  value={passwordForm.currentPassword}
                  error={passwordFieldError("currentPassword")}
                  onChange={(event) =>
                    setPasswordForm({ ...passwordForm, currentPassword: event.target.value })
                  }
                />
                <Field
                  label="Nova senha"
                  type="password"
                  autoComplete="new-password"
                  value={passwordForm.newPassword}
                  error={passwordFieldError("newPassword")}
                  onChange={(event) =>
                    setPasswordForm({ ...passwordForm, newPassword: event.target.value })
                  }
                />
              </div>

              {passwordIssue && passwordIssue.field === null && (
                <Alert>{passwordIssue.message}</Alert>
              )}

              <div className="fb-profile__actions">
                {!requiredPasswordChange && (
                  <Button
                    variant="ghost"
                    onClick={cancelPasswordChange}
                    disabled={passwordMutation.isPending}
                  >
                    Cancelar troca de senha
                  </Button>
                )}
                <Button type="submit" variant="primary" busy={passwordMutation.isPending}>
                  {passwordMutation.isPending ? "Alterando…" : "Salvar nova senha"}
                </Button>
              </div>
            </form>
          ) : (
            !requiredPasswordChange && (
              <p className="fb-profile__password-hint">
                Informe a senha atual para definir uma nova senha.
              </p>
            )
          )}
        </Card>
      )}

      {!requiredPasswordChange && isClient && profile && (
        <RankingConsentControl surface="profile" />
      )}

      <div className="fb-profile__exit">
        <RequiresNetwork>
          <Button variant="ghost" onClick={() => void logout()}>
            <svg
              width="16"
              height="16"
              viewBox="0 0 16 16"
              fill="none"
              aria-hidden="true"
              focusable="false"
            >
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
          </Button>
        </RequiresNetwork>
      </div>
    </div>
  );
}
