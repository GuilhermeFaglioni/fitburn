import { useId, useState, type FormEvent } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { Module, PermissionAction, type CurrentUser } from "@fitburn/contracts";
import { EyeIcon } from "../components/icons/EyeIcon";
import { EyeOffIcon } from "../components/icons/EyeOffIcon";
import { useAuth } from "../lib/auth/AuthContext";
import "./LoginPage.css";

function defaultRouteFor(user: CurrentUser): string {
  const canViewDashboard = user.permissions
    .find((permission) => permission.module === Module.DASHBOARD)
    ?.actions.includes(PermissionAction.VIEW);
  return canViewDashboard ? "/dashboard" : "/";
}

// "/" não conta como rota original a preservar: é só o destino genérico, e
// cada perfil tem o seu (Início para cliente, Dashboard para
// administrador). Uma rota mais específica (ex.: /agenda) é sempre
// preservada. Usado tanto pelo redirecionamento pós-submit quanto pelo de
// sessão já restaurada — os dois precisam concordar, ou um sobrescreve o
// destino com "from" do outro na re-renderização que o login dispara.
function resolveDestination(user: CurrentUser, from: string | undefined): string {
  return from && from !== "/" ? from : defaultRouteFor(user);
}

export function LoginPage() {
  const emailId = useId();
  const passwordId = useId();
  const { login, user, isAuthenticated, isInitializing } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from;

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showError, setShowError] = useState(false);

  // Sessão já restaurada silenciosamente (reload, ou aba antiga ainda válida)
  // — não faz sentido mostrar o formulário de novo, manda direto para onde
  // essa sessão levaria.
  if (!isInitializing && isAuthenticated && user) {
    return <Navigate to={resolveDestination(user, from)} replace />;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setShowError(false);
    setIsSubmitting(true);
    try {
      const loggedInUser = await login(email, password);
      navigate(resolveDestination(loggedInUser, from), { replace: true });
    } catch {
      setShowError(true);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="login-page">
      <div className="login-page__container">
        <div className="login-page__logo">
          <span className="login-page__logo-mark">FITBURN</span>
          <span className="login-page__logo-reg">®</span>
        </div>

        <form className="login-form" onSubmit={handleSubmit}>
          <div className="login-form__header">
            <h1 className="login-form__title">Bem-vindo de volta</h1>
            <p className="login-form__subtitle">Entre com suas credenciais para continuar.</p>
          </div>

          {showError && (
            <div className="login-form__error" role="alert">
              <svg
                width="16"
                height="16"
                viewBox="0 0 16 16"
                fill="none"
                className="login-form__error-icon"
                aria-hidden="true"
              >
                <circle cx="8" cy="8" r="7" stroke="#ff6d5a" strokeWidth="1.4" />
                <path d="M8 4.5V8.5" stroke="#ff6d5a" strokeWidth="1.4" strokeLinecap="round" />
                <circle cx="8" cy="11.2" r="0.9" fill="#ff6d5a" />
              </svg>
              <span className="login-form__error-text">
                Não foi possível entrar. Verifique seu e-mail e senha e tente novamente.
              </span>
            </div>
          )}

          <div className="login-form__field">
            <label className="login-form__label" htmlFor={emailId}>
              E-mail
            </label>
            <input
              id={emailId}
              type="email"
              className="login-form__input"
              placeholder="seuemail@exemplo.com"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
          </div>

          <div className="login-form__field">
            <label className="login-form__label" htmlFor={passwordId}>
              Senha
            </label>
            <div className="login-form__password-wrapper">
              <input
                id={passwordId}
                type={passwordVisible ? "text" : "password"}
                className="login-form__input login-form__password-input"
                placeholder="••••••••"
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
              />
              <button
                type="button"
                className="login-form__toggle"
                aria-label={passwordVisible ? "Ocultar senha" : "Mostrar senha"}
                onClick={() => setPasswordVisible((visible) => !visible)}
              >
                {passwordVisible ? <EyeOffIcon /> : <EyeIcon />}
              </button>
            </div>
          </div>

          <button type="submit" className="login-form__submit" disabled={isSubmitting}>
            {isSubmitting ? (
              <>
                <svg
                  className="login-form__spinner"
                  width="16"
                  height="16"
                  viewBox="0 0 16 16"
                  fill="none"
                  aria-hidden="true"
                >
                  <circle cx="8" cy="8" r="6.5" stroke="rgba(255,255,255,0.35)" strokeWidth="2" />
                  <path
                    d="M14.5 8A6.5 6.5 0 0 0 8 1.5"
                    stroke="#ffffff"
                    strokeWidth="2"
                    strokeLinecap="round"
                  />
                </svg>
                <span className="login-form__submit-label">Entrando…</span>
              </>
            ) : (
              <span className="login-form__submit-label">Entrar</span>
            )}
          </button>
        </form>

        <p className="login-page__footer">Acesso restrito a alunos e equipe Fitburn.</p>
      </div>
    </div>
  );
}
