import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { Module, PermissionAction } from "@fitburn/contracts";
import { ApiError } from "../lib/auth/api";
import { useAuth } from "../lib/auth/AuthContext";
import { createClientRecord } from "../lib/clients/api";
import { Alert } from "../components/ui/Alert";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { Field } from "../components/ui/Field";
import { PageHeader } from "../components/ui/PageHeader";
import { Select } from "../components/ui/Select";

/** Quanto tempo a faixa de sucesso fica na tela antes de voltar para a lista. */
const SUCCESS_REDIRECT_MS = 1500;

/** Perfis de acesso do design. Só "Cliente" é criado por este formulário (POST /clients). */
const ACCESS_PROFILES = ["Cliente", "Professor", "Funcionário administrativo", "Administrador"];

const EMAIL_TAKEN = "Este e-mail já está cadastrado.";
const DOCUMENT_TAKEN = "Este CPF já está cadastrado.";

/**
 * Cadastro de cliente em tela cheia (D-038, #156): trilha, título e um `Card` com o formulário em duas colunas.
 * Estados: erro de e-mail e de CPF sob o campo (`aria-invalid` e `aria-describedby`), aviso geral da API e faixa de
 * sucesso antes de voltar para a listagem.
 */
export function ClientCreatePage() {
  const { can } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
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

  async function handleSubmit(event: FormEvent) {
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
        document: documentNumber.trim() || undefined,
        address: address.trim() || undefined,
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
    <div className="fb-ui-page">
      {created && (
        <Alert tone="ok">
          Cliente cadastrado com sucesso. Voltando para a listagem de clientes…
        </Alert>
      )}

      <PageHeader
        crumb={
          <>
            <Link to="/clientes" className="fb-ui-link">
              Clientes
            </Link>{" "}
            / Novo cliente
          </>
        }
        kicker="Cadastro"
        title="Novo cliente"
      />

      {!canCreate && <Alert>Você não tem permissão para cadastrar clientes.</Alert>}
      {formError && <Alert>{formError}</Alert>}

      <Card
        as="form"
        className="fb-ui-card--form"
        aria-label="Cadastro de cliente"
        onSubmit={handleSubmit}
      >
        <div className="fb-ui-form-grid">
          <Field
            className="fb-ui-field--full"
            label="Nome completo *"
            type="text"
            placeholder="Nome e sobrenome"
            value={fullName}
            onChange={(event) => setFullName(event.target.value)}
            required
          />
          <Field
            label="E-mail *"
            type="email"
            placeholder="email@exemplo.com"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            error={emailError ?? undefined}
            required
          />
          <Field
            label="Telefone *"
            type="tel"
            placeholder="(00) 00000-0000"
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            required
          />
          <Field
            label="Data de nascimento *"
            type="date"
            value={birthDate}
            onChange={(event) => setBirthDate(event.target.value)}
            required
          />
          <Field
            label="CPF (opcional)"
            type="text"
            placeholder="000.000.000-00"
            value={documentNumber}
            onChange={(event) => setDocumentNumber(event.target.value)}
            error={documentError ?? undefined}
          />
          <Field
            className="fb-ui-field--full"
            label="Endereço (opcional)"
            type="text"
            placeholder="Rua, número, bairro, cidade"
            value={address}
            onChange={(event) => setAddress(event.target.value)}
          />
          {/* Este formulário só cria clientes (POST /clients): os outros perfis aparecem como no design, sem seleção. */}
          <Select
            label="Perfil de acesso *"
            value="Cliente"
            help="Somente administradores podem alterar o perfil de acesso."
            onChange={() => undefined}
          >
            {ACCESS_PROFILES.map((profile) => (
              <option key={profile} value={profile} disabled={profile !== "Cliente"}>
                {profile}
              </option>
            ))}
          </Select>
          <Field
            label="Senha inicial *"
            type="password"
            placeholder="••••••••"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            help="Definida por você ou gerada e comunicada ao cliente fora do sistema."
            required
            minLength={8}
          />
        </div>

        <div className="fb-ui-form-actions">
          <Button onClick={() => navigate("/clientes")}>Cancelar</Button>
          <Button
            type="submit"
            variant="primary"
            busy={isSubmitting}
            disabled={created || !canCreate}
          >
            Salvar cliente
          </Button>
        </div>
      </Card>
    </div>
  );
}
