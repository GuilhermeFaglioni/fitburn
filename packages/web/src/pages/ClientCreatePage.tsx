import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { Module, PermissionAction } from "@fitburn/contracts";
import { ApiError } from "../lib/auth/api";
import { useAuth } from "../lib/auth/AuthContext";
import { createClientRecord } from "../lib/clients/api";
import { Feedback } from "../components/states";
import "./ClientCreatePage.css";

/** Quanto tempo a faixa de sucesso fica na tela antes de voltar para a lista. */
const SUCCESS_REDIRECT_MS = 1500;

/** Perfis de acesso do design. Só "Cliente" é criado por este formulário (POST /clients). */
const ACCESS_PROFILES = ["Cliente", "Professor", "Funcionário administrativo", "Administrador"];

const EMAIL_TAKEN = "Este e-mail já está cadastrado.";
const DOCUMENT_TAKEN = "Este CPF já está cadastrado.";

/**
 * Cadastro de cliente em tela cheia (Cadastro.dc.html): migalha, título e um cartão com o formulário em duas
 * colunas. Estados do design: erro de e-mail sob o campo e faixa de sucesso antes de voltar para a listagem.
 */
export function ClientCreatePage() {
  const { can } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const id = useId();
  const redirectTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [documentNumber, setDocumentNumber] = useState("");
  const [address, setAddress] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [created, setCreated] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [documentError, setDocumentError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => () => clearTimeout(redirectTimer.current), []);

  const canCreate = can(Module.CLIENTES, PermissionAction.CREATE);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setEmailError(null);
    setDocumentError(null);
    setFormError(null);
    setIsSubmitting(true);
    try {
      await createClientRecord({
        fullName,
        email,
        phone,
        birthDate,
        document: documentNumber,
        address,
        password,
      });
      setCreated(true);
      void queryClient.invalidateQueries({ queryKey: ["clients"] });
      redirectTimer.current = setTimeout(() => navigate("/clientes"), SUCCESS_REDIRECT_MS);
    } catch (error) {
      if (error instanceof ApiError && error.code === "EMAIL_ALREADY_IN_USE") {
        setEmailError(EMAIL_TAKEN);
      } else if (error instanceof ApiError && error.code === "DOCUMENT_ALREADY_IN_USE") {
        setDocumentError(DOCUMENT_TAKEN);
      } else if (error instanceof ApiError && error.code === "VALIDATION_ERROR") {
        setFormError("Confira os campos e tente novamente.");
      } else {
        setFormError(
          error instanceof ApiError ? error.message : "Não foi possível cadastrar o cliente.",
        );
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="fb-cadastro">
      {created && (
        <div role="status" className="fb-cadastro__success">
          Cliente cadastrado com sucesso. Voltando para a listagem de clientes…
        </div>
      )}

      <div className="fb-cadastro__heading">
        <span className="fb-cadastro__crumb">Clientes / Novo cliente</span>
        <h1 className="fb-cadastro__title">Novo cliente</h1>
      </div>

      {!canCreate && (
        <Feedback tone="error">Você não tem permissão para cadastrar clientes.</Feedback>
      )}
      {formError && <Feedback tone="error">{formError}</Feedback>}

      <form className="fb-cadastro__card" aria-label="Cadastro de cliente" onSubmit={handleSubmit}>
        <div className="fb-cadastro__grid">
          <div className="fb-cadastro__field fb-cadastro__field--wide">
            <label htmlFor={`${id}-fullName`}>Nome completo *</label>
            <input
              id={`${id}-fullName`}
              type="text"
              className="fb-field"
              placeholder="Nome e sobrenome"
              value={fullName}
              onChange={(event) => setFullName(event.target.value)}
              required
            />
          </div>

          <div className="fb-cadastro__field">
            <label htmlFor={`${id}-email`}>E-mail *</label>
            <input
              id={`${id}-email`}
              type="email"
              className={`fb-field${emailError ? " fb-field-error" : ""}`}
              placeholder="email@exemplo.com"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              aria-invalid={emailError ? true : undefined}
              aria-describedby={emailError ? `${id}-email-error` : undefined}
              required
            />
            {emailError && (
              <span id={`${id}-email-error`} role="alert" className="fb-cadastro__error">
                {emailError}
              </span>
            )}
          </div>

          <div className="fb-cadastro__field">
            <label htmlFor={`${id}-phone`}>Telefone *</label>
            <input
              id={`${id}-phone`}
              type="tel"
              className="fb-field"
              placeholder="(00) 00000-0000"
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              required
            />
          </div>

          <div className="fb-cadastro__field">
            <label htmlFor={`${id}-birthDate`}>Data de nascimento *</label>
            <input
              id={`${id}-birthDate`}
              type="date"
              className="fb-field"
              value={birthDate}
              onChange={(event) => setBirthDate(event.target.value)}
              required
            />
          </div>

          <div className="fb-cadastro__field">
            <label htmlFor={`${id}-document`}>CPF *</label>
            <input
              id={`${id}-document`}
              type="text"
              className={`fb-field${documentError ? " fb-field-error" : ""}`}
              placeholder="000.000.000-00"
              value={documentNumber}
              onChange={(event) => setDocumentNumber(event.target.value)}
              aria-invalid={documentError ? true : undefined}
              aria-describedby={documentError ? `${id}-document-error` : undefined}
              required
            />
            {documentError && (
              <span id={`${id}-document-error`} role="alert" className="fb-cadastro__error">
                {documentError}
              </span>
            )}
          </div>

          {/* O design não marca o endereço como obrigatório; o contrato da API (createClientRequestSchema) ainda o exige. */}
          <div className="fb-cadastro__field fb-cadastro__field--wide">
            <label htmlFor={`${id}-address`}>Endereço</label>
            <input
              id={`${id}-address`}
              type="text"
              className="fb-field"
              placeholder="Rua, número, bairro, cidade"
              value={address}
              onChange={(event) => setAddress(event.target.value)}
              required
            />
          </div>

          <div className="fb-cadastro__field">
            <label htmlFor={`${id}-profile`}>Perfil de acesso *</label>
            {/* Este formulário só cria clientes (POST /clients): os outros perfis aparecem como no design, sem seleção. */}
            <select
              id={`${id}-profile`}
              className="fb-field"
              value="Cliente"
              aria-describedby={`${id}-profile-hint`}
              onChange={() => undefined}
            >
              {ACCESS_PROFILES.map((profile) => (
                <option key={profile} value={profile} disabled={profile !== "Cliente"}>
                  {profile}
                </option>
              ))}
            </select>
            <span id={`${id}-profile-hint`} className="fb-cadastro__hint">
              Somente administradores podem alterar o perfil de acesso.
            </span>
          </div>

          <div className="fb-cadastro__field">
            <label htmlFor={`${id}-password`}>Senha inicial *</label>
            <input
              id={`${id}-password`}
              type="password"
              className="fb-field"
              placeholder="••••••••"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              aria-describedby={`${id}-password-hint`}
              required
              minLength={8}
            />
            <span id={`${id}-password-hint`} className="fb-cadastro__hint">
              Definida por você ou gerada e comunicada ao cliente fora do sistema.
            </span>
          </div>
        </div>

        <div className="fb-cadastro__footer">
          <button
            type="button"
            className="fb-cadastro__cancel"
            onClick={() => navigate("/clientes")}
          >
            Cancelar
          </button>
          <button
            type="submit"
            className="fb-cadastro__submit"
            disabled={isSubmitting || created || !canCreate}
          >
            {isSubmitting ? "Salvando…" : "Salvar cliente"}
          </button>
        </div>
      </form>
    </div>
  );
}
