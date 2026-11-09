import { useId, useState, type FormEvent } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import type { CurrentUser } from "@fitburn/contracts";
import { FlameMark } from "../components/icons/FlameMark";
import { RequiresNetwork } from "../components/RequiresNetwork";
import { ThemeToggle } from "../components/ThemeToggle";
import { useHostThemeToggle } from "../components/themeToggleHost";
import { Alert } from "../components/ui/Alert";
import { Button } from "../components/ui/Button";
import { Field } from "../components/ui/Field";
import { OfflineState } from "../components/ui/States";
import { useOnline } from "../lib/connectivity/useOnline";
import { useAuth } from "../lib/auth/AuthContext";
import { homeRouteFor } from "../lib/auth/areas";
import "./LoginPage.css";

// "/" não conta como rota original a preservar: é só o destino genérico, e
// cada perfil tem o seu (homeRouteFor). Uma rota mais específica (ex.:
// /agenda) é sempre preservada; se ela for da área do outro perfil, o
// AreaRoute leva à equivalente da área certa. Usado tanto pelo redirecionamento pós-submit quanto pelo de
// sessão já restaurada — os dois precisam concordar, ou um sobrescreve o
// destino com "from" do outro na re-renderização que o login dispara.
function resolveDestination(user: CurrentUser, from: string | undefined): string {
  return from && from !== "/" ? from : homeRouteFor(user);
}

export function LoginPage() {
  const errorId = useId();
  const { login, user, isAuthenticated, isInitializing } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const online = useOnline();
  const offline = !online;
  // O botão de tema fica no cabeçalho desta tela (ela não tem a casca do cliente): o AppShell não desenha o fixo.
  useHostThemeToggle();
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
    // Clique duplo ou Enter repetido durante o envio não dispara um segundo login.
    if (isSubmitting) return;
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
    <main id="conteudo" tabIndex={-1} className="login-page">
      <header className="login-page__top">
        <span className="login-page__brand">
          <FlameMark className="login-page__brand-mark" />
          FITBURN
          <span className="login-page__brand-reg">®</span>
        </span>
        <ThemeToggle inline />
      </header>

      <div className="login-page__container">
        <form className="login-card" onSubmit={handleSubmit}>
          <div className="login-card__header">
            <p className="fb-kicker login-card__kicker">Fitburn Brasil</p>
            <h1 className="login-card__title">
              Bem-vindo <em className="fb-em">de volta</em>
            </h1>
            <p className="login-card__subtitle">Entre com suas credenciais para continuar.</p>
          </div>

          {showError && (
            <Alert id={errorId}>Não foi possível entrar. Verifique seu e-mail e senha e tente novamente.</Alert>
          )}

          <Field
            label="E-mail"
            type="email"
            placeholder="seuemail@exemplo.com"
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />

          <Field
            label="Senha"
            type={passwordVisible ? "text" : "password"}
            placeholder="••••••••"
            autoComplete="current-password"
            aria-invalid={showError || undefined}
            aria-describedby={showError ? errorId : undefined}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
            trailing={
              <Button
                variant="ghost"
                size="sm"
                aria-label={passwordVisible ? "Ocultar senha" : "Mostrar senha"}
                onClick={() => setPasswordVisible((visible) => !visible)}
              >
                {passwordVisible ? "Ocultar" : "Mostrar"}
              </Button>
            }
          />

          {offline && <OfflineState description="Entrar precisa de internet. Confira a conexão e tente de novo." />}

          <RequiresNetwork>
            <Button type="submit" variant="primary" block busy={isSubmitting}>
              {isSubmitting ? "Entrando…" : "Entrar"}
            </Button>
          </RequiresNetwork>
        </form>

        <p className="login-page__note">Acesso restrito a alunos e equipe Fitburn.</p>
        <nav className="login-page__legal-links" aria-label="Documentos legais">
          <Link to="/privacidade">Política de privacidade</Link>
          <Link to="/termos">Termos de uso</Link>
        </nav>
      </div>
    </main>
  );
}
