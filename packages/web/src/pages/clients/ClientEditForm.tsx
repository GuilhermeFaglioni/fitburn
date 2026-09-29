import { useId, useState, type FormEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { UserDetail } from "@fitburn/contracts";
import { ApiError } from "../../lib/auth/api";
import { updateClientRecord } from "../../lib/clients/api";

const ERROR_MESSAGES: Record<string, string> = {
  EMAIL_ALREADY_IN_USE: "Este e-mail já está em uso.",
  DOCUMENT_ALREADY_IN_USE: "Este documento já está em uso.",
  VALIDATION_ERROR: "Confira os campos e tente novamente.",
};

/** Edição dos dados pessoais de um cliente (sem perfil de acesso, status nem senha). */
export function ClientEditForm({ client, onDone }: { client: UserDetail; onDone: () => void }) {
  const formId = useId();
  const queryClient = useQueryClient();
  const [fullName, setFullName] = useState(client.fullName);
  const [email, setEmail] = useState(client.email);
  const [phone, setPhone] = useState(client.phone ?? "");
  const [birthDate, setBirthDate] = useState(client.birthDate ?? "");
  const [documentNumber, setDocumentNumber] = useState(client.document ?? "");
  const [address, setAddress] = useState(client.address ?? "");

  const mutation = useMutation({
    mutationFn: () =>
      updateClientRecord(client.id, {
        fullName,
        email,
        phone: phone || null,
        birthDate: birthDate || null,
        document: documentNumber || null,
        address: address || null,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["clients"] });
      onDone();
    },
  });

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    mutation.mutate();
  }

  const error = mutation.error;
  const errorMessage = error
    ? error instanceof ApiError
      ? (ERROR_MESSAGES[error.code] ?? error.message)
      : "Não foi possível salvar o cliente."
    : null;

  const fields: Array<[string, string, string, (value: string) => void, string?]> = [
    ["fullName", "Nome completo", fullName, setFullName],
    ["email", "E-mail", email, setEmail, "email"],
    ["phone", "Telefone", phone, setPhone],
    ["birthDate", "Data de nascimento", birthDate, setBirthDate, "date"],
    ["document", "Documento", documentNumber, setDocumentNumber],
    ["address", "Endereço", address, setAddress],
  ];

  return (
    <form onSubmit={handleSubmit} aria-label="Edição de cliente" className="fb-form">
      {errorMessage && <p role="alert">{errorMessage}</p>}
      {fields.map(([name, label, value, setValue, type]) => (
        <div key={name} style={{ display: "contents" }}>
          <label htmlFor={`${formId}-${name}`}>{label}</label>
          <input
            id={`${formId}-${name}`}
            className="fb-field"
            type={type ?? "text"}
            value={value}
            onChange={(event) => setValue(event.target.value)}
            required={name === "fullName" || name === "email"}
          />
        </div>
      ))}
      <div style={{ display: "flex", gap: 10 }}>
        <button type="submit" className="fb-btn-primary" disabled={mutation.isPending}>
          {mutation.isPending ? "Salvando…" : "Salvar"}
        </button>
        <button type="button" className="fb-row-btn" onClick={onDone}>
          Cancelar
        </button>
      </div>
    </form>
  );
}
