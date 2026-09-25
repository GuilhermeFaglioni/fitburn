import { useId, useState, type FormEvent } from "react";
import { ApiError } from "../lib/auth/api";
import { createClient } from "../lib/users/api";

const ERROR_MESSAGES: Record<string, string> = {
  EMAIL_ALREADY_IN_USE: "Este e-mail já está em uso.",
  DOCUMENT_ALREADY_IN_USE: "Este documento já está em uso.",
  VALIDATION_ERROR: "Confira os campos e tente novamente.",
};

export function ClientCreateForm({ onCreated }: { onCreated: () => void }) {
  const formId = useId();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [documentNumber, setDocumentNumber] = useState("");
  const [address, setAddress] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage(null);
    setIsSubmitting(true);
    try {
      await createClient({
        fullName,
        email,
        phone,
        birthDate,
        document: documentNumber,
        address,
        password,
      });
      onCreated();
    } catch (error) {
      setErrorMessage(
        error instanceof ApiError
          ? (ERROR_MESSAGES[error.code] ?? error.message)
          : "Não foi possível cadastrar o cliente.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} aria-label="Cadastro de cliente">
      {errorMessage && <p role="alert">{errorMessage}</p>}

      <label htmlFor={`${formId}-fullName`}>Nome completo</label>
      <input
        id={`${formId}-fullName`}
        value={fullName}
        onChange={(event) => setFullName(event.target.value)}
        required
      />

      <label htmlFor={`${formId}-email`}>E-mail</label>
      <input
        id={`${formId}-email`}
        type="email"
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        required
      />

      <label htmlFor={`${formId}-phone`}>Telefone</label>
      <input
        id={`${formId}-phone`}
        value={phone}
        onChange={(event) => setPhone(event.target.value)}
        required
      />

      <label htmlFor={`${formId}-birthDate`}>Data de nascimento</label>
      <input
        id={`${formId}-birthDate`}
        type="date"
        value={birthDate}
        onChange={(event) => setBirthDate(event.target.value)}
        required
      />

      <label htmlFor={`${formId}-document`}>Documento</label>
      <input
        id={`${formId}-document`}
        value={documentNumber}
        onChange={(event) => setDocumentNumber(event.target.value)}
        required
      />

      <label htmlFor={`${formId}-address`}>Endereço</label>
      <input
        id={`${formId}-address`}
        value={address}
        onChange={(event) => setAddress(event.target.value)}
        required
      />

      <label htmlFor={`${formId}-password`}>Senha inicial</label>
      <input
        id={`${formId}-password`}
        type="password"
        value={password}
        onChange={(event) => setPassword(event.target.value)}
        required
        minLength={8}
      />

      <button type="submit" disabled={isSubmitting}>
        {isSubmitting ? "Cadastrando…" : "Cadastrar cliente"}
      </button>
    </form>
  );
}
